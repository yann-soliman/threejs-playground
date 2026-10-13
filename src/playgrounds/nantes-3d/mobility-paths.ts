import type { Point } from './types';
import { seedOf } from './buildings';

export type AgentKind = 'pedestrian' | 'cyclist';
export type UrbanDensity = 'off' | 'low' | 'normal';
export interface MobilityPath { id: string; osmIds: string[]; points: Point[]; tags: Record<string, string>; kind?: AgentKind; deck?: number; offsetEstimated?: boolean; closed?: boolean; stops?: { id: string; distance: number; point: Point; tags: Record<string, string> }[] }
export interface AgentRoute extends MobilityPath { distances: number[]; length: number; oneWay: boolean }
export interface MobilityManifest { tiles: Record<string, string>; trams: string; counts: Record<string, number>; meta: { osmTimestamp: string; source: string; license: string } }
export interface TramData { routes: MobilityPath[] }

export function agentAccess(tags: Record<string, string>, kind: AgentKind): boolean {
  const access = kind === 'pedestrian' ? tags.foot ?? tags.access : tags.bicycle ?? tags.vehicle ?? tags.access;
  if (['no', 'private', 'customers', 'use_sidepath', 'dismount'].includes(access ?? '')) return false;
  if (tags.tunnel && tags.tunnel !== 'no' || Number(tags.layer ?? 0) < 0 || Number(tags.layer ?? 0) > 0 && (!tags.bridge || tags.bridge === 'no')) return false;
  const h = tags.highway ?? '';
  return kind === 'pedestrian'
    ? ['footway', 'pedestrian', 'path', 'living_street', 'residential'].includes(h) || h === 'cycleway' && ['yes', 'designated', 'permissive'].includes(access ?? '')
    : ['cycleway', 'living_street', 'residential', 'unclassified', 'tertiary', 'secondary'].includes(h) || ['path', 'footway', 'pedestrian'].includes(h) && ['yes', 'designated', 'permissive'].includes(access ?? '');
}
export function agentRoute(path: MobilityPath): AgentRoute | undefined {
  if (path.kind && (!agentAccess(path.tags, path.kind) || path.tags.bridge && path.tags.bridge !== 'no' && !Number.isFinite(path.deck))) return undefined;
  const points = path.points.filter((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1]![0], p[1] - all[i - 1]![1]) > .01).map((p) => [...p] as Point);
  const bicycleDirection = path.tags['oneway:bicycle'] ?? path.tags.oneway;
  if (path.kind === 'cyclist' && bicycleDirection === '-1') points.reverse();
  if (points.length < 2) return undefined;
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  const length = distances.at(-1)!; if (length < (path.kind ? 12 : 32)) return undefined;
  return { ...path, points, distances, length, oneWay: path.kind === 'cyclist' && ['yes', '1', '-1', 'true'].includes(bicycleDirection ?? '') };
}
/** Position sur la polyligne OSM ; tangente lissée sans raccourcir les courbes. */
export function pathPose(route: AgentRoute, distance: number, direction = 1): { x: number; z: number; angle: number } {
  const center = (s: number): Point => {
    const d = route.closed ? (s % route.length + route.length) % route.length : Math.max(0, Math.min(route.length, s));
    let lo = 1, hi = route.distances.length - 1;
    while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (route.distances[mid]! < d) lo = mid + 1; else hi = mid; }
    const a = route.points[lo - 1]!, b = route.points[lo]!, t = (d - route.distances[lo - 1]!) / (route.distances[lo]! - route.distances[lo - 1]!);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const [x, z] = center(distance), a = center(distance - .8), b = center(distance + .8);
  return { x, z, angle: Math.atan2((b[0] - a[0]) * direction, (b[1] - a[1]) * direction) };
}
export function populationFactor(hour: number, kind: AgentKind | 'tram'): number {
  const profile = kind === 'tram' ? [0.05, 0.05, .2, .65, 1, .85, .9, 1, .7, .5, .2, .05] : kind === 'cyclist' ? [.07, .05, .1, .5, 1, .65, .7, 1, .5, .25, .12, .07] : [.15, .08, .1, .3, .9, .8, .85, 1, .85, .65, .4, .2];
  const t = (hour % 24 + 24) % 24 / 2, i = Math.floor(t), f = t - i;
  return profile[i]! + (profile[(i + 1) % 12]! - profile[i]!) * f;
}
export function agentBudget(kind: AgentKind | 'tram', density: UrbanDensity, mobile: boolean, hour: number): number {
  if (density === 'off') return 0;
  const capacity = kind === 'pedestrian' ? mobile ? 40 : 100 : kind === 'cyclist' ? mobile ? 10 : 25 : mobile ? 2 : 4;
  const low = kind === 'pedestrian' ? mobile ? 12 : 30 : kind === 'cyclist' ? mobile ? 4 : 8 : mobile ? 1 : 2;
  return Math.max(0, Math.round((density === 'low' ? low : capacity) * populationFactor(hour, kind)));
}
export function agentStyle(id: string, kind: AgentKind): { speed: number; phase: number; height: number } {
  const seed = seedOf(id); return { speed: kind === 'pedestrian' ? .95 + seed % 55 / 100 : 3 + seed % 180 / 100, phase: seed % 628 / 100, height: .9 + seed % 21 / 100 };
}
