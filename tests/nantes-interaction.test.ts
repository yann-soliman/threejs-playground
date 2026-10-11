import { describe, it, expect, vi } from 'vitest';
import { Mesh, PerspectiveCamera, Ray, Vector3 } from 'three';
import { Traffic, trafficRoute, routePosition, roadEligible } from '../src/playgrounds/nantes-3d/traffic';
import { BuildingSelection, buildingInformation, isSelectionClick } from '../src/playgrounds/nantes-3d/selection';
import type { CityData, Feature } from '../src/playgrounds/nantes-3d/types';
import city from '../src/playgrounds/nantes-3d/data/city.json';
const feature: Feature = { id: 'way/123/0', rings: [[[0, 0], [20, 0], [20, 20], [0, 20]]], tags: { building: 'house', height: '12', name: '<Maison>', 'building:levels': '3' } };
const data: CityData = { ...(city as unknown as CityData), buildings: [feature], roads: [], trees: [], walls: [], surfaces: [] };
const road = { id: 'way/1@0_0/0', tags: { highway: 'residential' }, points: [[0, 0], [100, 0], [100, 100]] as [number, number][] };
describe('Circulation sur les axes OSM', () => {
  it('écarte les chemins, accès restreints et tunnels', () => {
    for (const highway of ['footway', 'pedestrian', 'cycleway', 'path', 'steps', 'service', 'construction']) expect(roadEligible({ highway })).toBe(false);
    const restricted: Record<string, string>[] = [{ access: 'private' }, { motor_vehicle: 'no' }, { vehicle: 'no' }, { tunnel: 'yes' }, { layer: '-1' }];
    for (const tags of restricted) expect(roadEligible({ highway: 'residential', ...tags })).toBe(false);
    expect(roadEligible({ highway: 'primary', bridge: 'yes', layer: '1' })).toBe(true);
    expect(roadEligible({ highway: 'residential', access: 'private', motor_vehicle: 'yes' })).toBe(true);
  });
  it('respecte sens inverse et sens unique explicite ou implicite', () => {
    const reversed = trafficRoute({ ...road, tags: { ...road.tags, oneway: '-1' } })!;
    expect(trafficRoute({ ...road, tags: { highway: 'residential', oneway: 'yes', lanes: '1' } })!.offset).toBe(0);
    expect(reversed.points[0]).toEqual([100, 100]); expect(reversed.oneWay).toBe(true); expect(road.points[0]).toEqual([0, 0]);
    expect(trafficRoute({ ...road, tags: { ...road.tags, junction: 'roundabout' } })!.oneWay).toBe(true);
    expect(trafficRoute({ ...road, tags: { ...road.tags, junction: 'roundabout', oneway: 'no' } })!.oneWay).toBe(false);
    expect(trafficRoute({ ...road, points: [[0, 0], [10, 0]] })).toBeUndefined();
  });
  it('interpole la longueur réelle et disparaît aux extrémités', () => {
    const route = trafficRoute(road)!;
    expect(route.length).toBe(200);
    expect(routePosition(route, 50).x).toBeCloseTo(50);
    expect(routePosition(route, 150).z).toBeCloseTo(50);
    expect(routePosition(route, 0).scale).toBe(0); expect(routePosition(route, 200).scale).toBe(0);
    expect(routePosition(route, 50, true).z).toBeCloseTo(50);
    const hairpin = trafficRoute({ ...road, points: [[0, 0], [100, 0], [0, 0]] })!;
    expect(Object.values(routePosition(hairpin, 100)).every(Number.isFinite)).toBe(true);
  });
  it('borne les instances, suit le terrain et supprime les zones déchargées', () => {
    const traffic = new Traffic(12), camera = new PerspectiveCamera(60, 1, 1, 3000); camera.position.set(50, 400, 400); camera.lookAt(50, 0, 50); camera.updateMatrixWorld();
    const roads = Array.from({ length: 30 }, (_, i) => ({ ...road, id: `way/${i}@0` }));
    traffic.setTile('a', { ...data, roads }, () => 32, {}); traffic.select(camera, new Vector3(50, 0, 50), 'normal', false);
    expect(traffic.count).toBe(12); expect(traffic.drawCalls).toBe(3);
    const matrices = (traffic.group.children[0] as import('three').InstancedMesh).instanceMatrix.array;
    expect(matrices[13]).toBeCloseTo(32.14, 4);
    traffic.select(camera, new Vector3(50, 0, 50), 'low', false); expect(traffic.count).toBe(4);
    traffic.select(camera, new Vector3(), 'normal', true); expect(traffic.count).toBe(0);
    traffic.select(camera, new Vector3(50, 0, 50), 'normal', false); traffic.removeTile('a'); expect(traffic.count).toBe(0);
    traffic.setTile('b', { ...data, roads: [road] }, () => -10, { 'way/1': 8 }); traffic.select(camera, new Vector3(50, 0, 50), 'normal', false);
    expect((traffic.group.children[0] as import('three').InstancedMesh).instanceMatrix.array[13]).toBeCloseTo(8.14, 4);
    const disposals = traffic.group.children.map((m) => vi.spyOn((m as Mesh).geometry, 'dispose'));
    traffic.dispose(); disposals.forEach((spy) => expect(spy).toHaveBeenCalledOnce()); expect(traffic.group.children).toHaveLength(0);
  });
  it('ne construit aucun buffer lorsque la circulation est désactivée', () => {
    const traffic = new Traffic(); traffic.setTile('a', { ...data, roads: [road] }, () => 0, {});
    traffic.select(new PerspectiveCamera(), new Vector3(), 'off', false); expect(traffic.group.children).toHaveLength(0); traffic.dispose();
  });
});
describe('Sélection des bâtiments sans défaire les lots', () => {
  it('affiche les attributs OSM sans inventer de nom ou d’adresse', () => {
    const info = buildingInformation(feature); expect(info.title).toBe('<Maison>'); expect(info.id).toBe('way/123'); expect(info.url).toBe('https://www.openstreetmap.org/way/123'); expect(info.height).toContain('OSM');
    expect(buildingInformation({ ...feature, tags: {} }).height).toContain('Hauteur estimée'); expect(buildingInformation({ ...feature, tags: {} }).title).toBe('Bâtiment');
    expect(buildingInformation({ ...feature, tags: { 'building:levels': '4' } }).height).toContain('niveaux OSM');
  });
  it('distingue tap, glissement et appui long', () => {
    const start = { x: 10, y: 10, time: 0 }; expect(isSelectionClick(start, { x: 12, y: 11, time: 100 })).toBe(true);
    expect(isSelectionClick(start, { x: 20, y: 10, time: 100 })).toBe(false); expect(isSelectionClick(start, { x: 10, y: 10, time: 700 })).toBe(false);
  });
  it('sélectionne le toit et la façade aux bonnes coordonnées et conserve les cours', () => {
    const selection = new BuildingSelection(vi.fn()); selection.setTile('a', data, 'near', () => 30);
    expect(selection.pick(new Ray(new Vector3(10, 100, 10), new Vector3(0, -1, 0)))?.id).toBe(feature.id);
    expect(selection.selected!.base).toBe(30);
    expect(selection.pick(new Ray(new Vector3(-20, 35, 10), new Vector3(1, -.05, 0).normalize()))?.id).toBe(feature.id);
    const courtyard: Feature = { ...feature, rings: [...feature.rings, [[5, 5], [5, 15], [15, 15], [15, 5]]] };
    selection.setTile('a', { ...data, buildings: [courtyard] }, 'medium', () => 30);
    expect(selection.pick(new Ray(new Vector3(10, 100, 10), new Vector3(0, -1, 0)))).toBeUndefined(); selection.dispose();
  });
  it('remplace le surlignage au changement de LOD et le libère au déchargement', () => {
    const changed = vi.fn(), selection = new BuildingSelection(changed); selection.setTile('a', data, 'near', () => 30);
    selection.pick(new Ray(new Vector3(10, 100, 10), new Vector3(0, -1, 0)));
    const disposal = vi.spyOn((selection.group.children[0] as Mesh).geometry, 'dispose');
    selection.removeTile('a'); selection.setTile('a', data, 'medium', () => 32); selection.reconcile(); expect(selection.selected!.base).toBe(32); expect(disposal).toHaveBeenCalledOnce();
    selection.removeTile('a'); selection.reconcile(); expect(selection.selected).toBeUndefined(); expect(selection.group.children).toHaveLength(0);
    selection.setTile('a', data, 'far', () => 0); expect(selection.pick(new Ray(new Vector3(10, 100, 10), new Vector3(0, -1, 0)))).toBeUndefined(); selection.dispose();
  });
});
