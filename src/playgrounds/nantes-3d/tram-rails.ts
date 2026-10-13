import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { AgentRoute } from './mobility-paths';

/** Deux rubans fins suivent les points OSM, sans raccord aux voies voisines. */
export function tramRails(routes: AgentRoute[], elevation: (x: number, z: number, route: AgentRoute) => number | undefined): BufferGeometry {
  const positions: number[] = [];
  for (const route of routes) for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1]!, b = route.points[i]!, dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (length < .01) continue;
    const h0 = elevation(a[0], a[1], route), h1 = elevation(b[0], b[1], route);
    if (h0 === undefined || h1 === undefined || !Number.isFinite(h0 + h1)) continue;
    const gauge = Number.parseFloat(route.tags.gauge ?? '1435') / 1000;
    const half = Number.isFinite(gauge) ? Math.max(.5, Math.min(1, gauge / 2)) : .7175;
    for (const side of [-1, 1]) {
      const offset = side * half, nx = -dz / length, nz = dx / length;
      const p = [a[0] + nx * (offset - .035), h0 + .17, a[1] + nz * (offset - .035)];
      const q = [a[0] + nx * (offset + .035), h0 + .17, a[1] + nz * (offset + .035)];
      const r = [b[0] + nx * (offset - .035), h1 + .17, b[1] + nz * (offset - .035)];
      const s = [b[0] + nx * (offset + .035), h1 + .17, b[1] + nz * (offset + .035)];
      positions.push(...p, ...q, ...r, ...q, ...s, ...r);
    }
  }
  const geometry = new BufferGeometry();geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}
