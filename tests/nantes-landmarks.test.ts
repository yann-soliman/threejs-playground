import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Box3, Color, InstancedMesh, Mesh, Ray, Vector3 } from 'three';
import { createCity } from '../src/playgrounds/nantes-3d/city';
import { atmosphereUniforms } from '../src/playgrounds/nantes-3d/atmosphere';
import { augmentLandmarkData, createLandmarks, landmarkCollisionFeatures, landmarkPrisms, landmarkSurfaceSampler } from '../src/playgrounds/nantes-3d/landmarks';
import { footprintFrame, LandmarkBuilder } from '../src/playgrounds/nantes-3d/landmarks/builder';
import { frameRing } from '../src/playgrounds/nantes-3d/landmarks/cathedral';
import { castleRoles, landmarkForFeature, landmarks } from '../src/playgrounds/nantes-3d/landmarks/registry';
import { packGeometry, unpackGeometry } from '../src/playgrounds/nantes-3d/geometry-wire';
import { BuildingSelection, inFootprint } from '../src/playgrounds/nantes-3d/selection';
import { WalkingWorld } from '../src/playgrounds/nantes-3d/walking';
import type { CityData, Feature } from '../src/playgrounds/nantes-3d/types';
import type { DetailLevel } from '../src/playgrounds/nantes-3d/city';
function json(path: string) { return JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8')); }
const original: CityData = json('public/nantes/tiles/0_-1.near.json');
const lu: CityData = json('public/nantes/tiles/1_0.near.json');
lu.landmarks = json('public/nantes/landmarks/1_0.json');
const passage: CityData = json('public/nantes/tiles/-2_0.near.json');
passage.landmarks = json('public/nantes/landmarks/-2_0.json');
const crane = augmentLandmarkData(json('public/nantes/tiles/-3_2.near.json'), '-3_2');
const datasets = [original, lu, passage, crane];
function only(data: CityData, buildings: Feature[]): CityData { return { ...data, buildings, roads: [], walls: [], surfaces: [], trees: [] }; }
const specimens = landmarks.map(m => {
  const data = datasets.find(d => d.buildings.some(f => landmarkForFeature(f)?.id === m.id))!;
  return { id: m.id, data: only(data, data.buildings.filter(f => landmarkForFeature(f)?.id === m.id)) };
});
function triangles(group: ReturnType<typeof createLandmarks>): number {
  return group.children.reduce((n, o) => { const mesh = o as Mesh; return n + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3 * (o instanceof InstancedMesh ? o.count : 1); }, 0);
}
function clear(group: ReturnType<typeof createLandmarks>): void {
  group.traverse(o => { if (o instanceof Mesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); if (o instanceof InstancedMesh) o.dispose(); } }); group.clear();
}
describe('Monuments V8 sur les données géographiques réelles', () => {
  it('ferme les pignons vers l’extérieur et conserve leur matériau maçonné', () => {
    const feature: Feature = { id: 'test', rings: [[[-5,-6],[5,-6],[5,6],[-5,6]]], tags: {} };
    const before = JSON.stringify(feature), builder = new LandmarkBuilder('near', atmosphereUniforms());
    builder.mass(feature, 0, 10, 4, '#e7decc');
    const group = builder.finish(), geometry = (group.children[0] as Mesh).geometry;
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), colors = geometry.getAttribute('color'), facade = new Color('#e7decc');
    let checked = 0;
    for (let i = 0; i < positions.count; i++) if (positions.getY(i) > 6.17 && Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i)) > .9 && Math.abs(normals.getY(i)) < .01 && Math.abs(Math.abs(positions.getZ(i))-6) < .01) {
      expect(normals.getZ(i)*Math.sign(positions.getZ(i))).toBeGreaterThan(.99);
      expect(colors.getX(i)).toBeCloseTo(facade.r); checked++;
    }
    expect(checked).toBeGreaterThan(0); expect(JSON.stringify(feature)).toBe(before); clear(group);
  });
  it('cible les identifiants explicitement et conserve les voisins et métadonnées OSM', () => {
    expect(specimens).toHaveLength(5);
    for (const { data } of specimens) expect(data.buildings.length).toBeGreaterThan(0);
    expect(Object.keys(castleRoles).every(id => original.buildings.some(f => f.id === id))).toBe(true);
    expect(landmarkForFeature({ id: 'way/85440594' })).toBeUndefined();
    expect(augmentLandmarkData(crane, '-3_2')).toBe(crane);
    expect(augmentLandmarkData(original, '0_-1')).toBe(original);
    const parent = lu.buildings.find(f => f.id === 'way/32428111')!;
    expect(parent.rings).not.toEqual(lu.landmarks!.visualRings);
    expect(parent.tags.name).toBe('Le Lieu Unique');
    for (const { data } of specimens) {
      const before = JSON.stringify(data), city = createCity(data, { ground: false });
      expect(JSON.stringify(data)).toBe(before); expect(city.estimatedHeights).toBe(0); city.dispose();
    }
  });
  for (const { id, data } of specimens) it(`${id} : trois LOD valides, bornés, ancrés et sans extrusion ordinaire`, () => {
    const counts: number[] = [];
    let nearBounds: Box3 | undefined;
    for (const lod of ['near', 'medium', 'far'] as DetailLevel[]) {
      const tile = id === 'castle' || id === 'cathedral' ? '0_-1' : id === 'tour-lu' ? '1_0' : id === 'titan' ? '-3_2' : '-2_0';
      const source: CityData = augmentLandmarkData(json(`public/nantes/tiles/${tile}.${lod}.json`), tile);
      const actual = only({ ...source, landmarks: data.landmarks }, source.buildings.filter(f => landmarkForFeature(f)?.id === id));
      const group = createLandmarks(actual, lod, () => 17, {}, atmosphereUniforms());
      expect(group.children.length).toBeLessThanOrEqual(4);
      expect(group.children.length).toBeGreaterThan(0);
      for (const o of group.children) {
        const mesh = o as Mesh;
        for (const attribute of Object.values(mesh.geometry.attributes)) expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
        if (o instanceof InstancedMesh) expect(Array.from(o.instanceMatrix.array).every(Number.isFinite)).toBe(true);
      }
      const box = new Box3().setFromObject(group); expect(box.min.y).toBeGreaterThanOrEqual(16.8); expect(box.max.y).toBeLessThan(81);
      if (!nearBounds) nearBounds = box.clone();
      else {
        expect(Math.abs(box.min.x - nearBounds.min.x)).toBeLessThan(3);
        expect(Math.abs(box.max.z - nearBounds.max.z)).toBeLessThan(3);
        expect(Math.abs(box.max.y - nearBounds.max.y)).toBeLessThan(1);
      }
      counts.push(triangles(group));
      const city = createCity(actual, { lod, ground: false });
      // Le modèle de ville ne contient que les lots spécifiques, aucun volume générique.
      expect(city.group.children.length).toBe(group.children.length);
      if (lod === 'far') expect(city.windows).toBe(0);
      clear(group); city.dispose();
    }
    expect(counts[0]).toBeGreaterThan(counts[1]!); expect(counts[1]).toBeGreaterThanOrEqual(counts[2]!);
  });
  it('transfère les cinq modèles, conserve les shaders nocturnes et libère les ressources', () => {
    for (const { data } of specimens) {
      const atmosphere = atmosphereUniforms(), city = createCity(data, { ground: false, atmosphere });
      const { packet, transfer } = packGeometry(city, 0);
      expect(new Set(transfer).size).toBe(transfer.length);
      const clone = structuredClone(packet, { transfer }); expect(transfer.every(b => b.byteLength === 0)).toBe(true);
      const restored = unpackGeometry(clone, () => 17, atmosphere);
      const geometry = (restored.group.children[0] as Mesh).geometry, disposed = vi.spyOn(geometry, 'dispose');
      const window = packet.materials.find(m => m.kind === 'windows'); expect(window).toBeDefined();
      atmosphere.night.value = 1; restored.dispose(); restored.dispose(); expect(disposed).toHaveBeenCalledOnce(); expect(restored.group.children).toHaveLength(0); city.dispose();
    }
  });
  it('sélectionne les tours hautes et la flèche de grue, conserve les identifiants et nettoie le surlignage au LOD', () => {
    for (const id of ['cathedral', 'titan'] as const) {
      const { data } = specimens.find(s => s.id === id)!, f = data.buildings[0]!, prisms = landmarkPrisms(f);
      const prism = prisms.find(p => id === 'cathedral' ? p.top === 63 : p.bottom === 40)!;
      const ring = prism.rings[0]!, x = ring.reduce((n, p) => n + p[0], 0) / ring.length, z = ring.reduce((n, p) => n + p[1], 0) / ring.length;
      const selection = new BuildingSelection(vi.fn()); selection.setTile('tile', data, 'near', () => 17);
      expect(selection.pick(new Ray(new Vector3(x, 120, z), new Vector3(0, -1, 0)))?.id).toBe(f.id);
      const dispose = vi.spyOn((selection.group.children[0] as Mesh).geometry, 'dispose');
      selection.setTile('tile', data, 'medium', () => 17); expect(dispose).toHaveBeenCalledOnce();
      selection.setTile('tile', data, 'far', () => 17); selection.reconcile(); expect(selection.group.children).toHaveLength(0); selection.dispose();
    }
  });
  it('ancre séparément la Tour LU et ses proxies sur le terrain local', () => {
    const f = lu.buildings.find(f => f.id === 'way/32428111')!;
    const sample = (x: number) => x * .02;
    const selection = new BuildingSelection(vi.fn()); selection.setTile('lu', only(lu, [f]), 'near', sample);
    expect(selection.pick(new Ray(new Vector3(468.04, 100, 15.88), new Vector3(0, -1, 0)))?.id).toBe(f.id);
    expect(selection.selected!.base).toBeCloseTo(sample(468.04)); selection.dispose();
  });
  it('bloque les appuis ajoutés pour le piéton et les agents, sans modifier les empreintes source', () => {
    for (const id of ['castle', 'cathedral', 'titan'] as const) {
      const { data } = specimens.find(s => s.id === id)!, additions = landmarkCollisionFeatures(data);
      expect(additions.length).toBeGreaterThan(0);
      const f = id === 'castle' ? data.buildings.find(f=>f.id==='relation/17370071')! : data.buildings[0]!, frame = footprintFrame(f);
      const point: [number,number] = id === 'castle' ? [170.3,-68.4] : id === 'titan' ? frame.point(5.4, 2.6) : frame.point(frame.minU + 23, 19);
      expect(additions.some(a => inFootprint(a, ...point))).toBe(true);
      const sample = landmarkSurfaceSampler(data, () => 17); expect(sample(...point)).toBeNaN(); expect(sample(9000, 9000)).toBe(17);
      const boundary = [frameRing(frame, 0, 0, 4000, 4000)]; const world = new WalkingWorld({}, boundary);
      for (let x = -4; x <= 1; x++) for (let z = -2; z <= 3; z++) world.setTile(`${x}_${z}`, data, () => 17);
      expect(world.probe(...point).reason).toBe('obstacle'); world.dispose();
    }
  });
});
