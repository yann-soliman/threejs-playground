import { describe, expect, it } from 'vitest';
import { Raycaster, Vector3 } from 'three';
import city from '../src/playgrounds/nantes-3d/data/city.json';
import { buildingBody, buildingRoof, buildingStyle, metres } from '../src/playgrounds/nantes-3d/buildings';
import { createCity, roadWidth } from '../src/playgrounds/nantes-3d/city';
import type { CityData, Feature } from '../src/playgrounds/nantes-3d/types';

const data = city as unknown as CityData;

describe('Géographie et génération Nantes', () => {
  it('conserve une emprise métrique, une provenance et des données OSM variées', () => {
    expect(data.meta.width).toBeGreaterThan(500);
    expect(data.meta.width).toBeLessThan(1000);
    expect(data.meta.depth).toBeGreaterThan(500);
    expect(data.meta.license).toBe('ODbL-1.0');
    expect(data.meta.osmTimestamp).toBeTruthy();
    expect(data.buildings.length).toBeGreaterThan(1000);
    expect(data.buildings.some((b) => b.rings.length > 1)).toBe(true);
    expect(data.surfaces.some((s) => s.kind === 'water')).toBe(true);
    expect(data.surfaces.some((s) => s.kind === 'plaza')).toBe(true);
    expect(data.walls.some((w) => w.tags.historic === 'citywalls')).toBe(true);
    expect(data.buildings.some((b) => b.tags.name === 'Grand Logis')).toBe(true);
    expect(data.buildings.some((b) => b.tags.name === 'Tour du Fer à Cheval')).toBe(true);
    for (const b of data.buildings) for (const ring of b.rings) for (const [x, z] of ring) {
      expect(Math.abs(x)).toBeLessThanOrEqual(data.meta.width / 2 + 0.01);
      expect(Math.abs(z)).toBeLessThanOrEqual(data.meta.depth / 2 + 0.01);
    }
  });
  it('priorise les attributs factuels et distingue les estimations', () => {
    const feature: Feature = { id: 'way/1', rings: [[[0, 0], [10, 0], [10, 10], [0, 10]]], tags: { building: 'yes', height: '16 m', 'building:levels': '3', 'roof:shape': 'flat', 'building:colour': '#aa8866' } };
    const factual = buildingStyle(feature);
    expect(factual.height).toBe(16);
    expect(factual.heightSource).toBe('height');
    expect(factual.roofSource).toBe('roof:shape');
    expect(factual.facade.getHexString()).toBe('aa8866');
    const estimated = buildingStyle({ ...feature, tags: { building: 'yes' } });
    expect(estimated.heightSource).toBe('estimated');
    expect(estimated.roofSource).toBe('estimated');
    expect(buildingStyle({ ...feature, tags: { 'building:levels': '4' } }).height).toBeCloseTo(12.6);
    expect(metres('30 ft')).toBeCloseTo(9.144);
    expect(metres('12,5 m')).toBe(12.5);
    expect(metres('unknown')).toBeUndefined();
    expect(roadWidth({ highway: 'pedestrian' })).toBeLessThan(roadWidth({ highway: 'primary' }));
  });
  it('produit des corps et toits finis pour toutes les empreintes réelles', () => {
    for (const feature of data.buildings) {
      const style = buildingStyle(feature);
      expect(style.height).toBeGreaterThan(style.base);
      for (const geometry of [buildingBody(feature, style), buildingRoof(feature, style)]) {
        const position = geometry.getAttribute('position');
        expect(position.count, feature.id).toBeGreaterThan(0);
        expect(Array.from(position.array).every(Number.isFinite), feature.id).toBe(true);
        expect(Array.from(geometry.getAttribute('normal').array).every(Number.isFinite), feature.id).toBe(true);
        geometry.computeBoundingBox();
        expect(geometry.boundingBox!.min.y).toBeGreaterThanOrEqual(0);
        expect(geometry.boundingBox!.max.y).toBeLessThanOrEqual(style.height + 0.3);
        geometry.dispose();
      }
    }
  });
  it('laisse les cours ouvertes dans la géométrie du toit', () => {
    const feature: Feature = { id: 'cour', tags: { 'roof:shape': 'gabled' }, rings: [[[0, 0], [20, 0], [20, 20], [0, 20]], [[5, 5], [5, 15], [15, 15], [15, 5]]] };
    const model = createCity({ ...data, buildings: [feature], trees: [], roads: [], surfaces: [], walls: [] });
    model.group.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(10, 100, 10), new Vector3(0, -1, 0));
    const hits = ray.intersectObjects(model.group.children);
    // Le rayon traverse la cour et rencontre uniquement le sol.
    expect(hits.every((h) => h.point.y < 1)).toBe(true);
    model.dispose();
  });
  it('assemble la ville avec un nombre borné de lots et libère ses ressources', () => {
    const model = createCity(data);
    expect(model.group.children.length).toBeLessThan(20);
    expect(model.windows).toBeGreaterThan(10000);
    expect(model.estimatedHeights).toBeGreaterThan(0);
    model.dispose();
    model.dispose();
    expect(model.group.children.length).toBe(0);
  });
});
