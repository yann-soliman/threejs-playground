import { describe, expect, it, vi } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Color, Vector3, Raycaster, Mesh } from 'three';
import { sampleElevation, meshElevation, terrainGeometry, sampleLine, subdivideSurface, TerrainStore } from '../src/playgrounds/nantes-3d/terrain';
import type { TerrainTile } from '../src/playgrounds/nantes-3d/terrain';
import { createCity } from '../src/playgrounds/nantes-3d/city';
import { buildingFoundation, buildingStyle, buildingBody } from '../src/playgrounds/nantes-3d/buildings';
import { selectPointOfInterest } from '../src/playgrounds/nantes-3d/pois';
import type { CityData } from '../src/playgrounds/nantes-3d/types';
import city from '../src/playgrounds/nantes-3d/data/city.json';

const tile: TerrainTile = { id: '0_0', bounds: [0, 0, 500, 500], origin: [0, 0], size: 2, step: 10, heights: [0, 1000, 2000, 3000], vertices: [0, 0, 0, 0, 20, 10, 10, 10, 0], indices: { near: [0, 1, 2], medium: [0, 1, 2], far: [0, 1, 2] }, bases: {} };

describe('Relief réel : interpolation et géométrie', () => {
  it('interpole des centimètres NGF et rejette les données absentes', () => {
    expect(sampleElevation(tile, 5, 5)).toBe(15);
    expect(sampleElevation(tile, -10, 10)).toBe(20);
    expect(() => sampleElevation({ ...tile, heights: [0, -9999900, 2000, 3000] }, 5, 5)).toThrow('absente');
    expect(() => sampleElevation({ ...tile, heights: [] }, 5, 5)).toThrow('absente');
  });
  it('drape sur les triangles affichés et emploie le MNT hors maillage', () => {
    const sample = meshElevation(tile.vertices, tile.indices.near, () => 42);
    expect(sample(2, 3)).toBeCloseTo(8);
    expect(sample(9, 9)).toBe(42);
    const first = terrainGeometry(tile.vertices, tile.indices.near, (x, z) => x + z * 2);
    const second = terrainGeometry(tile.vertices, tile.indices.far, (x, z) => x + z * 2);
    expect(Array.from(first.getAttribute('normal').array)).toEqual(Array.from(second.getAttribute('normal').array));
    expect(first.getAttribute('normal').getY(0)).toBeGreaterThan(0);
    first.dispose(); second.dispose();
  });
  it('densifie les routes et les surfaces avant leur drapage', () => {
    const line = sampleLine([[0, 0], [25, 0], [25, 25]], 10);
    expect(line).toHaveLength(7); expect(line.at(-1)).toEqual([25, 25]);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([0, .1, 0, 0, .1, 40, 40, .1, 0], 3));
    const disposal = vi.spyOn(geometry, 'dispose');
    const surface = subdivideSurface(geometry, (x, z) => x + z * 2, 10);
    expect(disposal).toHaveBeenCalledOnce();
    const points = surface.getAttribute('position');
    expect(points.count).toBeGreaterThan(3);
    for (let i = 0; i < points.count; i++) expect(points.getY(i)).toBeCloseTo(points.getX(i) + points.getZ(i) * 2 + .1, 4);
    surface.dispose();
  });
  it('garde un sol de bâtiment horizontal sans changer sa hauteur hors sol', () => {
    const feature = { id: 'pente', rings: [[[0, 0], [10, 0], [10, 10], [0, 10]]] as [number, number][][], tags: { height: '12', 'roof:shape': 'flat' } };
    const style = buildingStyle(feature), body = buildingBody(feature, style).translate(0, 32, 0);
    const base = buildingFoundation(feature, 27, 32, new Color('#aaa'));
    body.computeBoundingBox(); base.computeBoundingBox();
    expect(body.boundingBox!.max.y - 32).toBeCloseTo(12.16, 2);
    expect(base.boundingBox!.min.y).toBeCloseTo(26.85, 2);
    expect(base.boundingBox!.max.y).toBeCloseTo(32.16, 2);
    body.dispose(); base.dispose();
  });
  it('garde l’eau et les ponts horizontaux, omet les tunnels et libère leurs buffers', () => {
    const data: CityData = { ...(city as unknown as CityData), buildings: [], trees: [], walls: [],
      roads: [{ id: 'bridge@0', points: [[0, 0], [20, 0]], tags: { highway: 'residential', bridge: 'yes' } }, { id: 'tunnel', points: [[0, 20], [20, 20]], tags: { highway: 'residential', tunnel: 'yes' } }],
      surfaces: [{ id: 'water@0', kind: 'water', tags: {}, rings: [[[0, 40], [20, 40], [20, 60], [0, 60]]] }],
    };
    const model = createCity(data, { ground: false, elevation: (x) => x, waterLevels: { water: 5 }, bridgeLevels: { bridge: 50 } });
    model.group.updateMatrixWorld(true);
    const hit = (x: number, z: number): number[] => new Raycaster(new Vector3(x, 100, z), new Vector3(0, -1, 0)).intersectObject(model.group, true).map((h) => h.point.y);
    expect(hit(10, 0)[0]).toBeCloseTo(50.12, 3); expect(hit(10, 20)).toEqual([]);
    expect(hit(3, 50)[0]).toBeCloseTo(5.075, 3); expect(hit(17, 50)[0]).toBeCloseTo(5.075, 3);
    const disposals: ReturnType<typeof vi.spyOn>[] = [];
    model.group.traverse((object) => { if (object instanceof Mesh) { disposals.push(vi.spyOn(object.geometry, 'dispose')); } });
    model.dispose(); for (const disposal of disposals) expect(disposal).toHaveBeenCalledOnce();
    expect(model.group.children).toHaveLength(0);
  });
  it('place caméra et repère au-dessus de l’altitude du lieu', () => {
    const pose = { target: new Vector3(), distance: 500, polar: 1, azimuth: 0 };
    const poi = selectPointOfInterest('castle', (city as unknown as CityData).meta, pose, 1.5, () => 32.43)!;
    expect(poi.pose.target.y).toBe(32.43); expect(poi.marker.y).toBeCloseTo(32.43 + poi.point.markerHeight);
  });
});

describe('Cache altitude partagé entre LOD', () => {
  it('mutualise une requête, conserve les autres lecteurs après annulation, puis réutilise le cache', async () => {
    let finish!: (data: TerrainTile) => void; let network!: AbortSignal;
    const fetch = vi.fn((_url: string, signal: AbortSignal) => { network = signal; return new Promise<TerrainTile>((resolve) => { finish = resolve; }); });
    const store = new TerrainStore(fetch);
    const a = new AbortController(), b = new AbortController();
    const first = store.load('a', 'a.json', a.signal), second = store.load('a', 'a.json', b.signal);
    const rejection = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve(); a.abort(); expect(network.aborted).toBe(false);
    finish(tile); await rejection; expect(await second).toBe(tile);
    expect(await store.load('a', 'a.json', b.signal)).toBe(tile); expect(fetch).toHaveBeenCalledOnce();
    store.dispose(); expect(store.peek('a')).toBeUndefined();
  });
  it('ignore une réponse tardive après démontage et borne le cache CPU', async () => {
    let finish!: (data: TerrainTile) => void;
    const store = new TerrainStore(() => new Promise((resolve) => { finish = resolve; }));
    const pending = store.load('a', 'a', new AbortController().signal);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve(); store.dispose(); finish(tile); await rejection; expect(store.peek('a')).toBeUndefined();
    const bounded = new TerrainStore(async () => tile, 2), signal = new AbortController().signal;
    await bounded.load('a', 'a', signal); await bounded.load('b', 'b', signal); await bounded.load('a', 'a', signal); await bounded.load('c', 'c', signal);
    expect(bounded.peek('a')).toBe(tile); expect(bounded.peek('b')).toBeUndefined(); bounded.dispose();
  });
  it('annule le téléchargement lorsqu’aucun lecteur ne reste', async () => {
    let network!: AbortSignal;
    const store = new TerrainStore((_url, signal) => { network = signal; return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))); });
    const controller = new AbortController(), pending = store.load('a', 'a', controller.signal);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve(); controller.abort(); await rejection; expect(network.aborted).toBe(true); store.dispose();
  });
});
