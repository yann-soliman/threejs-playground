import { Vector3 } from 'three';
import { inFootprint } from './selection';
import { roadWidth } from './city';
import { metres } from './buildings';
import type { CityData, Feature, Point } from './types';
import type { CityManifest, TileChoice } from './tiles';

export const EYE_HEIGHT = 1.7;
export const PLAYER_RADIUS = .28;
export function nearestSegment(p: Point, a: Point, b: Point): Point {
  const dx = b[0] - a[0], dz = b[1] - a[1], length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length)) : 0;
  return [a[0] + t * dx, a[1] + t * dz];
}
export function footprintCollision(feature: Feature, x: number, z: number, radius = PLAYER_RADIUS): boolean {
  if (inFootprint(feature, x, z)) return true;
  return feature.rings.some((ring) => ring.some((p, i) => {
    const q = nearestSegment([x, z], p, ring[(i + 1) % ring.length]!);
    return Math.hypot(q[0] - x, q[1] - z) < radius;
  }));
}
export function pedestrianAccess(tags: Record<string, string>): boolean { return !['no', 'private', 'customers'].includes(tags.foot ?? tags.access ?? ''); }
function wallRadius(tags: Record<string, string>): number { return PLAYER_RADIUS + (metres(tags.width) ?? (tags.historic === 'citywalls' ? 2.5 : .4)) / 2; }
export function pedestrianRoad(tags: Record<string, string>): boolean {
  return pedestrianAccess(tags) && !['motorway', 'motorway_link', 'trunk', 'trunk_link', 'construction', 'steps'].includes(tags.highway ?? '') && !!tags.highway && !(tags.tunnel && tags.tunnel !== 'no') && Number(tags.layer ?? 0) >= 0 && (Number(tags.layer ?? 0) === 0 || !!tags.bridge && tags.bridge !== 'no');
}
export function walkingTiles(manifest: CityManifest, position: Vector3, yaw: number): TileChoice[] {
  const owner = `${Math.floor(position.x / 500)}_${Math.floor(position.z / 500)}`;
  const forward = new Vector3(-Math.sin(yaw) * 240, 0, -Math.cos(yaw) * 240).add(position);
  return manifest.tiles.map((tile) => {
    const [x0, z0, x1, z1] = tile.bounds as [number, number, number, number];
    const distance = (p: Vector3): number => Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(z0 - p.z, 0, p.z - z1));
    return { tile, lod: 'near' as const, priority: tile.id === owner ? -1000 : distance(position) * 2 + distance(forward) };
  }).filter((choice) => choice.priority < 700).sort((a, b) => a.priority - b.priority || a.tile.id.localeCompare(b.tile.id)).slice(0, 6);
}
interface WalkTile { data: CityData; sample: (x: number, z: number) => number; bins: Map<string, Feature[]>; roads: Map<string, CityData['roads']>; surfaces: Map<string, CityData['surfaces']>; walls: Map<string, CityData['walls']> }
export type WalkResult = { height?: number; reason?: 'loading' | 'obstacle' | 'water' | 'access' };
/** Index CPU uniquement : empreintes exactes proches, cases de 25 m et tabliers existants. */
export class WalkingWorld {
  private readonly tiles = new Map<string, WalkTile>();
  constructor(private readonly decks: Record<string, number>, private readonly boundary: Point[][][]) {}
  get count(): number { return this.tiles.size; }
  setTile(id: string, data: CityData, sample: WalkTile['sample']): void {
    const bins = new Map<string, Feature[]>();
    for (const feature of data.buildings) {
      const points = feature.rings.flat(), xs = points.map((p) => p[0]), zs = points.map((p) => p[1]);
      for (let x = Math.floor((Math.min(...xs) - PLAYER_RADIUS) / 25); x <= Math.floor((Math.max(...xs) + PLAYER_RADIUS) / 25); x++) for (let z = Math.floor((Math.min(...zs) - PLAYER_RADIUS) / 25); z <= Math.floor((Math.max(...zs) + PLAYER_RADIUS) / 25); z++) {
        const key = `${x}_${z}`, entries = bins.get(key) ?? []; entries.push(feature); bins.set(key, entries);
      }
    }
    const index = <T,>(items: T[], pointsOf: (item: T) => Point[], margin: (item: T) => number): Map<string, T[]> => {
      const result = new Map<string, T[]>();
      for (const item of items) {
        const points = pointsOf(item); if (!points.length) continue;
        const xs = points.map((p) => p[0]), zs = points.map((p) => p[1]), pad = margin(item);
        for (let x = Math.floor((Math.min(...xs) - pad) / 25); x <= Math.floor((Math.max(...xs) + pad) / 25); x++) for (let z = Math.floor((Math.min(...zs) - pad) / 25); z <= Math.floor((Math.max(...zs) + pad) / 25); z++) {
          const key = `${x}_${z}`, entries = result.get(key) ?? []; entries.push(item); result.set(key, entries);
        }
      }
      return result;
    };
    this.tiles.set(id, { data, sample, bins,
      roads: index(data.roads, (road) => road.points, (road) => roadWidth(road.tags) / 2),
      surfaces: index(data.surfaces.filter((surface) => surface.kind === 'water' || !pedestrianAccess(surface.tags)), (surface) => surface.rings.flat(), () => PLAYER_RADIUS),
      walls: index(data.walls, (wall) => wall.points, (wall) => wallRadius(wall.tags)),
    });
  }
  removeTile(id: string): void { this.tiles.delete(id); }
  probe(x: number, z: number): WalkResult {
    const tile = this.tiles.get(`${Math.floor(x / 500)}_${Math.floor(z / 500)}`);
    if (!tile || [[x - PLAYER_RADIUS, z], [x + PLAYER_RADIUS, z], [x, z - PLAYER_RADIUS], [x, z + PLAYER_RADIUS]].some(([px, pz]) => !this.tiles.has(`${Math.floor(px! / 500)}_${Math.floor(pz! / 500)}`))) return { reason: 'loading' };
    if (!this.boundary.some((rings) => inFootprint({ rings, id: '', tags: {} }, x, z))) return { reason: 'access' };
    const bin = `${Math.floor(x / 25)}_${Math.floor(z / 25)}`;
    // Voisins de tuile : un disque ne doit jamais traverser une empreinte découpée.
    for (const area of this.tiles.values()) for (const feature of area.bins.get(bin) ?? []) if (footprintCollision(feature, x, z)) return { reason: 'obstacle' };
    for (const road of tile.roads.get(bin) ?? []) {
      for (let i = 1; i < road.points.length; i++) {
        const q = nearestSegment([x, z], road.points[i - 1]!, road.points[i]!);
        if (Math.hypot(q[0] - x, q[1] - z) > roadWidth(road.tags) / 2 - PLAYER_RADIUS) continue;
        if (!pedestrianRoad(road.tags)) return { reason: 'access' };
        const deck = this.decks[road.id.split('@')[0]!];
        if (road.tags.bridge && road.tags.bridge !== 'no') return deck === undefined ? { reason: 'access' } : { height: deck + .12 };
      }
    }
    for (const surface of tile.surfaces.get(bin) ?? []) if (footprintCollision(surface, x, z)) return { reason: surface.kind === 'water' ? 'water' : 'access' };
    for (const wall of tile.walls.get(bin) ?? []) for (let i = 1; i < wall.points.length; i++) {
      const q = nearestSegment([x, z], wall.points[i - 1]!, wall.points[i]!);
      if (Math.hypot(q[0] - x, q[1] - z) < wallRadius(wall.tags)) return { reason: 'obstacle' };
    }
    const height = tile.sample(x, z) + .12;
    return Number.isFinite(height) ? { height } : { reason: 'loading' };
  }
  spawn(target: Vector3): Vector3 | undefined {
    const candidates: { point: Point; score: number }[] = [];
    for (const area of this.tiles.values()) for (const road of area.data.roads) {
      if (!pedestrianRoad(road.tags)) continue;
      for (let i = 1; i < road.points.length; i++) {
        const point = nearestSegment([target.x, target.z], road.points[i - 1]!, road.points[i]!);
        const distance = Math.hypot(point[0] - target.x, point[1] - target.z);
        if (distance < 400) candidates.push({ point, score: distance + (['pedestrian', 'footway', 'path', 'living_street'].includes(road.tags.highway ?? '') ? 0 : 25) });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    for (const { point } of candidates) {
      const result = this.probe(...point);
      if (result.height !== undefined) return new Vector3(point[0], result.height + EYE_HEIGHT, point[1]);
    }
    return undefined;
  }
  heading(position: Vector3, current: number): number {
    let best = Infinity, heading = current;
    for (const tile of this.tiles.values()) for (const road of tile.data.roads) {
      if (!pedestrianRoad(road.tags)) continue;
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1]!, b = road.points[i]!, q = nearestSegment([position.x, position.z], a, b);
        const distance = Math.hypot(q[0] - position.x, q[1] - position.z); if (distance >= best || Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) continue;
        best = distance; heading = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
        if (Math.cos(heading - current) < 0) heading += Math.PI;
      }
    }
    return heading;
  }
  dispose(): void { this.tiles.clear(); }
}
export function movementKey(event: Pick<KeyboardEvent, 'code' | 'key'>): string | undefined {
  return ({ KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right', ShiftLeft: 'fast', ShiftRight: 'fast' } as Record<string, string>)[event.code] ?? ({ z: 'forward', w: 'forward', s: 'back', q: 'left', a: 'left', d: 'right' } as Record<string, string>)[event.key.toLowerCase()];
}
export function editableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (!!target.closest('input, select, textarea, button, a') || target.isContentEditable);
}
export class Walker {
  readonly position = new Vector3();
  readonly keys = new Set<string>();
  private inputTime: number | undefined;
  private speed = 1.8;
  get currentSpeed(): number { return this.speed; }
  private readonly pendingSteps: { seconds: number; keys: Set<string> }[] = [];
  yaw = 0;
  pitch = 0;
  blocked: WalkResult['reason'] | 'slope';
  constructor(private readonly world: WalkingWorld) {}
  get moving(): boolean { return ['forward', 'back', 'left', 'right'].some((key) => this.keys.has(key)); }
  private recordInput(now: number): void {
    if (this.inputTime !== undefined && this.moving && now > this.inputTime) this.pendingSteps.push({ seconds: (now - this.inputTime) / 1000, keys: new Set(this.keys) });
    this.inputTime = now;
  }
  setKey(key: string, pressed: boolean, now = performance.now()): void {
    if (this.keys.has(key) === pressed) return;
    this.recordInput(now); if (pressed) this.keys.add(key); else this.keys.delete(key);
  }
  advance(now: number): boolean {
    this.recordInput(now);
    const activeKeys = new Set(this.keys); let moved = false, remaining = .25;
    for (const command of this.pendingSteps.splice(0)) {
      this.keys.clear(); command.keys.forEach((key) => this.keys.add(key));
      const seconds = Math.min(command.seconds, remaining); remaining -= seconds;
      moved = this.step(seconds) || moved;
    }
    this.keys.clear(); activeKeys.forEach((key) => this.keys.add(key)); return moved;
  }
  look(dx: number, dy: number): void { this.yaw -= dx * .0025; this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - dy * .0025)); }
  step(seconds: number): boolean {
    let forward = Number(this.keys.has('forward')) - Number(this.keys.has('back'));
    let right = Number(this.keys.has('right')) - Number(this.keys.has('left'));
    const length = Math.hypot(forward, right); if (!length || seconds <= 0) return false;
    forward /= length; right /= length;
    // Intégration analytique : même transition à toute cadence ; pauses longues ignorées.
    const dt = Math.min(seconds, .25), target = this.keys.has('fast') ? 6.5 : 1.8;
    const decay = Math.exp(-dt / .15);
    const distance = target * dt + (this.speed - target) * .15 * (1 - decay);
    this.speed = target + (this.speed - target) * decay;
    const count = Math.ceil(distance / .12), dx = (-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * right) * distance / count, dz = (-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * right) * distance / count;
    let moved = false; this.blocked = undefined;
    const attempt = (x: number, z: number): boolean => {
      const result = this.world.probe(x, z);
      if (result.height === undefined) { this.blocked = result.reason; return false; }
      const delta = Math.abs(result.height + EYE_HEIGHT - this.position.y), horizontal = Math.hypot(x - this.position.x, z - this.position.z);
      const ahead = horizontal > 1e-8 ? this.world.probe(x + (x - this.position.x) / horizontal, z + (z - this.position.z) / horizontal) : {};
      const steep = ahead.height !== undefined && Math.abs(ahead.height + EYE_HEIGHT - this.position.y) > .18 + (horizontal + 1) * .65;
      if (delta > .18 + horizontal * .65 || steep) { this.blocked = 'slope'; return false; }
      this.position.set(x, result.height + EYE_HEIGHT, z); moved = true; return true;
    };
    for (let i = 0; i < count; i++) {
      if (attempt(this.position.x + dx, this.position.z + dz)) continue;
      if (this.blocked === 'loading') break;
      // Décomposition tangentielle : glisser le long des murs sans traverser leurs angles.
      if (Math.abs(dx) > 1e-8) attempt(this.position.x + dx, this.position.z);
      if (Math.abs(dz) > 1e-8) attempt(this.position.x, this.position.z + dz);
    }
    return moved;
  }
  stop(): void { this.keys.clear(); this.pendingSteps.length = 0; this.inputTime = undefined; this.speed = 1.8; }
}
