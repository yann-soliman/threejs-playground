import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial } from 'three';
import type { DetailLevel } from './city';
import type { CityData, Point } from './types';

export interface ElevationGrid {
  origin: Point;
  width: number;
  depth: number;
  step: number;
  heights: number[]; // Centimètres NGF-IGN69, sans facteur d’exagération.
}
export interface TerrainTile {
  id: string;
  bounds: number[];
  origin: Point;
  size: number;
  step: number;
  heights: number[];
  vertices: number[];
  indices: Record<DetailLevel, number[]>;
  waterSurfaces?: CityData['surfaces'];
  surfaceRings?: Record<string, Point[][][]>;
  bases: Record<string, [number, number]>; // Minimum du MNT et niveau de fondation.
}
export interface TerrainOverview {
  surfaceRings?: TerrainTile['surfaceRings'];
  vertices: number[];
  indices: number[];
  grid: ElevationGrid;
  waterSurfaces?: CityData['surfaces'];
  waterLevels: Record<string, number>;
  bridgeLevels: Record<string, number>; // Tablier estimé, distinct du MNT et des tags OSM.
}
export interface TerrainManifest {
  range: [number, number];
  tiles: { id: string; url: string; bytes: number }[];
  overview: string;
  meta: { edition: string; verticalCrs: string; sourceResolution: number };
}
export function sampleElevation(grid: ElevationGrid | TerrainTile, x: number, z: number): number {
  const width = 'size' in grid ? grid.size : grid.width;
  const depth = 'size' in grid ? grid.size : grid.depth;
  const cx = Math.max(0, Math.min(width - 1, (x - grid.origin[0]) / grid.step));
  const cz = Math.max(0, Math.min(depth - 1, (z - grid.origin[1]) / grid.step));
  const x0 = Math.min(width - 2, Math.floor(cx)), z0 = Math.min(depth - 2, Math.floor(cz));
  const dx = cx - x0, dz = cz - z0;
  const values = [grid.heights[z0 * width + x0], grid.heights[z0 * width + x0 + 1], grid.heights[(z0 + 1) * width + x0], grid.heights[(z0 + 1) * width + x0 + 1]];
  if (values.some((v) => v === undefined || !Number.isFinite(v) || v === -9999900)) throw new Error('Altitude IGN absente');
  return (values[0]! * (1 - dx) * (1 - dz) + values[1]! * dx * (1 - dz) + values[2]! * (1 - dx) * dz + values[3]! * dx * dz) / 100;
}
export function tileElevation(tile: TerrainTile, x: number, z: number): number {
  return sampleElevation(tile, x, z);
}
export function terrainGeometry(vertices: number[], indices: number[], sample?: (x: number, z: number) => number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  if (sample) {
    const normals = new Float32Array(vertices.length);
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i]!, z = vertices[i + 2]!;
      const dx = (sample(x + 5, z) - sample(x - 5, z)) / 10, dz = (sample(x, z + 5) - sample(x, z - 5)) / 10;
      const length = Math.hypot(dx, 1, dz);
      normals.set([-dx / length, 1 / length, -dz / length], i);
    }
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  } else geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
/** Altitude sur les triangles effectivement affichés, pour éviter routes et parcs enterrés. */
export function meshElevation(vertices: number[], indices: number[], fallback: (x: number, z: number) => number): (x: number, z: number) => number {
  const bins = new Map<string, number[]>();
  for (let i = 0; i < indices.length; i += 3) {
    const ids = indices.slice(i, i + 3).map((n) => n * 3);
    const xs = ids.map((n) => vertices[n]!), zs = ids.map((n) => vertices[n + 2]!);
    for (let x = Math.floor(Math.min(...xs) / 100); x <= Math.floor(Math.max(...xs) / 100); x++) {
      for (let z = Math.floor(Math.min(...zs) / 100); z <= Math.floor(Math.max(...zs) / 100); z++) {
        const key = `${x}_${z}`, entries = bins.get(key) ?? []; entries.push(i); bins.set(key, entries);
      }
    }
  }
  return (x, z) => {
    for (const i of bins.get(`${Math.floor(x / 100)}_${Math.floor(z / 100)}`) ?? []) {
      const a = indices[i]! * 3, b = indices[i + 1]! * 3, c = indices[i + 2]! * 3;
      const ax = vertices[a]!, az = vertices[a + 2]!, bx = vertices[b]!, bz = vertices[b + 2]!, cx = vertices[c]!, cz = vertices[c + 2]!;
      const determinant = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(determinant) < 1e-8) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / determinant;
      const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / determinant;
      if (u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7) return u * vertices[a + 1]! + v * vertices[b + 1]! + (1 - u - v) * vertices[c + 1]!;
    }
    return fallback(x, z);
  };
}
export function terrainMesh(vertices: number[], indices: number[], sample?: (x: number, z: number) => number): Mesh {
  const mesh = new Mesh(terrainGeometry(vertices, indices, sample), new MeshStandardMaterial({ color: '#d4d2c4', roughness: 1 }));
  mesh.receiveShadow = true;
  return mesh;
}
export function subdivideSurface(geometry: BufferGeometry, sample: (x: number, z: number) => number, step: number): BufferGeometry {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = source.getAttribute('position');
  const vertices: number[] = [];
  const append = (a: number[], b: number[], c: number[]): void => {
    const lengths = [Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!), Math.hypot(b[0]! - c[0]!, b[2]! - c[2]!), Math.hypot(c[0]! - a[0]!, c[2]! - a[2]!)];
    const longest = Math.max(...lengths);
    if (longest > step) {
      const edge = lengths.indexOf(longest);
      const points = [a, b, c], p = points[edge]!, q = points[(edge + 1) % 3]!, other = points[(edge + 2) % 3]!;
      const midpoint = p.map((value, i) => (value + q[i]!) / 2);
      append(p, midpoint, other); append(midpoint, q, other);
    } else for (const p of [a, b, c]) vertices.push(p[0]!, sample(p[0]!, p[2]!) + p[1]!, p[2]!);
  };
  for (let i = 0; i < positions.count; i += 3) {
    const point = (n: number): number[] => [positions.getX(n), positions.getY(n), positions.getZ(n)];
    append(point(i), point(i + 1), point(i + 2));
  }
  if (source !== geometry) source.dispose();
  geometry.dispose();
  const result = new BufferGeometry(); result.setAttribute('position', new Float32BufferAttribute(vertices, 3)); result.computeVertexNormals();
  return result;
}
export function sampleLine(points: Point[], step: number): Point[] {
  const result: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    if (i === 1) result.push(a);
    for (let n = 1; n <= count; n++) result.push([a[0] + (b[0] - a[0]) * n / count, a[1] + (b[1] - a[1]) * n / count]);
  }
  return result;
}

/** Cache CPU séparé des géométries : un fichier altitude par tuile, partagé entre LOD. */
export class TerrainStore {
  private readonly cache = new Map<string, TerrainTile>();
  private readonly pending = new Map<string, { controller: AbortController; promise: Promise<TerrainTile>; users: Set<symbol> }>();
  private disposed = false;
  constructor(private readonly fetch: (url: string, signal: AbortSignal) => Promise<TerrainTile>, private readonly limit = 24) {}
  peek(id: string): TerrainTile | undefined { return this.cache.get(id); }
  load(id: string, url: string, signal: AbortSignal): Promise<TerrainTile> {
    if (this.disposed || signal.aborted) return Promise.reject(new DOMException('Terrain annulé', 'AbortError'));
    const cached = this.cache.get(id);
    if (cached) { this.cache.delete(id); this.cache.set(id, cached); return Promise.resolve(cached); }
    let pending = this.pending.get(id);
    if (!pending || pending.controller.signal.aborted) {
      const controller = new AbortController();
      const item = { controller, users: new Set<symbol>(), promise: undefined as unknown as Promise<TerrainTile> };
      item.promise = Promise.resolve().then(() => this.fetch(url, controller.signal)).then((data) => {
        if (this.disposed || controller.signal.aborted) throw new DOMException('Terrain annulé', 'AbortError');
        this.cache.set(id, data);
        while (this.cache.size > this.limit) this.cache.delete(this.cache.keys().next().value!);
        return data;
      }).finally(() => { if (this.pending.get(id) === item) this.pending.delete(id); });
      pending = item; this.pending.set(id, item);
    }
    const item = pending, user = Symbol(); item.users.add(user);
    return new Promise<TerrainTile>((resolve, reject) => {
      const abort = (): void => {
        item.users.delete(user);
        if (!item.users.size) item.controller.abort();
        reject(new DOMException('Terrain annulé', 'AbortError'));
      };
      signal.addEventListener('abort', abort, { once: true });
      item.promise.then((data) => { if (!signal.aborted && !this.disposed) resolve(data); else reject(new DOMException('Terrain annulé', 'AbortError')); }, reject)
        .finally(() => { signal.removeEventListener('abort', abort); item.users.delete(user); });
    });
  }
  dispose(): void { this.disposed = true; for (const item of this.pending.values()) item.controller.abort(); this.pending.clear(); this.cache.clear(); }
}
