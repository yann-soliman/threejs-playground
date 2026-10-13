import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3, WebGLRenderer } from 'three';
import { agentAccess, agentBudget, agentRoute, agentStyle, pathPose, populationFactor } from '../src/playgrounds/nantes-3d/mobility-paths';
import type { MobilityPath } from '../src/playgrounds/nantes-3d/mobility-paths';
import { agentModel, animatedAgentMaterial } from '../src/playgrounds/nantes-3d/agent-models';
import { tramRails } from '../src/playgrounds/nantes-3d/tram-rails';
import { UrbanActivity } from '../src/playgrounds/nantes-3d/urban-activity';
import { PerformanceLog } from '../src/playgrounds/nantes-3d/performance';
const path = (kind: 'pedestrian' | 'cyclist' = 'pedestrian'): MobilityPath => ({ id: 'way/1', osmIds: ['way/1'], kind, tags: { highway: 'residential' }, points: [[5, 5], [100, 5], [100, 100]] });
const camera = (): PerspectiveCamera => { const c = new PerspectiveCamera(60, 1, .1, 3000);c.position.set(50, 100, 150);c.lookAt(50, 0, 50);c.updateMatrixWorld();return c; };
const settle = async (): Promise<void> => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
describe('Chemins géographiques et effectifs', () => {
  it('respecte les accès par mode, les tunnels, les ponts et les voies interdites', () => {
    for (const h of ['motorway', 'trunk', 'steps', 'construction']) expect(agentAccess({ highway: h }, 'pedestrian')).toBe(false);
    expect(agentAccess({ highway: 'footway', bicycle: 'no' }, 'cyclist')).toBe(false);
    expect(agentAccess({ highway: 'pedestrian' }, 'cyclist')).toBe(false);
    expect(agentAccess({ highway: 'pedestrian', bicycle: 'yes', access: 'no' }, 'cyclist')).toBe(true);
    expect(agentAccess({ highway: 'cycleway', foot: 'no' }, 'pedestrian')).toBe(false);
    for (const tags of [{ tunnel: 'yes' }, { layer: '-1' }, { layer: '1' }, { access: 'private' }] as Record<string, string>[]) expect(agentAccess({ highway: 'residential', ...tags }, 'cyclist')).toBe(false);
    expect(agentAccess({ highway: 'footway', layer: '1', bridge: 'yes' }, 'pedestrian')).toBe(true);
    expect(agentRoute({ ...path(), tags: { highway: 'footway', bridge: 'yes' } })).toBeUndefined();
    expect(agentRoute({ ...path(), deck: 7, tags: { highway: 'footway', bridge: 'yes' } })).toBeDefined();
  });
  it('interpole les vraies courbes, les directions et les frontières sans raccord inventé', () => {
    const route = agentRoute(path())!;expect(route.length).toBe(190);
    expect(pathPose(route, 95)).toMatchObject({ x: 100, z: 5 });
    expect(pathPose(route, 140).z).toBe(50);expect(pathPose(route, 500).z).toBe(100);
    expect(Math.abs(pathPose(route, 50, -1).angle - pathPose(route, 50).angle)).toBeCloseTo(Math.PI);
    expect(agentRoute({ ...path('cyclist'), tags: { highway: 'residential', oneway: '-1' } })!.points[0]).toEqual([100, 100]);
    const boundary = agentRoute({ ...path(), points: [[490, 2], [510, 2]] })!;expect(pathPose(boundary, 11).x).toBe(501);
  });
  it('borne les budgets et fait varier progressivement les populations estimées', () => {
    for (let hour = 0; hour < 24; hour += .1) for (const density of ['off', 'low', 'normal'] as const) {
      expect(agentBudget('pedestrian', density, false, hour)).toBeLessThanOrEqual(density === 'low' ? 30 : density === 'off' ? 0 : 100);
      expect(agentBudget('cyclist', density, true, hour)).toBeLessThanOrEqual(10);
      expect(agentBudget('tram', density, true, hour)).toBeLessThanOrEqual(2);
    }
    expect(populationFactor(1, 'pedestrian')).toBeLessThan(populationFactor(14, 'pedestrian'));
    expect(populationFactor(7.99, 'cyclist')).toBeCloseTo(populationFactor(8, 'cyclist'), 2);
    expect(agentStyle('way/1', 'pedestrian')).toEqual(agentStyle('way/1', 'pedestrian'));
    expect(agentStyle('way/1', 'pedestrian').phase).not.toBe(agentStyle('way/2', 'pedestrian').phase);
  });
  it('dessine deux rails sur les seuls segments soutenus, avec normales vers le haut', () => {
    const geometry = tramRails([agentRoute(path())!], (x) => x < 100 ? 3 : undefined);expect(geometry.getAttribute('position').count).toBe(0);geometry.dispose();
    const rails = tramRails([agentRoute(path())!], () => 3);expect(rails.getAttribute('position').count).toBe(24);expect(rails.getAttribute('normal').getY(0)).toBeGreaterThan(.99);expect(rails.getAttribute('position').getY(0)).toBeCloseTo(3.17);rails.dispose();
  });
  it('fournit membres opposés, roues et sections articulées sans squelette ni modèles externes', () => {
    for (const kind of ['pedestrian', 'cyclist', 'tram'] as const) {
      const geometry = agentModel(kind);expect(geometry.getAttribute('position').array.every(Number.isFinite)).toBe(true);
      expect(geometry.getAttribute('joint').count).toBe(geometry.getAttribute('position').count);
      const motion = geometry.getAttribute('motion');
      if (kind === 'cyclist') expect(Array.from({ length: motion.count }, (_, i) => motion.getZ(i)).some((n) => n === 1)).toBe(true);
      if (kind === 'pedestrian') expect(Array.from({ length: motion.count }, (_, i) => motion.getX(i)).some((n) => n < 0)).toBe(true);
      const time = { value: 1 }, material = animatedAgentMaterial(geometry, 40, time);
      const shader = { uniforms: {}, vertexShader: '#include <color_vertex>\n#include <beginnormal_vertex>\n#include <begin_vertex>', fragmentShader: '' } as Parameters<typeof material.onBeforeCompile>[0];
      material.onBeforeCompile(shader, {} as WebGLRenderer);expect(shader.uniforms.agentTime).toBe(time);expect(shader.vertexShader).toContain('articulation * (transformed - joint)');expect(shader.vertexShader).toContain('if (color.r > 0.99');
      expect(geometry.getAttribute('agentMotion').count).toBe(40);geometry.dispose();material.dispose();
    }
  });
});
describe('Cycle de vie de l’activité urbaine', () => {
  it('ne charge rien au loin/désactivé, partage les routes de frontière et nettoie les ressources', async () => {
    const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('manifest.json') ? { tiles: { '0_0': 'tiles/0_0.json', '1_0': 'tiles/1_0.json' }, trams: 'trams.json' } : { routes: [path()] } }));
    vi.stubGlobal('fetch', fetcher);
    const activity = new UrbanActivity('/nantes/mobility/', false, () => {}, new PerformanceLog(false));
    activity.configure('off', false, false, 14);activity.select(camera(), new Vector3(50, 0, 50));expect(fetcher).not.toHaveBeenCalled();
    activity.setTile('0_0', (x, z) => x * .01 + z * .01, 'near');activity.setTile('1_0', () => 0, 'near');activity.configure('normal', false, false, 14);await settle();activity.select(camera(), new Vector3(50, 0, 50));
    for (let i = 0; i < 12; i++) activity.update(.25);
    expect(activity.counts.pedestrian).toBeGreaterThan(0);expect(activity.counts.pedestrian).toBeLessThanOrEqual(6);expect(activity.drawCalls).toBe(1);
    const mesh = activity.group.children[0] as import('three').InstancedMesh, before = mesh.instanceMatrix.array.slice();activity.update(.25);expect(mesh.instanceMatrix.array).not.toEqual(before);
    expect(mesh.instanceMatrix.array[13]).toBeGreaterThan(.14);expect(mesh.castShadow).toBe(false);
    activity.configure('off', false, false, 14);expect(activity.active).toBe(false);expect(activity.counts.pedestrian).toBe(0);
    const dispose = vi.spyOn(mesh.geometry, 'dispose');activity.dispose();expect(dispose).toHaveBeenCalledOnce();expect(activity.group.children).toHaveLength(0);expect(activity.bytes).toBe(0);vi.unstubAllGlobals();
  });
  it('arrête les tramways aux arrêts proches et aux extrémités sans téléportation', async () => {
    const track = { id: 'way/tram', osmIds: ['way/tram'], tags: { railway: 'tram' }, points: [[5, 5], [205, 5]], stops: [{ id: 'node/stop', point: [55, 5], distance: 50, tags: {} }] };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('manifest.json') ? { tiles: {}, trams: 'trams.json' } : { routes: [track] } })));
    const activity = new UrbanActivity('/nantes/mobility/', false, () => {}, new PerformanceLog(false));
    activity.setTile('0_0', () => 7, 'medium');activity.configure('off', true, false, 14);const view = camera();view.fov = 120;view.updateProjectionMatrix();activity.select(view, new Vector3(50, 0, 50));await settle();activity.select(view, new Vector3(50, 0, 50));
    for (let i = 0; i < 5; i++) activity.update(.25);
    expect(activity.positions[0]!.distance).toBe(50);activity.update(.25);expect(activity.positions[0]!.distance).toBe(50);
    for (let i = 0; i < 160; i++) activity.update(.25);
    expect(activity.positions[0]!.distance).toBe(187);expect(activity.counts.tram).toBe(1);expect(activity.active).toBe(false);
    const d = activity.positions[0]!.distance;activity.update(10);expect(activity.positions[0]!.distance).toBe(d);
    activity.configure('off', false, false, 14);expect(activity.counts.tram).toBe(0);expect(activity.drawCalls).toBe(0);activity.dispose();vi.unstubAllGlobals();
  });
  it('conserve un agent de frontière unique et bloque sa progression vers une tuile absente', async () => {
    const crossing = { ...path(), points: [[480, 50], [520, 50]] };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('manifest.json') ? { tiles: { '0_0': 'left.json', '1_0': 'right.json' } } : { routes: [crossing] } })));
    const activity = new UrbanActivity('/nantes/mobility/', false, () => {}, new PerformanceLog(false));activity.setTile('0_0', () => 2, 'near');activity.setTile('1_0', () => 2, 'near');
    const view = camera();view.position.set(500, 100, 150);view.lookAt(500, 0, 50);view.updateMatrixWorld();activity.configure('normal', false, false, 14);activity.select(view, new Vector3(500, 0, 50));await settle();activity.select(view, new Vector3(500, 0, 50));
    for (let i = 0; i < 6; i++) activity.update(.25);
    const ids = activity.positions.map((a) => a.id);expect(new Set(ids).size).toBe(ids.length);expect(ids.length).toBeLessThanOrEqual(2);
    activity.removeTile('1_0');for (let i = 0; i < 30; i++) activity.update(.25);
    expect(activity.positions.every((a) => a.x < 500)).toBe(true);activity.dispose();vi.unstubAllGlobals();
  });
  it('refuse les résultats périmés et les agents en LOD moyen/réduction des animations', async () => {
    let reply: ((value: unknown) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('manifest.json') ? { tiles: { '0_0': 'tile.json' } } : await new Promise((resolve) => { reply = resolve; }) })));
    const activity = new UrbanActivity('/nantes/mobility/', true, () => {}, new PerformanceLog(false));activity.setTile('0_0', () => 10, 'near');activity.select(camera(), new Vector3(50, 0, 50));activity.configure('normal', false, false, 14);await settle();activity.removeTile('0_0');reply?.({ routes: [path()] });await settle();activity.update(.25);expect(activity.counts.pedestrian).toBe(0);
    activity.setTile('0_0', () => 10, 'medium');activity.select(camera(), new Vector3(50, 0, 50));activity.update(.25);expect(activity.counts.pedestrian).toBe(0);
    activity.configure('normal', true, true, 14);expect(activity.active).toBe(false);activity.dispose();vi.unstubAllGlobals();
  });
});
