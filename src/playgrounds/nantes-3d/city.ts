import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute,
  Group, IcosahedronGeometry, InstancedMesh, Mesh, MeshStandardMaterial, Object3D,
  PlaneGeometry, ShapeGeometry,
} from 'three';
import { createLandmarks, landmarkCollisionFeatures } from './landmarks';
import { landmarkForFeature } from './landmarks/registry';
import { createStreetDetails, storefront } from './street-details';
import { streetRoadGeometry } from './street-roads';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildingBody, buildingFoundation, buildingRoof, buildingStyle, footprintShape, metres, paint, seedOf, signedArea } from './buildings';
import { atmosphereUniforms, waterMaterial, windowIllumination, windowMaterial } from './atmosphere';
import type { AtmosphereUniforms } from './atmosphere';
import { meshElevation, sampleLine, subdivideSurface, terrainGeometry, tileElevation } from './terrain';
import type { TerrainTile } from './terrain';
import type { CityData, Point } from './types';

export interface CityModel {
  surfaceElevation: (x: number, z: number) => number;
  group: Group;
  windows: number;
  estimatedHeights: number;
  dispose: () => void;
}

export function roadWidth(tags: Record<string, string>): number {
  const tagged = Number.parseFloat(tags.width ?? '');
  if (Number.isFinite(tagged) && tagged > 0) return Math.min(tagged, 30);
  const highway = tags.highway ?? '';
  if (['footway', 'path', 'steps', 'cycleway'].includes(highway)) return 1.8;
  if (highway === 'pedestrian') return 5;
  if (highway === 'service') return 3;
  if (['primary', 'secondary', 'tertiary'].includes(highway)) return 8;
  return 5.5;
}

function ribbon(points: Point[], width: number, elevation: number, sample: (x: number, z: number) => number = () => 0): BufferGeometry {
  // Jonctions continues à onglet borné : les segments ne se réduisent pas à des boîtes.
  const edges = points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)]!, next = points[Math.min(points.length - 1, i + 1)]!;
    const dx = next[0] - prev[0], dz = next[1] - prev[1], length = Math.hypot(dx, dz) || 1;
    return [[p[0] - dz / length * width / 2, p[1] + dx / length * width / 2], [p[0] + dz / length * width / 2, p[1] - dx / length * width / 2]] as [Point, Point];
  });
  const positions: number[] = [];
  for (let i = 1; i < edges.length; i++) {
    const [a, b] = edges[i - 1]!, [c, d] = edges[i]!;
    for (const p of [a, c, b, b, c, d]) positions.push(p[0], elevation + sample(p[0], p[1]), p[1]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export type DetailLevel = 'near' | 'medium' | 'far';

export function createCity(data: CityData, options: { lod?: DetailLevel; ground?: boolean; atmosphere?: AtmosphereUniforms; terrain?: TerrainTile; elevation?: (x: number, z: number) => number; waterLevels?: Record<string, number>; bridgeLevels?: Record<string, number>; waterSurfaces?: CityData['surfaces']; surfaceRings?: TerrainTile['surfaceRings']; groundElevation?: (x: number, z: number) => number } = {}): CityModel {
  const lod = options.lod ?? 'near';
  const atmosphere = options.atmosphere ?? atmosphereUniforms();
  const group = new Group();
  const fallback = options.elevation ?? (() => 0);
  const measured = options.terrain ? (x: number, z: number): number => tileElevation(options.terrain!, x, z) : fallback;
  const sample = options.terrain ? meshElevation(options.terrain.vertices, options.terrain.indices[lod], measured) : options.groundElevation ?? measured;
  const step = lod === 'near' ? 20 : lod === 'medium' ? 50 : 100;
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshStandardMaterial>();
  function material(color: string, vertexColors = false): MeshStandardMaterial {
    const result = new MeshStandardMaterial({ color, vertexColors, roughness: 0.86, side: DoubleSide });
    materials.add(result);
    return result;
  }
  function add(geometry: BufferGeometry, surface: MeshStandardMaterial, shadows = true): Mesh {
    geometries.add(geometry);
    const mesh = new Mesh(geometry, surface);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  function batch(parts: BufferGeometry[], surface: MeshStandardMaterial, shadows = true): void {
    if (!parts.length) return;
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    if (!merged) throw new Error('Assemblage des géométries impossible');
    add(merged, surface, shadows);
  }
  if (options.terrain?.indices[lod].length) add(terrainGeometry(options.terrain.vertices, options.terrain.indices[lod], options.elevation), material('#d4d2c4'), false);
  if (options.ground !== false) {
  const ground = add(new BoxGeometry(data.meta.width + 6, 9, data.meta.depth + 6), material('#c5c6b4'));
  ground.position.y = -4.6;
  const top = add(new PlaneGeometry(data.meta.width, data.meta.depth), material('#d4d2c4'), false);
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.01;
  }

  const surfaceParts: BufferGeometry[] = [], waterParts: BufferGeometry[] = [];
  // Parcs d'abord, puis places, puis eau : ordre stable de superposition.
  const waterSurfaces = options.terrain?.waterSurfaces ?? options.waterSurfaces;
  const visualSurfaces = waterSurfaces ? [...data.surfaces.filter((f) => f.kind !== 'water'), ...waterSurfaces] : data.surfaces;
  const surfaces = visualSurfaces.flatMap((feature) => {
    const clipped = (options.terrain?.surfaceRings ?? options.surfaceRings)?.[feature.id];
    return clipped ? clipped.map((rings) => ({ ...feature, rings })) : [feature];
  }).sort((a, b) => ({ green: 0, plaza: 1, water: 2 }[a.kind] - { green: 0, plaza: 1, water: 2 }[b.kind]));
  for (const feature of surfaces) {
    let geometry: BufferGeometry = new ShapeGeometry(footprintShape(feature.rings));
    geometry = geometry.toNonIndexed();
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, feature.kind === 'water' ? 0.075 : feature.kind === 'plaza' ? 0.055 : 0.035, 0);
    if (feature.kind === 'water') {
      geometry.translate(0, options.waterLevels?.[feature.id.split('@')[0]!] ?? 0, 0);
      waterParts.push(geometry);
    } else {
      if (options.terrain || options.elevation) geometry = subdivideSurface(geometry, sample, step);
      surfaceParts.push(paint(geometry, new Color(feature.kind === 'green' ? '#9fb48a' : '#e0d5c0')));
    }
  }
  batch(surfaceParts, material('#ffffff', true), false);
  if (waterParts.length) {
    const water = waterMaterial(atmosphere); materials.add(water);
    batch(waterParts, water, false);
  }

  const pavementParts: BufferGeometry[] = [], roadParts: BufferGeometry[] = [];
  for (const road of data.roads) {
    if (['proposed', 'construction', 'platform', 'corridor'].includes(road.tags.highway ?? '')) continue;
    if (road.tags.tunnel && road.tags.tunnel !== 'no' || Number(road.tags.layer) < 0) continue;
    const points = options.terrain || options.elevation ? sampleLine(road.points, lod === 'near' ? 10 : lod === 'medium' ? 20 : 50) : road.points;
    const deck = options.bridgeLevels?.[road.id.split('@')[0]!];
    const roadSample = deck !== undefined ? (): number => deck : sample;
    const pedestrian = ['pedestrian', 'footway', 'path', 'steps', 'cycleway'].includes(road.tags.highway ?? '');
    const tags = { ...road.tags, ...data.streets?.roads[road.id.split('/').slice(0, 2).join('/')] };
    const width = roadWidth(tags);
    if (!pedestrian && !['no', 'none'].includes(tags.sidewalk ?? '')) pavementParts.push(paint(ribbon(points, width + 3, 0.08, roadSample), new Color('#c3bfb3')));
    roadParts.push(paint(ribbon(points, width, pedestrian ? 0.11 : 0.12, roadSample), new Color(tags.highway === 'cycleway' ? '#a4b49d' : pedestrian ? '#ddd1bb' : ['paving_stones', 'cobblestone', 'sett'].includes(tags.surface ?? '') ? '#b6b2a7' : '#929a98')));
  }
  batch(pavementParts, material('#ffffff', true), false);
  batch(roadParts, material('#ffffff', true), false);


  const wallParts: BufferGeometry[] = [];
  for (const wall of data.walls) {
    const historic = wall.tags.historic === 'citywalls';
    const height = Math.min(20, metres(wall.tags.height) ?? (historic ? 9 : 1.6));
    const width = metres(wall.tags.width) ?? (historic ? 2.5 : 0.4);
    const points = options.terrain || options.elevation ? sampleLine(wall.points, 10) : wall.points;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!, b = points[i]!;
      const low = Math.min(sample(...a), sample(...b)), high = Math.max(sample(...a), sample(...b));
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.05) continue;
      const geometry = new BoxGeometry(length, height + high - low, width).toNonIndexed();
      geometry.rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0]));
      geometry.translate((a[0] + b[0]) / 2, (high + low + height) / 2 + 0.16, (a[1] + b[1]) / 2);
      wallParts.push(paint(geometry, new Color(historic ? '#c5bba5' : '#c3c0b4')));
    }
  }
  batch(wallParts, material('#ffffff', true));

  const bodies: BufferGeometry[] = [], foundations: BufferGeometry[] = [], roofs: BufferGeometry[] = [], cornices: BufferGeometry[] = [];
  const windowTransforms: { x: number; y: number; z: number; angle: number; w: number; h: number; light: [number, number, number] }[] = [];
  let estimatedHeights = 0;
  for (const feature of data.buildings) {
    if (landmarkForFeature(feature)) continue;
    const style = buildingStyle(feature);
    if (lod === 'far') { style.roofHeight = 0; style.roofShape = 'flat'; }
    if (style.heightSource === 'estimated') estimatedHeights++;
    const measured = options.terrain?.bases[feature.id];
    const levels = measured ?? [Math.min(...feature.rings[0]!.map(([x, z]) => sample(x, z))), Math.max(...feature.rings[0]!.map(([x, z]) => sample(x, z)))];
    const base = levels[1]!;
    if ((options.terrain || options.elevation) && style.base === 0) foundations.push(buildingFoundation(feature, levels[0]!, base, style.facade.clone().multiplyScalar(.82), true));
    bodies.push(buildingBody(feature, style, true).translate(0, base, 0));
    roofs.push(buildingRoof(feature, style).translate(0, base, 0));
    if (lod !== 'near') continue;
    const eaves = style.height - style.roofHeight;
    const seed = seedOf(feature.id);
    for (let r = 0; r < feature.rings.length; r++) {
      const ring = feature.rings[r]!;
      const normalSign = Math.sign(signedArea(ring)) * (r === 0 ? 1 : -1);
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
        const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
        if (length < 1) continue;
        const nx = dz / length * normalSign, nz = -dx / length * normalSign;
        // Bandeaux d'étage et corniche en géométrie regroupée.
        const positions: number[] = [];
        const floorHeight = (eaves - style.base) / style.levels;
        if (floorHeight < 2) continue;
        for (let floor = 1; floor <= style.levels; floor++) {
          const y = style.base + floor * floorHeight;
          for (const [p, h] of [[a, y], [b, y], [b, y + 0.12], [a, y], [b, y + 0.12], [a, y + 0.12]] as [Point, number][]) positions.push(p[0] + nx * 0.08, h + 0.16 + base, p[1] + nz * 0.08);
        }
        const trim = new BufferGeometry();
        trim.setAttribute('position', new Float32BufferAttribute(positions, 3));
        trim.computeVertexNormals();
        cornices.push(paint(trim, style.facade.clone().multiplyScalar(1.08)));
        const columns = Math.floor(length / 3.2);
        for (let column = 0; column < columns; column++) {
          const t = (column + 0.5) / columns;
          for (let floor = 0; floor < style.levels; floor++) {
            const shop = floor === 0 && !!storefront(feature, data.streets?.businesses);
            windowTransforms.push({
              x: a[0] + dx * t + nx * 0.11,
              z: a[1] + dz * t + nz * 0.11,
              y: base + style.base + 0.16 + (floor + 0.52) * floorHeight,
              angle: Math.atan2(nx, nz), w: shop ? 1.65 : 0.95 + seed % 3 * 0.12,
              h: Math.min(floorHeight * 0.58, shop ? 2 : 1.6), light: windowIllumination(`${feature.id}:${r}:${i}:${floor}:${column}`),
            });
          }
        }
      }
    }
  }
  batch(foundations, material('#ffffff', true));
  batch(bodies, material('#ffffff', true));
  batch(roofs, material('#ffffff', true));
  batch(cornices, material('#ffffff', true), false);
  const dummy = new Object3D();
  function instances(geometry: BufferGeometry, surface: MeshStandardMaterial, count: number): InstancedMesh {
    geometries.add(geometry);
    const mesh = new InstancedMesh(geometry, surface, count);
    if (count > 0) group.add(mesh);
    return mesh;
  }
  const windowGeometry = new PlaneGeometry(1, 1);
  const glass = windowMaterial(windowGeometry, windowTransforms.flatMap((w) => w.light), atmosphere, windowTransforms.flatMap((w) => [.11 / (w.w + .22), .11 / (w.h + .22)]));
  materials.add(glass);
  const windows = instances(windowGeometry, glass, windowTransforms.length);
  windowTransforms.forEach((w, i) => {
    dummy.position.set(w.x, w.y, w.z);
    dummy.rotation.set(0, w.angle, 0);
    dummy.scale.set(w.w + 0.22, w.h + 0.22, 1);
    dummy.updateMatrix(); windows.setMatrixAt(i, dummy.matrix);
    windows.setColorAt(i, new Color('#52666c'));
  });
  windows.computeBoundingSphere();

  const monuments = createLandmarks(data, lod, measured, options.terrain?.bases ?? {}, atmosphere);
  if (monuments.children.length) group.add(...monuments.children);
  const detailedData = { ...data, buildings: [...data.buildings, ...landmarkCollisionFeatures(data)] };
  const details = createStreetDetails(detailedData, lod, sample, options.terrain?.bases ?? {}, atmosphere);
  if (details.children.length) group.add(...details.children);
  if (lod === 'near') {
    const streetGeometry = streetRoadGeometry(detailedData, sample);
    if (streetGeometry.getAttribute('position').count) add(streetGeometry, material('#ffffff', true), false);
    else streetGeometry.dispose();
  }

  const trunks = instances(new CylinderGeometry(0.22, 0.32, 3, 5), material('#8b7d63'), data.trees.length);
  const foliage = instances(new IcosahedronGeometry(1, lod === 'near' ? 1 : 0), material('#ffffff'), data.trees.length);
  foliage.castShadow = true;
  data.trees.forEach(([x, z], i) => {
    const variation = seedOf(`${x}:${z}`);
    dummy.rotation.set(0, variation % 6, 0);
    const trunkHeight = .8 + variation % 5 * .12;
    dummy.position.set(x, sample(x, z) + 1.5 * trunkHeight, z); dummy.scale.set(.7 + variation % 3 * .15, trunkHeight, .7 + variation % 3 * .15);
    dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);

    const size = 2 + variation % 4 * 0.35;
    const canopyHeight = size * ([.8, 1.15, 1.35][variation % 3]!);
    dummy.position.y = sample(x, z) + 3 * trunkHeight + canopyHeight * .7;
    dummy.scale.set(size, canopyHeight, size);
    dummy.updateMatrix(); foliage.setMatrixAt(i, dummy.matrix);
    foliage.setColorAt(i, new Color(['#7b956b', '#91a57b', '#658466', '#a2ae80', '#6c8767', '#a6b584'][variation % 6]!));
  });
  trunks.computeBoundingSphere(); foliage.computeBoundingSphere();
  let disposed = false;
  return { surfaceElevation: sample, group, windows: windowTransforms.length + Number(monuments.userData.windows ?? 0), estimatedHeights, dispose: () => {
    if (disposed) return;
    disposed = true;
    group.traverse((object) => { if (object instanceof Mesh) { geometries.add(object.geometry); materials.add(object.material as MeshStandardMaterial); } if (object instanceof InstancedMesh) object.dispose(); });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    group.clear();
  } };
}
