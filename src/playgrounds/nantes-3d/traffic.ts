import { BoxGeometry, Color, DynamicDrawUsage, Frustum, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seedOf } from './buildings';
import { roadWidth } from './city';
import type { CityData, Point } from './types';

export type TrafficDensity = 'off' | 'low' | 'normal';
export interface TrafficRoute { id: string; points: Point[]; distances: number[]; length: number; width: number; oneWay: boolean; speed: number; offset: number }
export function roadEligible(tags: Record<string, string>): boolean {
  return ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street'].includes(tags.highway ?? '')
    && !['no', 'private', 'agricultural', 'forestry', 'delivery', 'destination'].includes(tags.motor_vehicle ?? tags.vehicle ?? tags.access ?? '')
    && !(tags.tunnel && tags.tunnel !== 'no') && !(Number(tags.layer) < 0);
}
export function trafficRoute(road: CityData['roads'][number]): TrafficRoute | undefined {
  if (!roadEligible(road.tags)) return undefined;
  const points = road.points.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1]![0], p[1] - a[i - 1]![1]) > .01).map((p) => [...p] as Point);
  if (road.tags.oneway === '-1') points.reverse();
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  const length = distances.at(-1)!;
  if (length < 45) return undefined;
  const speed = road.tags.highway === 'living_street' ? 2 : 4 + seedOf(road.id) % 3;
  const oneWay = ['yes', '1', 'true', '-1'].includes(road.tags.oneway ?? '') || road.tags.oneway !== 'no' && (road.tags.junction === 'roundabout' || road.tags.highway === 'motorway');
  const width = roadWidth(road.tags), lanes = Number.parseInt(road.tags.lanes ?? '', 10);
  return { id: road.id, points, distances, length, width, oneWay, speed, offset: oneWay && lanes === 1 ? 0 : Math.min(1.5, width * .23) };
}
export function routePosition(route: TrafficRoute, distance: number, reverse = false): { x: number; z: number; angle: number; scale: number } {
  const d = Math.max(0, Math.min(route.length, reverse ? route.length - distance : distance));
  let i = 1; while (i < route.distances.length - 1 && route.distances[i]! < d) i++;
  const a = route.points[i - 1]!, b = route.points[i]!, length = route.distances[i]! - route.distances[i - 1]!, t = (d - route.distances[i - 1]!) / length;
  // Tangente continue calculée sur une fenêtre de longueur réelle autour du virage.
  const center = (distance: number): Point => {
    const bounded = Math.max(0, Math.min(route.length, distance));
    let segment = 1; while (segment < route.distances.length - 1 && route.distances[segment]! < bounded) segment++;
    const from = route.points[segment - 1]!, to = route.points[segment]!;
    const fraction = (bounded - route.distances[segment - 1]!) / (route.distances[segment]! - route.distances[segment - 1]!);
    return [from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction];
  };
  const before = center(d - 4), after = center(d + 4);
  let dx = after[0] - before[0], dz = after[1] - before[1];
  if (Math.hypot(dx, dz) < 1e-6) { dx = b[0] - a[0]; dz = b[1] - a[1]; }
  if (reverse) { dx = -dx; dz = -dz; }
  const norm = Math.hypot(dx, dz), offset = route.offset;
  return { x: a[0] + (b[0] - a[0]) * t - dz / norm * offset, z: a[1] + (b[1] - a[1]) * t + dx / norm * offset,
    angle: Math.atan2(dx, dz), scale: Math.min(1, distance / 9, (route.length - distance) / 9) };
}
interface TrafficArea { routes: TrafficRoute[]; sample: (x: number, z: number) => number; decks: Record<string, number> }
/** Trois lots d’instances partagés par toute la circulation visible. */
export class Traffic {
  readonly group = new Group();
  private readonly areas = new Map<string, TrafficArea>();
  private readonly dummy = new Object3D();
  private meshes: InstancedMesh[] = [];
  private selected: { route: TrafficRoute; area: TrafficArea; seed: number; reverse: boolean }[] = [];
  private elapsed = 0;
  private readonly colors = ['#d7785c', '#668ba3', '#d9c78b', '#eeeeea', '#6f8073'].map((color) => new Color(color));
  count = 0;
  constructor(private readonly capacity = 96) {}
  setTile(id: string, data: CityData, sample: TrafficArea['sample'], decks: TrafficArea['decks']): void {
    this.areas.set(id, { routes: data.roads.map(trafficRoute).filter((r): r is TrafficRoute => !!r), sample, decks });
  }
  removeTile(id: string): void { const area = this.areas.get(id); this.areas.delete(id); this.selected = this.selected.filter((v) => v.area !== area); this.count = this.selected.length; this.meshes.forEach((m) => { m.count = this.count; }); this.update(0); }
  select(camera: PerspectiveCamera, target: Vector3, density: TrafficDensity, reduced: boolean): void {
    const limit = reduced || density === 'off' || camera.position.distanceTo(target) > 2600 ? 0 : density === 'low' ? Math.floor(this.capacity / 3) : this.capacity;
    if (!limit) { this.selected = []; this.count = 0; this.meshes.forEach((m) => { m.count = 0; m.visible = false; }); return; }
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const entries: typeof this.selected = [];
    for (const area of this.areas.values()) for (const route of area.routes) {
      const mid = routePosition(route, route.length / 2), position = new Vector3(mid.x, area.sample(mid.x, mid.z), mid.z);
      if (position.distanceTo(target) > 1800 || !frustum.containsPoint(position)) continue;
      entries.push({ route, area, seed: seedOf(route.id), reverse: false });
      if (!route.oneWay && route.length > 110) entries.push({ route, area, seed: seedOf(route.id) + 77, reverse: true });
    }
    entries.sort((a, b) => a.seed - b.seed);
    this.selected = entries.slice(0, limit); this.count = this.selected.length;
    if (this.count && !this.meshes.length) this.createMeshes();
    this.meshes.forEach((m) => { m.count = this.count; m.visible = this.count > 0; });
    this.update(0);
  }
  private createMeshes(): void {
    const wheels = [-.85, .85].flatMap((x) => [-1.1, 1.1].map((z) => new BoxGeometry(.3, .48, .65).translate(x, .24, z)));
    const wheelGeometry = mergeGeometries(wheels)!; wheels.forEach((wheel) => wheel.dispose());
    const shapes = [new BoxGeometry(1.7, .65, 3.6).translate(0, .65, 0), new BoxGeometry(1.4, .6, 1.85).translate(0, 1.2, -.15), wheelGeometry];
    const colors = ['#ffffff', '#354953', '#343737'];
    this.meshes = shapes.map((geometry, i) => {
      const mesh = new InstancedMesh(geometry, new MeshStandardMaterial({ color: colors[i], roughness: .65 }), this.capacity);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage); mesh.frustumCulled = false; mesh.castShadow = false;
      this.group.add(mesh); return mesh;
    });
  }
  update(seconds: number): void {
    // Sur GPU lent, plafonner le déplacement pour ne pas sauter un quartier entre deux dessins.
    this.elapsed += Math.min(.25, Math.max(0, seconds));
    this.selected.forEach(({ route, area, seed, reverse }, i) => {
      const distance = (seed % 1000 / 1000 * route.length + this.elapsed * route.speed) % route.length;
      const pose = routePosition(route, distance, reverse), deck = area.decks[route.id.split('@')[0]!];
      this.dummy.position.set(pose.x, (deck ?? area.sample(pose.x, pose.z)) + .14, pose.z);
      const dx = Math.sin(pose.angle), dz = Math.cos(pose.angle);
      const ground = (x: number, z: number): number => deck ?? area.sample(x, z);
      const pitch = -Math.atan2(ground(pose.x + dx * 1.5, pose.z + dz * 1.5) - ground(pose.x - dx * 1.5, pose.z - dz * 1.5), 3);
      this.dummy.rotation.order = 'YXZ'; this.dummy.rotation.set(pitch, pose.angle, 0); this.dummy.scale.setScalar(Math.max(0, pose.scale)); this.dummy.updateMatrix();
      this.meshes.forEach((mesh) => mesh.setMatrixAt(i, this.dummy.matrix));
      this.meshes[0]!.setColorAt(i, this.colors[seed % 5]!);
    });
    this.meshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; });
  }
  get drawCalls(): number { return this.count ? this.meshes.length : 0; }
  dispose(): void { this.meshes.forEach((mesh) => { mesh.geometry.dispose(); (mesh.material as MeshStandardMaterial).dispose(); mesh.dispose(); }); this.meshes = []; this.areas.clear(); this.selected = []; this.count = 0; this.group.clear(); }
}
