import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Ray, Vector3 } from 'three';
import { EYE_HEIGHT, footprintCollision, movementKey, pedestrianRoad, Walker, WalkingWorld, walkingTiles } from '../src/playgrounds/nantes-3d/walking';
import { headingArrow, mapDestination, mapPosition } from '../src/playgrounds/nantes-3d/minimap';
import { BuildingSelection } from '../src/playgrounds/nantes-3d/selection';
import { meshElevation, tileElevation } from '../src/playgrounds/nantes-3d/terrain';
import type { TerrainOverview, TerrainTile } from '../src/playgrounds/nantes-3d/terrain';
import { projectCoordinates } from '../src/playgrounds/nantes-3d/pois';
import type { CityData, Feature, Point } from '../src/playgrounds/nantes-3d/types';
import type { CityManifest } from '../src/playgrounds/nantes-3d/tiles';
import city from '../src/playgrounds/nantes-3d/data/city.json';
const boundary: Point[][][] = [[[[-1000, -1000], [2000, -1000], [2000, 2000], [-1000, 2000]]]];
const house: Feature = { id: 'way/10', rings: [[[20, 20], [40, 20], [40, 40], [20, 40]], [[25, 25], [35, 25], [35, 35], [25, 35]]], tags: { building: 'yes', height: '12' } };
const data: CityData = { ...city as unknown as CityData, buildings: [], walls: [], roads: [], surfaces: [], trees: [] };
function setup(sample = (x: number, _z: number): number => x * .1): { world: WalkingWorld; walker: Walker } {
  const world = new WalkingWorld({ 'way/1': 20 }, boundary); world.setTile('0_0', data, sample);
  const walker = new Walker(world); walker.position.set(100, sample(100, 100) + .12 + EYE_HEIGHT, 100); return { world, walker };
}
describe('Exploration piétonne', () => {
  it('utilise les touches physiques et les variantes AZERTY/QWERTY', () => {
    for (const key of ['z', 'w']) expect(movementKey({ key, code: 'KeyW' })).toBe('forward');
    for (const key of ['q', 'a']) expect(movementKey({ key, code: 'KeyA' })).toBe('left');
    expect(movementKey({ key: 'z', code: 'KeyZ' })).toBe('forward'); expect(movementKey({ key: 'q', code: 'KeyQ' })).toBe('left');
    expect(movementKey({ key: 'n', code: 'KeyN' })).toBeUndefined();
  });
  it('marche à vitesse constante, même à une image par seconde, sans accélérer en diagonale', () => {
    const a = setup(), b = setup(); a.walker.keys.add('forward'); b.walker.keys.add('forward');
    for (let i = 0; i < 4; i++) a.walker.step(.25); for (let i = 0; i < 60; i++) b.walker.step(1 / 60);
    expect(a.walker.position.distanceTo(b.walker.position)).toBeLessThan(1e-9); expect(a.walker.position.z).toBeCloseTo(98.2);
    const c = setup(); c.walker.keys.add('right'); c.walker.keys.add('forward'); for (let i = 0; i < 4; i++) c.walker.step(.25); expect(Math.hypot(c.walker.position.x - 100, c.walker.position.z - 100)).toBeCloseTo(1.8);
    c.walker.stop(); expect(c.walker.moving).toBe(false);
  });
  it('conserve un appui relâché entre deux images lentes et annule les commandes à la perte de focus', () => {
    const { walker } = setup(); walker.setKey('forward', true, 0); walker.advance(0); walker.setKey('forward', false, 1000);
    expect(walker.advance(1000)).toBe(true); expect(walker.position.z).toBeCloseTo(99.55); expect(walker.moving).toBe(false);
    walker.setKey('forward', true, 1000); walker.stop(); expect(walker.advance(2000)).toBe(false);
  });
  it('suit le terrain et conserve la hauteur des yeux', () => {
    const { walker } = setup(); walker.keys.add('right'); walker.step(1);
    expect(walker.position.y).toBeCloseTo(walker.position.x * .1 + .12 + EYE_HEIGHT);
    walker.look(100, 1e6); expect(walker.yaw).toBeCloseTo(-.25); expect(walker.pitch).toBe(-1.35);
  });
  it('bloque les fortes pentes et les sauts de terrain', () => {
    const steep = setup((x) => x); steep.walker.keys.add('right'); expect(steep.walker.step(1)).toBe(false); expect(steep.walker.blocked).toBe('slope');
    const cliff = setup((x) => x > 100.5 ? 4 : 0); cliff.walker.keys.add('right'); cliff.walker.step(1); expect(cliff.walker.position.x).toBeLessThan(100.5);
  });
  it('respecte les polygones irréguliers, cours, rayons et angles', () => {
    expect(footprintCollision(house, 21, 21)).toBe(true); expect(footprintCollision(house, 30, 30)).toBe(false); expect(footprintCollision(house, 25.1, 30)).toBe(true);
    const { world, walker } = setup(() => 0); world.setTile('0_0', { ...data, buildings: [house] }, () => 0);
    walker.position.set(18, 1.82, 30); walker.keys.add('right'); walker.keys.add('forward'); walker.keys.add('fast'); walker.step(2);
    expect(walker.position.x).toBeLessThanOrEqual(19.72); expect(walker.position.z).toBeLessThan(30); expect(footprintCollision(house, walker.position.x, walker.position.z)).toBe(false);
    walker.position.set(30, 1.82, 30); walker.stop(); walker.keys.add('right'); walker.step(2); expect(walker.position.x).toBeLessThanOrEqual(34.72);
  });
  it('ne franchit pas une paroi mince malgré un long intervalle', () => {
    const { world, walker } = setup(() => 0); const thin: Feature = { ...house, rings: [[[102, 80], [102.05, 80], [102.05, 120], [102, 120]]] };
    world.setTile('0_0', { ...data, buildings: [thin] }, () => 0); walker.keys.add('right'); walker.keys.add('fast'); walker.step(2); expect(walker.position.x).toBeLessThan(101.73);
  });
  it('attend la couverture voisine puis traverse une frontière sans changement d’altitude', () => {
    const { walker, world } = setup(); walker.position.set(499.6, 49.96 + 1.82, 100); walker.keys.add('right'); walker.step(1);
    expect(walker.position.x).toBeLessThan(499.72); expect(walker.blocked).toBe('loading');
    world.setTile('1_0', data, (x) => x * .1); walker.step(1); expect(walker.position.x).toBeGreaterThan(500); expect(walker.position.y).toBeCloseTo(walker.position.x * .1 + 1.82);
    world.removeTile('1_0'); expect(world.probe(501, 100).reason).toBe('loading'); world.dispose(); expect(world.count).toBe(0);
  });
  it('préfère un chemin sûr et refuse eau, accès privés et départ non chargé', () => {
    const { world } = setup(() => 0); const water = { ...house, id: 'water', kind: 'water' as const, rings: [[[10, 10], [50, 10], [50, 50], [10, 50]]] as Point[][] };
    world.setTile('0_0', { ...data, surfaces: [water], roads: [{ id: 'way/2', tags: { highway: 'footway' }, points: [[20, 30], [80, 30]] }] }, () => 0);
    expect(world.probe(30, 30).reason).toBe('water'); expect(world.spawn(new Vector3(65, 0, 30))!.y).toBeCloseTo(1.82); expect(world.spawn(new Vector3(1000, 0, 1000))).toBeUndefined();
    expect(pedestrianRoad({ highway: 'footway', access: 'private' })).toBe(false); expect(pedestrianRoad({ highway: 'footway', access: 'private', foot: 'yes' })).toBe(true); expect(pedestrianRoad({ highway: 'footway', foot: 'no' })).toBe(false);
    for (const highway of ['motorway', 'steps', 'construction']) expect(pedestrianRoad({ highway })).toBe(false);
  });
  it('respecte les espaces verts privés et la largeur réelle des murs', () => {
    const { world } = setup(() => 0);
    world.setTile('0_0', { ...data, surfaces: [{ ...house, kind: 'green', tags: { access: 'private' } }], walls: [{ id: 'wall', tags: { width: '2.5' }, points: [[60, 20], [60, 40]] }] }, () => 0);
    expect(world.probe(21, 21).reason).toBe('access'); expect(world.probe(30, 30).height).toBeDefined();
    expect(world.probe(59, 30).reason).toBe('obstacle'); expect(world.probe(58, 30).height).toBeDefined();
  });
  it('utilise le tablier connu sur l’eau et refuse les tunnels', () => {
    const { world } = setup(() => 0); world.setTile('0_0', { ...data, surfaces: [{ ...house, kind: 'water', rings: [[[20, 20], [100, 20], [100, 40], [20, 40]]] }], roads: [{ id: 'way/1@0_0', tags: { highway: 'residential', bridge: 'yes' }, points: [[20, 30], [100, 30]] }] }, () => 0);
    expect(world.probe(50, 30).height).toBe(20.12); expect(pedestrianRoad({ highway: 'footway', tunnel: 'yes' })).toBe(false);
  });
  it('priorise six tuiles proches avec anticipation et conserve les empreintes à proximité', () => {
    const manifest = { tiles: Array.from({ length: 25 }, (_, i) => { const x = (i % 5 - 2) * 500, z = (Math.floor(i / 5) - 2) * 500; return { id: `${x / 500}_${z / 500}`, bounds: [x, z, x + 500, z + 500] }; }) } as CityManifest;
    const selected = walkingTiles(manifest, new Vector3(200, 0, 200), 0); expect(selected.length).toBeLessThanOrEqual(6); expect(selected[0]!.tile.id).toBe('0_0'); expect(selected.every((tile) => tile.lod === 'near')).toBe(true);
    expect(walkingTiles(manifest, new Vector3(499, 0, 200), -Math.PI / 2)[0]!.tile.id).toBe('0_0');
  });
  it('permet d’inspecter une façade dans un rayon horizontal sans proxy GPU', () => {
    const index = new BuildingSelection(() => {}); index.setTile('0_0', { ...data, buildings: [house] }, 'near', () => 0);
    expect(index.pick(new Ray(new Vector3(10, 2, 30), new Vector3(1, 0, 0)))?.id).toBe(house.id); index.dispose();
  });
});
describe('Projection de la mini-carte', () => {
  it('conserve le nord en haut et une échelle identique sur les deux axes', () => {
    expect(mapPosition([10, -10], [0, 0], 200, 200, 100)).toEqual([110, 40]);
    const p = projectCoordinates([47.22, -1.55], [47.21, -1.56]); expect(p.x).toBeGreaterThan(0); expect(p.z).toBeLessThan(0);
    const roundtrip = mapDestination(mapPosition([123, -456], [80, -200], 1400, 220, 150), [80, -200], 1400, 220, 150); expect(roundtrip[0]).toBeCloseTo(123); expect(roundtrip[1]).toBeCloseTo(-456);
  });
  it('projette correctement la direction et les sélections après déplacement et zoom', () => {
    expect(headingArrow(0)).toEqual([-0, -1]); expect(headingArrow(Math.PI / 2)[0]).toBeCloseTo(-1);
    expect(mapDestination([100, 100], [200, 300], 400, 200, 200)).toEqual([200, 300]);
    expect(mapDestination([200, 100], [200, 300], 400, 200, 200)).toEqual([400, 300]);
    const camera = new PerspectiveCamera(); camera.rotation.set(0, .5, 0, 'YXZ'); const direction = camera.getWorldDirection(new Vector3()); const arrow = headingArrow(.5); expect(arrow[0]).toBeCloseTo(direction.x); expect(arrow[1]).toBeCloseTo(direction.z);
  });
});

// Assets de production : vérifier la continuité sur une vraie rue, au-delà des fixtures.
it('traverse une frontière réelle de Nantes avec terrain et collisions des deux propriétaires', () => {
  const load = <T,>(path: string): T => JSON.parse(readFileSync(`public/nantes/${path}`, 'utf8')) as T;
  const manifest = load<CityManifest>('manifest.json'); const overview = load<TerrainOverview>('terrain/overview.json');
  const world = new WalkingWorld(overview.bridgeLevels, manifest.boundary);
  const areas: CityData[] = [];
  for (const id of ['-1_0', '0_0', '-1_-1', '0_-1']) {
    const tile = manifest.tiles.find((entry) => entry.id === id)!;
    const terrain = load<TerrainTile>(`terrain/tiles/${id}.json`);
    const area = load<CityData>(tile.urls.near); areas.push(area);
    world.setTile(id, area, meshElevation(terrain.vertices, terrain.indices.near, (x, z) => tileElevation(terrain, x, z)));
  }
  let crossed = false;
  for (const area of areas) for (const road of area.roads) {
    if (!pedestrianRoad(road.tags)) continue;
    for (const point of road.points) {
      if (Math.abs(point[0]) > .01 || point[1] < 5 || point[1] > 495) continue;
      const before = world.probe(-.5, point[1]), after = world.probe(1.5, point[1]);
      if (before.height === undefined || after.height === undefined || Math.abs(before.height - after.height) > .5) continue;
      const walker = new Walker(world); walker.position.set(-.5, before.height + EYE_HEIGHT, point[1]); walker.yaw = -Math.PI / 2; walker.keys.add('forward'); for (let i = 0; i < 4; i++) walker.step(.25);
      if (walker.position.x > 0) { crossed = true; expect(Math.abs(walker.position.y - after.height - EYE_HEIGHT)).toBeLessThan(.2); break; }
    }
    if (crossed) break;
  }
  expect(crossed).toBe(true); world.dispose();
});
