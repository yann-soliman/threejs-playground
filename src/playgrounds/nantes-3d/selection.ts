import { Box3, Color, Group, Mesh, MeshBasicMaterial, Ray, Vector3 } from 'three';
import { buildingBody, buildingRoof, buildingStyle, metres } from './buildings';
import type { BuildingStyle } from './buildings';
import type { CityData, Feature, Point } from './types';
import type { DetailLevel } from './city';

export function containsPoint(ring: Point[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function inFootprint(feature: Feature, x: number, z: number): boolean {
  return containsPoint(feature.rings[0]!, x, z) && !feature.rings.slice(1).some((ring) => containsPoint(ring, x, z));
}
export function isSelectionClick(start: { x: number; y: number; time: number }, end: { x: number; y: number; time: number }): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) <= 5 && end.time - start.time < 650;
}
export function buildingInformation(feature: Feature): { title: string; type: string; height: string; floors: string; id: string; url: string } {
  const style = buildingStyle(feature), match = /^(way|relation)\/(\d+)/.exec(feature.id);
  return { title: feature.tags.name || 'Bâtiment', type: feature.tags.building || 'Non renseigné',
    height: `${(style.heightSource === 'height' ? metres(feature.tags.height)! : style.height).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m${style.heightSource === 'estimated' ? ' · Hauteur estimée' : style.heightSource === 'building:levels' ? ' · Hauteur estimée d’après les niveaux OSM' : ' · OSM'}`,
    floors: feature.tags['building:levels'] || 'Non renseigné', id: match ? `${match[1]}/${match[2]}` : feature.id,
    url: match ? `https://www.openstreetmap.org/${match[1]}/${match[2]}` : 'https://www.openstreetmap.org/copyright' };
}
interface PickBuilding { feature: Feature; base: number; style: BuildingStyle; box: Box3; tile: string }
interface PickTile { bins: Map<string, PickBuilding[]>; buildings: Map<string, PickBuilding> }
export class BuildingSelection {
  readonly group = new Group();
  private readonly tiles = new Map<string, PickTile>();
  selected: PickBuilding | undefined;
  constructor(private readonly changed: (feature?: Feature) => void) {}
  setTile(id: string, data: CityData, lod: DetailLevel, sample: (x: number, z: number) => number): void {
    if (lod === 'far') { this.removeTile(id); return; }
    const bins = new Map<string, PickBuilding[]>(), buildings = new Map<string, PickBuilding>();
    for (const feature of data.buildings) {
      const style = buildingStyle(feature), base = data.terrain?.bases[feature.id]?.[1] ?? Math.max(...feature.rings[0]!.map(([x, z]) => sample(x, z)));
      const box = new Box3(); for (const ring of feature.rings) for (const [x, z] of ring) box.expandByPoint(new Vector3(x, base, z)); box.max.y = base + style.height + .16;
      const building = { feature, style, base, box, tile: id }; buildings.set(feature.id, building);
      for (let x = Math.floor(box.min.x / 50); x <= Math.floor(box.max.x / 50); x++) for (let z = Math.floor(box.min.z / 50); z <= Math.floor(box.max.z / 50); z++) {
        const key = `${x}_${z}`, entries = bins.get(key) ?? []; entries.push(building); bins.set(key, entries);
      }
    }
    this.tiles.set(id, { bins, buildings });
    if (this.selected?.tile === id) {
      const replacement = buildings.get(this.selected.feature.id); this.show(replacement);
    }
  }
  removeTile(id: string): void { this.tiles.delete(id); }
  reconcile(): void { if (this.selected && !this.tiles.get(this.selected.tile)?.buildings.has(this.selected.feature.id)) this.clear(); }
  pick(ray: Ray): Feature | undefined {
    if (ray.direction.y >= -.001) { this.clear(); return undefined; }
    const start = Math.max(0, (ray.origin.y - 260) / -ray.direction.y), end = (ray.origin.y + 10) / -ray.direction.y;
    const a = ray.at(start, new Vector3()), b = ray.at(end, new Vector3());
    const count = Math.min(2000, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 20));
    const candidates = new Set<PickBuilding>();
    for (let i = 0; i <= count; i++) {
      const x = Math.floor((a.x + (b.x - a.x) * i / Math.max(1, count)) / 50), z = Math.floor((a.z + (b.z - a.z) * i / Math.max(1, count)) / 50);
      // Voisins inclus pour les angles de case et les empreintes à cheval sur une tuile.
      for (const tile of this.tiles.values()) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const candidate of tile.bins.get(`${x + dx}_${z + dz}`) ?? []) candidates.add(candidate);
    }
    let nearest = Infinity, selected: PickBuilding | undefined;
    for (const building of candidates) {
      if (!ray.intersectsBox(building.box)) continue;
      const top = building.box.max.y, roofDistance = (top - ray.origin.y) / ray.direction.y;
      const roof = ray.at(roofDistance, new Vector3());
      if (roofDistance >= 0 && roofDistance < nearest && inFootprint(building.feature, roof.x, roof.z)) { nearest = roofDistance; selected = building; }
      for (const ring of building.feature.rings) for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!, q = ring[(i + 1) % ring.length]!, dx = q[0] - p[0], dz = q[1] - p[1];
        const det = ray.direction.x * dz - ray.direction.z * dx; if (Math.abs(det) < 1e-8) continue;
        const px = p[0] - ray.origin.x, pz = p[1] - ray.origin.z;
        const t = (px * dz - pz * dx) / det, u = (px * ray.direction.z - pz * ray.direction.x) / det;
        const y = ray.origin.y + t * ray.direction.y;
        if (t >= 0 && t < nearest && u >= 0 && u <= 1 && y >= building.base + building.style.base && y <= top) { nearest = t; selected = building; }
      }
    }
    this.show(selected); return selected?.feature;
  }
  private show(building?: PickBuilding): void {
    this.releaseHighlight(); this.selected = building;
    if (building) {
      const material = new MeshBasicMaterial({ color: '#d79f4b', transparent: true, opacity: .23, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const style = { ...building.style, facade: new Color('#ffffff'), roof: new Color('#ffffff') };
      for (const geometry of [buildingBody(building.feature, style), buildingRoof(building.feature, style)]) {
        geometry.translate(0, building.base, 0); const mesh = new Mesh(geometry, material); mesh.renderOrder = 3; this.group.add(mesh);
      }
    }
    this.changed(building?.feature);
  }
  clear(): void { this.show(); }
  private releaseHighlight(): void {
    const materials = new Set<MeshBasicMaterial>();
    for (const child of this.group.children) { const mesh = child as Mesh; mesh.geometry.dispose(); materials.add(mesh.material as MeshBasicMaterial); }
    materials.forEach((material) => material.dispose()); this.group.clear();
  }
  dispose(): void { this.releaseHighlight(); this.tiles.clear(); this.selected = undefined; }
}
