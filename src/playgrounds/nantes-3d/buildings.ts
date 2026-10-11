import {
  BufferGeometry, Color, ExtrudeGeometry, Float32BufferAttribute, Path, Shape,
  ShapeUtils, Vector2,
} from 'three';
import type { Feature, Point } from './types';

export function seedOf(id: string): number {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function metres(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*(m|ft|')?\s*$/.exec(value);
  if (!match) return undefined;
  const number = Number(match[1]!.replace(',', '.')) * (match[2] === 'ft' || match[2] === "'" ? 0.3048 : 1);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

export interface BuildingStyle {
  height: number;
  base: number;
  levels: number;
  roofHeight: number;
  roofShape: string;
  heightSource: 'height' | 'building:levels' | 'estimated';
  roofSource: 'roof:shape' | 'estimated';
  facade: Color;
  roof: Color;
}

function colour(value: string | undefined, fallback: string): Color {
  // Pas de styles arbitraires ; les couleurs OSM reconnues par Three sont admises.
  const known = value && (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value) || value.toLowerCase() in Color.NAMES);
  return new Color(known ? value : fallback);
}

export function buildingStyle(feature: Feature): BuildingStyle {
  const tags = feature.tags;
  const seed = seedOf(feature.id);
  const small = ['shed', 'garage', 'garages', 'roof', 'service', 'ruins', 'transportation'].includes(tags.building ?? '');
  const levelsTag = metres(tags['building:levels']);
  const heightTag = metres(tags.height);
  const levels = Math.max(1, Math.min(18, Math.round(levelsTag ?? (small ? 1 : 3 + seed % 3))));
  // Interprétations locales explicites, jamais enregistrées comme attributs OSM.
  const landmark = tags.building === 'cathedral' ? { height: 32, roof: 8, shape: 'gabled' }
    : tags.building === 'church' ? { height: 22, roof: 6, shape: 'gabled' }
    : tags.building !== 'ruins' && tags.name?.startsWith('Tour ') ? { height: 18, roof: 0, shape: 'flat' }
    : ['Grand Logis', 'Grand Gouvernement'].includes(tags.name ?? '') ? { height: 21, roof: 6, shape: 'gabled' } : undefined;
  const height = Math.min(90, heightTag ?? (levelsTag ? levels * 3.15 : landmark?.height ?? (tags.building === 'ruins' ? 1.2 : levels * 3.15)));
  const base = Math.min(height - 0.1, metres(tags.min_height) ?? 0);
  const roofShape = tags['roof:shape'] ?? landmark?.shape ?? (small || feature.rings.length > 1 ? 'flat' : ['gabled', 'hipped', 'mansard', 'gabled', 'flat'][seed % 5]!);
  const roofHeight = roofShape === 'flat' ? 0 : Math.min(height * 0.35, metres(tags['roof:height']) ?? landmark?.roof ?? (small ? 1 : 2.2 + seed % 3 * 0.65));
  const palette = ['#e4ddcd', '#d4c9b5', '#c7c1b5', '#ebe3d3', '#d9c7b4', '#d0d0c8', '#e1d3bd'];
  const materialColours: Record<string, string> = { brick: '#b98871', stone: '#d2c9b7', concrete: '#c1c4bf', glass: '#7d9696', wood: '#aa9070' };
  return {
    height, base, levels, roofHeight, roofShape,
    heightSource: heightTag ? 'height' : levelsTag ? 'building:levels' : 'estimated',
    roofSource: tags['roof:shape'] ? 'roof:shape' : 'estimated',
    facade: colour(tags['building:colour'], materialColours[tags['building:material'] ?? ''] ?? palette[seed % palette.length]!),
    roof: colour(tags['roof:colour'], ['#626b70', '#777f81', '#505d66', '#847e75'][seed % 4]!),
  };
}

export function footprintShape(rings: Point[][]): Shape {
  const points = (ring: Point[]): Vector2[] => ring.map(([x, z]) => new Vector2(x, -z));
  const shape = new Shape(points(rings[0]!));
  for (const hole of rings.slice(1)) shape.holes.push(new Path(points(hole)));
  return shape;
}

export function paint(geometry: BufferGeometry, color: Color): BufferGeometry {
  const values = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < values.length; i += 3) {
    values[i] = color.r; values[i + 1] = color.g; values[i + 2] = color.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(values, 3));
  // Attributs communs pour le regroupement des géométries.
  geometry.deleteAttribute('uv');
  return geometry;
}

export function buildingBody(feature: Feature, style: BuildingStyle): BufferGeometry {
  const geometry = new ExtrudeGeometry(footprintShape(feature.rings), {
    depth: Math.max(0.1, style.height - style.roofHeight - style.base), bevelEnabled: false, steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, style.base + 0.16, 0);
  return paint(geometry, style.facade);
}

// Découpe les triangles à la crête : le toit suit le contour et les cours réels,
// y compris pour les empreintes concaves. Aucun rectangle englobant n'est dessiné.
function split(poly: Point[], value: (p: Point) => number, level: number): Point[][] {
  const sides: Point[][] = [[], []];
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
      const va = value(a) - level, vb = value(b) - level;
      const ina = side === 0 ? va <= 0 : va >= 0;
      const inb = side === 0 ? vb <= 0 : vb >= 0;
      if (ina) sides[side]!.push(a);
      if (ina !== inb) {
        const t = va / (va - vb);
        sides[side]!.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
  }
  return sides.filter((p) => p.length >= 3);
}

export function buildingRoof(feature: Feature, style: BuildingStyle): BufferGeometry {
  const ring = feature.rings[0]!;
  let longest = 0, ux = 1, uz = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length > longest) { longest = length; ux = (b[0] - a[0]) / length; uz = (b[1] - a[1]) / length; }
  }
  const u = (p: Point): number => p[0] * ux + p[1] * uz;
  const v = (p: Point): number => -p[0] * uz + p[1] * ux;
  const us = ring.map(u), vs = ring.map(v);
  const minU = Math.min(...us), maxU = Math.max(...us), minV = Math.min(...vs), maxV = Math.max(...vs);
  const spanU = Math.max(0.1, maxU - minU), spanV = Math.max(0.1, maxV - minV);
  const base = style.height - style.roofHeight + 0.18;
  const shape = style.roofShape;
  const hipped = ['hipped', 'pyramidal', 'round', 'dome', 'onion', 'side_hipped'].includes(shape);
  const mansard = ['mansard', 'gambrel'].includes(shape);
  const height = (p: Point): number => {
    const tv = (v(p) - minV) / spanV;
    let factor = Math.max(0, 1 - Math.abs(tv * 2 - 1));
    if (shape === 'skillion') factor = tv;
    if (mansard) factor = Math.min(1, factor * 2.5);
    if (hipped) factor = Math.min(factor, Math.max(0, 1 - Math.abs(((u(p) - minU) / spanU) * 2 - 1)));
    return base + (shape === 'flat' ? 0 : factor * style.roofHeight);
  };
  const vectors = feature.rings.map((r) => r.map(([x, z]) => new Vector2(x, z)));
  const faces = ShapeUtils.triangulateShape(vectors[0]!, vectors.slice(1));
  const all = feature.rings.flat();
  const positions: number[] = [];
  const triangle = (a: Point, b: Point, c: Point): void => {
    if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-8) return;
    for (const p of [a, b, c]) positions.push(p[0], height(p), p[1]);
  };
  for (const face of faces) {
    let polygons = [face.map((index) => all[index]!)];
    const cuts: [((p: Point) => number), number][] = [[v, (minV + maxV) / 2]];
    if (hipped) cuts.push([u, (minU + maxU) / 2]);
    if (mansard) cuts.push([v, minV + spanV * 0.2], [v, minV + spanV * 0.8]);
    for (const [value, level] of cuts) polygons = polygons.flatMap((poly) => split(poly, value, level));
    for (const poly of polygons) for (let i = 1; i < poly.length - 1; i++) triangle(poly[0]!, poly[i]!, poly[i + 1]!);
  }
  // Fermeture des pignons / bords sous les pans.
  for (const r of feature.rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i]!, b = r[(i + 1) % r.length]!;
      const subdivisions = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
      for (let j = 0; j < subdivisions; j++) {
        const p: Point = [a[0] + (b[0] - a[0]) * j / subdivisions, a[1] + (b[1] - a[1]) * j / subdivisions];
        const q: Point = [a[0] + (b[0] - a[0]) * (j + 1) / subdivisions, a[1] + (b[1] - a[1]) * (j + 1) / subdivisions];
        if (height(p) <= base + 1e-6 && height(q) <= base + 1e-6) continue;
        positions.push(p[0], base, p[1], q[0], base, q[1], q[0], height(q), q[1], p[0], base, p[1], q[0], height(q), q[1], p[0], height(p), p[1]);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return paint(geometry, style.roof);
}

export function signedArea(ring: Point[]): number {
  return ring.reduce((sum, a, i) => { const b = ring[(i + 1) % ring.length]!; return sum + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
}
