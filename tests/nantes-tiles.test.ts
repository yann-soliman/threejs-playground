import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { detailLevel, selectTiles, TileLoader } from '../src/playgrounds/nantes-3d/tiles';
import type { CityManifest, TileChoice, TileEntry, TileResource } from '../src/playgrounds/nantes-3d/tiles';
import { cameraPosition, cityOverviewPose } from '../src/playgrounds/nantes-3d/navigation';
import { createCity } from '../src/playgrounds/nantes-3d/city';
import type { CityData } from '../src/playgrounds/nantes-3d/types';

const empty = { meta: {}, buildings: [], surfaces: [], roads: [], walls: [], trees: [] } as unknown as CityData;
const tile = (id: string, x = 0, z = 0): TileEntry => ({ id, x, z, bounds: [x * 500, z * 500, x * 500 + 500, z * 500 + 500], contentBounds: [x * 500, z * 500, x * 500 + 500, z * 500 + 500], counts: {}, urls: { near: `${id}.near.json`, medium: `${id}.medium.json`, far: `${id}.far.json` }, bytes: { near: 1, medium: 1, far: 1 } });
const choice = (id: string, lod: TileChoice['lod'] = 'near', priority = 0): TileChoice => ({ tile: tile(id), lod, priority });
const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function harness(budget = 100, concurrency = 2) {
  const requests: { choice: TileChoice; signal: AbortSignal; resolve: (data: CityData) => void }[] = [];
  const resources: (TileResource & { id: string })[] = [];
  const attach = vi.fn(), detach = vi.fn(), changed = vi.fn();
  const loader = new TileLoader({
    fetch: (c, signal) => new Promise<CityData>((resolve) => { requests.push({ choice: c, signal, resolve }); }),
    generate: async (_data, c) => { const r = { id: `${c.tile.id}:${c.lod}`, bytes: 40, dispose: vi.fn() }; resources.push(r); return r; },
    attach, detach, changed, failed: vi.fn(),
  }, budget, concurrency);
  return { loader, requests, resources, attach, detach, changed };
}

describe('Sélection géographique et LOD', () => {
  it('applique des seuils avec hystérésis sans oscillation', () => {
    expect(detailLevel(300)).toBe('near'); expect(detailLevel(1500)).toBe('medium'); expect(detailLevel(4000)).toBe('far');
    expect(detailLevel(950, 'near')).toBe('near'); expect(detailLevel(850, 'medium')).toBe('medium');
    expect(detailLevel(2200, 'far')).toBe('far'); expect(detailLevel(1100, 'near')).toBe('medium');
  });
  it('priorise une destination lointaine, exclut le hors-champ et borne les détails', () => {
    const manifest = { tiles: [tile('visible'), tile('behind', 0, 20), tile('destination', 12, 0)] } as CityManifest;
    const camera = new PerspectiveCamera(42, 1.5, 2, 100000); camera.position.set(250, 500, 900); camera.lookAt(250, 0, 250); camera.updateMatrixWorld();
    const ordinary = selectTiles(manifest, camera, new Vector3(250, 0, 250));
    expect(ordinary.some((c) => c.tile.id === 'behind')).toBe(false);
    expect(ordinary.some((c) => c.tile.id === 'destination')).toBe(false);
    const distant = selectTiles(manifest, camera, new Vector3(250, 0, 250), new Map(), new Vector3(6250, 0, 250), 1);
    expect(distant).toHaveLength(1); expect(distant[0]!.tile.id).toBe('destination'); expect(distant[0]!.lod).toBe('near');
  });
  it('cadre le territoire entier sur ordinateur et mobile', () => {
    const bounds = [-6800, -8900, 5600, 3900];
    for (const aspect of [1.7, .8]) {
      const pose = cityOverviewPose(bounds, aspect);
      const camera = new PerspectiveCamera(42, aspect, 2, 100000); camera.position.copy(cameraPosition(pose)); camera.lookAt(pose.target); camera.updateMatrixWorld();
      for (const x of [bounds[0]!, bounds[2]!]) for (const z of [bounds[1]!, bounds[3]!]) {
        const p = new Vector3(x, 0, z).project(camera); expect(Math.abs(p.x)).toBeLessThan(1); expect(Math.abs(p.y)).toBeLessThan(1);
      }
    }
  });
  it('réduit les détails sans déplacer les empreintes et nettoie chaque LOD', () => {
    const data = { ...empty, buildings: [{ id: 'way/1', rings: [[[0, 0], [20, 0], [20, 20], [0, 20]]], tags: { height: '15', 'roof:shape': 'gabled' } }] } as CityData;
    const near = createCity(data, { ground: false, lod: 'near' });
    const medium = createCity(data, { ground: false, lod: 'medium' });
    const far = createCity(data, { ground: false, lod: 'far' });
    expect(near.windows).toBeGreaterThan(0); expect(medium.windows).toBe(0); expect(far.windows).toBe(0);
    expect(far.group.children.length).toBeLessThan(near.group.children.length);
    for (const model of [near, medium, far]) { model.dispose(); model.dispose(); expect(model.group.children).toHaveLength(0); }
  });
});

describe('Cycle de vie du chargeur de tuiles', () => {
  it('borne le réseau, suit les priorités et génère séquentiellement', async () => {
    const h = harness(); h.loader.update([choice('a'), choice('b'), choice('c')]);
    expect(h.requests).toHaveLength(2); expect(h.loader.info.pending).toBe(2);
    h.requests[0]!.resolve(empty); await flush();
    expect(h.requests).toHaveLength(3); expect(h.attach).toHaveBeenCalledTimes(1);
    h.requests[1]!.resolve(empty); h.requests[2]!.resolve(empty); await flush();
    expect(h.loader.info.pending).toBe(0); expect(h.loader.info.bytes).toBeLessThanOrEqual(100);
    h.loader.dispose(); expect(h.resources.every((r) => vi.mocked(r.dispose).mock.calls.length === 1)).toBe(true);
  });
  it('annule les requêtes obsolètes et empêche le montage tardif', async () => {
    const h = harness(); h.loader.update([choice('old')]); h.loader.update([choice('new')]);
    expect(h.requests[0]!.signal.aborted).toBe(true);
    h.requests[0]!.resolve(empty); await flush();
    expect(h.resources.some((r) => r.id.startsWith('old'))).toBe(false);
    h.requests[1]!.resolve(empty); await flush(); expect(h.attach).toHaveBeenCalledTimes(1); h.loader.dispose();
  });
  it('conserve le LOD courant jusqu’au remplacement puis le libère', async () => {
    const h = harness(); h.loader.update([choice('a', 'far')]); h.requests[0]!.resolve(empty); await flush();
    h.loader.update([choice('a', 'near')]); expect(h.loader.levels.get('a')).toBe('far');
    h.requests[1]!.resolve(empty); await flush();
    expect(h.loader.levels.get('a')).toBe('near'); expect(h.detach).toHaveBeenCalledTimes(1);
    expect(h.resources[0]!.dispose).toHaveBeenCalledTimes(1); expect(h.loader.info.bytes).toBe(40); h.loader.dispose();
  });
  it('évince le cache ancien selon le budget et réutilise les visites récentes', async () => {
    const h = harness(80); h.loader.update([choice('a')]); h.requests[0]!.resolve(empty); await flush();
    h.loader.update([choice('b')]); h.requests[1]!.resolve(empty); await flush();
    h.loader.update([choice('a')]); expect(h.requests).toHaveLength(2);
    h.loader.update([choice('c')]); h.requests[2]!.resolve(empty); await flush();
    expect(h.loader.info.bytes).toBeLessThanOrEqual(80); expect(h.resources[1]!.dispose).toHaveBeenCalledTimes(1); h.loader.dispose();
  });
  it('ferme pendant une requête sans callback de rendu ni création ultérieure', async () => {
    const h = harness(); h.loader.update([choice('a')]); h.loader.dispose(); const calls = h.changed.mock.calls.length;
    h.requests[0]!.resolve(empty); await flush();
    expect(h.requests[0]!.signal.aborted).toBe(true); expect(h.resources).toHaveLength(0); expect(h.changed).toHaveBeenCalledTimes(calls);
    h.loader.update([choice('b')]); expect(h.requests).toHaveLength(1);
  });
  it('libère une géométrie créée alors que la destination change', async () => {
    let complete: ((r: TileResource) => void) | undefined;
    const resource = { bytes: 10, dispose: vi.fn() }; const attach = vi.fn();
    const loader = new TileLoader({ fetch: async () => empty, generate: () => new Promise<TileResource>((resolve) => { complete = resolve; }), attach, detach: vi.fn(), changed: vi.fn(), failed: vi.fn() });
    loader.update([choice('a')]); await flush(); loader.dispose(); complete!(resource); await flush();
    expect(resource.dispose).toHaveBeenCalledOnce(); expect(attach).not.toHaveBeenCalled();
  });
});

it('refuse une tuile qui dépasse à elle seule le budget de buffers', async () => {
  const h = harness(20); h.loader.update([choice('too-large')]); h.requests[0]!.resolve(empty); await flush();
  expect(h.loader.info.bytes).toBe(0); expect(h.loader.info.active).toBe(0); expect(h.resources[0]!.dispose).toHaveBeenCalledOnce();
  expect(h.attach).not.toHaveBeenCalled(); h.loader.dispose();
});

it('ignore les réponses intermédiaires après des déplacements rapides répétés', async () => {
  const h = harness();
  for (let i = 0; i < 20; i++) h.loader.update([choice(`step-${i}`)]);
  for (let i = 0; i < h.requests.length; i++) { h.requests[i]!.resolve(empty); await flush(); }
  expect(h.attach).toHaveBeenCalledOnce(); expect(h.loader.levels.has('step-19')).toBe(true);
  expect(h.resources.every((r) => r.id.startsWith('step-19'))).toBe(true); h.loader.dispose();
});

it('conserve les dimensions taguées des immeubles hauts de Nantes', async () => {
  const { buildingStyle } = await import('../src/playgrounds/nantes-3d/buildings');
  const style = buildingStyle({ id: 'tour', tags: { height: '144', 'building:levels': '32', 'roof:shape': 'flat' }, rings: [[[0, 0], [20, 0], [20, 20], [0, 20]]] });
  expect(style.height).toBe(144); expect(style.levels).toBe(32); expect(style.heightSource).toBe('height');
});

it('ne recharge pas les tuiles refusées par le budget lorsque le cadrage reste identique', async () => {
  const h = harness(20); h.loader.update([choice('too-large')]); h.requests[0]!.resolve(empty); await flush();
  h.loader.update([choice('too-large')]); await flush(); expect(h.requests).toHaveLength(1);
  h.loader.update([choice('other')]); h.requests[1]!.resolve(empty); await flush();
  h.loader.update([choice('too-large')]); expect(h.requests).toHaveLength(3); h.loader.dispose();
});
