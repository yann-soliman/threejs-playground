import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute,
  Group, IcosahedronGeometry, InstancedMesh, Mesh, MeshStandardMaterial, Object3D,
  PlaneGeometry, ShapeGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildingBody, buildingRoof, buildingStyle, footprintShape, metres, paint, seedOf, signedArea } from './buildings';
import type { CityData, Point } from './types';

export interface CityModel {
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

function ribbon(points: Point[], width: number, elevation: number): BufferGeometry {
  // Jonctions continues à onglet borné : les segments ne se réduisent pas à des boîtes.
  const edges = points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)]!, next = points[Math.min(points.length - 1, i + 1)]!;
    const dx = next[0] - prev[0], dz = next[1] - prev[1], length = Math.hypot(dx, dz) || 1;
    return [[p[0] - dz / length * width / 2, p[1] + dx / length * width / 2], [p[0] + dz / length * width / 2, p[1] - dx / length * width / 2]] as [Point, Point];
  });
  const positions: number[] = [];
  for (let i = 1; i < edges.length; i++) {
    const [a, b] = edges[i - 1]!, [c, d] = edges[i]!;
    for (const p of [a, c, b, b, c, d]) positions.push(p[0], elevation, p[1]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createCity(data: CityData): CityModel {
  const group = new Group();
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
  const ground = add(new BoxGeometry(data.meta.width + 6, 9, data.meta.depth + 6), material('#c5c6b4'));
  ground.position.y = -4.6;
  const top = add(new PlaneGeometry(data.meta.width, data.meta.depth), material('#d4d2c4'), false);
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.01;

  const surfaceParts: BufferGeometry[] = [];
  // Parcs d'abord, puis places, puis eau : ordre stable de superposition.
  const surfaces = [...data.surfaces].sort((a, b) => ({ green: 0, plaza: 1, water: 2 }[a.kind] - { green: 0, plaza: 1, water: 2 }[b.kind]));
  for (const feature of surfaces) {
    let geometry: BufferGeometry = new ShapeGeometry(footprintShape(feature.rings));
    geometry = geometry.toNonIndexed();
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, feature.kind === 'water' ? 0.075 : feature.kind === 'plaza' ? 0.055 : 0.035, 0);
    surfaceParts.push(paint(geometry, new Color({ green: '#9fb48a', water: '#78aeb0', plaza: '#e0d5c0' }[feature.kind])));
  }
  batch(surfaceParts, material('#ffffff', true), false);

  const pavementParts: BufferGeometry[] = [], roadParts: BufferGeometry[] = [];
  for (const road of data.roads) {
    if (['proposed', 'construction', 'platform', 'corridor'].includes(road.tags.highway ?? '')) continue;
    const pedestrian = ['pedestrian', 'footway', 'path', 'steps', 'cycleway'].includes(road.tags.highway ?? '');
    const width = roadWidth(road.tags);
    if (!pedestrian) pavementParts.push(paint(ribbon(road.points, width + 3, 0.08), new Color('#c3bfb3')));
    roadParts.push(paint(ribbon(road.points, width, pedestrian ? 0.11 : 0.12), new Color(pedestrian ? '#ddd1bb' : '#999e9a')));
  }
  batch(pavementParts, material('#ffffff', true), false);
  batch(roadParts, material('#ffffff', true), false);


  const wallParts: BufferGeometry[] = [];
  for (const wall of data.walls) {
    const historic = wall.tags.historic === 'citywalls';
    const height = Math.min(20, metres(wall.tags.height) ?? (historic ? 9 : 1.6));
    const width = metres(wall.tags.width) ?? (historic ? 2.5 : 0.4);
    for (let i = 1; i < wall.points.length; i++) {
      const a = wall.points[i - 1]!, b = wall.points[i]!;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.05) continue;
      const geometry = new BoxGeometry(length, height, width).toNonIndexed();
      geometry.rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0]));
      geometry.translate((a[0] + b[0]) / 2, height / 2 + 0.16, (a[1] + b[1]) / 2);
      wallParts.push(paint(geometry, new Color(historic ? '#c5bba5' : '#c3c0b4')));
    }
  }
  batch(wallParts, material('#ffffff', true));

  const bodies: BufferGeometry[] = [], roofs: BufferGeometry[] = [], cornices: BufferGeometry[] = [];
  const windowTransforms: { x: number; y: number; z: number; angle: number; w: number; h: number; lit: boolean }[] = [];
  let estimatedHeights = 0;
  for (const feature of data.buildings) {
    const style = buildingStyle(feature);
    if (style.heightSource === 'estimated') estimatedHeights++;
    bodies.push(buildingBody(feature, style));
    roofs.push(buildingRoof(feature, style));
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
          for (const [p, h] of [[a, y], [b, y], [b, y + 0.12], [a, y], [b, y + 0.12], [a, y + 0.12]] as [Point, number][]) positions.push(p[0] + nx * 0.08, h + 0.16, p[1] + nz * 0.08);
        }
        const trim = new BufferGeometry();
        trim.setAttribute('position', new Float32BufferAttribute(positions, 3));
        trim.computeVertexNormals();
        cornices.push(paint(trim, style.facade.clone().multiplyScalar(1.08)));
        const columns = Math.floor(length / 3.2);
        for (let column = 0; column < columns; column++) {
          const t = (column + 0.5) / columns;
          for (let floor = 0; floor < style.levels; floor++) {
            const shop = floor === 0 && seed % 4 === 0;
            windowTransforms.push({
              x: a[0] + dx * t + nx * 0.11,
              z: a[1] + dz * t + nz * 0.11,
              y: style.base + 0.16 + (floor + 0.52) * floorHeight,
              angle: Math.atan2(nx, nz), w: shop ? 1.65 : 0.95 + seed % 3 * 0.12,
              h: Math.min(floorHeight * 0.58, shop ? 2 : 1.6), lit: (seed + floor + column) % 11 === 0,
            });
          }
        }
      }
    }
  }
  batch(bodies, material('#ffffff', true));
  batch(roofs, material('#ffffff', true));
  batch(cornices, material('#ffffff', true), false);
  const dummy = new Object3D();
  function instances(geometry: BufferGeometry, surface: MeshStandardMaterial, count: number): InstancedMesh {
    geometries.add(geometry);
    const mesh = new InstancedMesh(geometry, surface, count);
    group.add(mesh);
    return mesh;
  }
  const frames = instances(new PlaneGeometry(1, 1), material('#f0e5ce'), windowTransforms.length);
  const windows = instances(new PlaneGeometry(1, 1), material('#ffffff'), windowTransforms.length);
  windowTransforms.forEach((w, i) => {
    dummy.position.set(w.x, w.y, w.z);
    dummy.rotation.set(0, w.angle, 0);
    dummy.scale.set(w.w + 0.22, w.h + 0.22, 1);
    dummy.updateMatrix(); frames.setMatrixAt(i, dummy.matrix);
    dummy.position.x += Math.sin(w.angle) * 0.025;
    dummy.position.z += Math.cos(w.angle) * 0.025;
    dummy.scale.set(w.w, w.h, 1);
    dummy.updateMatrix(); windows.setMatrixAt(i, dummy.matrix);
    windows.setColorAt(i, new Color(w.lit ? '#b9ad85' : '#52666c'));
  });
  frames.computeBoundingSphere(); windows.computeBoundingSphere();

  const trunks = instances(new CylinderGeometry(0.22, 0.32, 3, 5), material('#8b7d63'), data.trees.length);
  const foliage = instances(new IcosahedronGeometry(1, 1), material('#ffffff'), data.trees.length);
  foliage.castShadow = true;
  data.trees.forEach(([x, z], i) => {
    const variation = seedOf(`${x}:${z}`);
    dummy.rotation.set(0, variation % 6, 0);
    dummy.position.set(x, 1.5, z); dummy.scale.set(1, 1, 1);
    dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 4.2;
    const size = 2 + variation % 4 * 0.35;
    dummy.scale.set(size, size * 1.15, size);
    dummy.updateMatrix(); foliage.setMatrixAt(i, dummy.matrix);
    foliage.setColorAt(i, new Color(['#7b956b', '#91a57b', '#658466', '#a2ae80'][variation % 4]!));
  });
  trunks.computeBoundingSphere(); foliage.computeBoundingSphere();
  let disposed = false;
  return { group, windows: windowTransforms.length, estimatedHeights, dispose: () => {
    if (disposed) return;
    disposed = true;
    group.traverse((object) => { if (object instanceof InstancedMesh) object.dispose(); });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    group.clear();
  } };
}
