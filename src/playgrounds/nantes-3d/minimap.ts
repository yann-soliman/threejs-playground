import { Vector3 } from 'three';
import { pointsOfInterest, projectCoordinates } from './pois';
import type { CityData, Point } from './types';
import type { CityManifest } from './tiles';

export function mapPosition(point: Point, center: Point, span: number, width: number, height: number): Point {
  const scale = width / span;
  return [width / 2 + (point[0] - center[0]) * scale, height / 2 + (point[1] - center[1]) * scale];
}
export function mapDestination(point: Point, center: Point, span: number, width: number, height: number): Point {
  return [center[0] + (point[0] - width / 2) * span / width, center[1] + (point[1] - height / 2) * span / width];
}
export function headingArrow(yaw: number): Point { return [-Math.sin(yaw), -Math.cos(yaw)]; }
interface MapState { position: Vector3; yaw: number; pedestrian: boolean; distance: number }
/** Fond vectoriel OSM mis en cache ; surcouche légère sans deuxième renderer WebGL. */
export class Minimap {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly ink: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private readonly paths: { path: Path2D; color: string; width: number; fill: boolean }[] = [];
  private readonly pois: { name: string; position: Vector3 }[];
  private center: Point = [0, 0];
  private span = 1400;
  private expanded = false;
  private state: MapState | undefined;
  private selected: Point | undefined;
  private lastUpdate = -Infinity;
  private drag: { x: number; y: number; center: Point; moved: boolean; id: number } | undefined;
  private width = 220;
  private height = 160;
  private disposed = false;
  constructor(parent: HTMLElement, manifest: CityManifest, data: CityData, water: CityData['surfaces'], private readonly travel: (point: Vector3) => void) {
    this.element = document.createElement('aside'); this.element.className = 'nantes-map'; this.element.setAttribute('aria-label', 'Mini-carte de Nantes');
    this.element.innerHTML = `<div class="nantes-map-bar"><strong>Carte · N ↑</strong><button type="button" data-map="expand" aria-expanded="false">Agrandir</button></div><div class="nantes-map-canvas" tabindex="0" role="application" aria-label="Carte, nord en haut. Agrandir pour choisir une destination ; flèches pour déplacer, plus et moins pour zoomer."><canvas aria-hidden="true"></canvas><canvas aria-hidden="true"></canvas></div><div class="nantes-map-actions" hidden><button type="button" data-map="in" aria-label="Zoomer sur la carte">+</button><button type="button" data-map="out" aria-label="Dézoomer la carte">−</button><button type="button" data-map="follow">Suivre la position</button><button type="button" data-map="travel" disabled>Aller ici</button><span role="status">Choisir un point sur la carte.</span></div><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap · ODbL</a>`;
    parent.append(this.element);
    [this.canvas, this.overlay] = Array.from(this.element.querySelectorAll('canvas')) as [HTMLCanvasElement, HTMLCanvasElement];
    this.context = this.canvas.getContext('2d')!; this.ink = this.overlay.getContext('2d')!;
    this.pois = pointsOfInterest.map((poi) => ({ name: poi.name, position: projectCoordinates(poi.coordinates, manifest.meta.origin) }));
    const polygon = (rings: Point[][]): Path2D => { const path = new Path2D(); for (const ring of rings) { ring.forEach(([x, z], i) => i ? path.lineTo(x, z) : path.moveTo(x, z)); path.closePath(); } return path; };
    this.paths.push({ path: polygon(manifest.boundary.flat()), color: '#e2e7d7', width: 0, fill: true });
    for (const feature of [...data.surfaces.filter((s) => s.kind === 'green'), ...water]) this.paths.push({ path: polygon(feature.rings), color: feature.kind === 'water' ? '#8bb5bd' : '#b7ce9e', width: 0, fill: true });
    for (const road of data.roads) {
      const path = new Path2D(); road.points.forEach(([x, z], i) => i ? path.lineTo(x, z) : path.moveTo(x, z));
      this.paths.push({ path, color: '#fdfbf3', width: ['primary', 'secondary'].includes(road.tags.highway ?? '') ? 8 : 4, fill: false });
    }
    this.element.addEventListener('click', this.click); this.element.addEventListener('keydown', this.keydown);
    this.overlay.addEventListener('pointerdown', this.down); this.overlay.addEventListener('pointermove', this.move); this.overlay.addEventListener('pointerup', this.up); this.overlay.addEventListener('pointercancel', this.cancel); this.overlay.addEventListener('wheel', this.wheel, { passive: false });
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.element.querySelector('.nantes-map-canvas')!); this.resize();
  }
  update(state: MapState, now: number, force = false): void {
    this.state = state;
    if (!force && now - this.lastUpdate < 100) return;
    this.lastUpdate = now;
    if (!this.expanded && Math.hypot(this.center[0] - state.position.x, this.center[1] - state.position.z) > this.span * .07) { this.center = [state.position.x, state.position.z]; this.background(); }
    this.indicators();
  }
  private resize(): void {
    if (this.disposed) return;
    const box = this.element.querySelector('.nantes-map-canvas')!.getBoundingClientRect(); this.width = Math.max(1, box.width); this.height = Math.max(1, box.height);
    const ratio = Math.min(devicePixelRatio, 2);
    for (const canvas of [this.canvas, this.overlay]) { canvas.width = Math.round(this.width * ratio); canvas.height = Math.round(this.height * ratio); canvas.getContext('2d')!.setTransform(ratio, 0, 0, ratio, 0, 0); }
    this.background(); this.indicators();
  }
  private background(): void {
    const c = this.context, scale = this.width / this.span;
    c.save(); c.fillStyle = '#f2f2e8'; c.fillRect(0, 0, this.width, this.height);
    c.translate(this.width / 2 - this.center[0] * scale, this.height / 2 - this.center[1] * scale); c.scale(scale, scale);
    for (const item of this.paths) { c.fillStyle = item.color; c.strokeStyle = item.color; c.lineWidth = Math.max(item.width, 1 / scale); if (item.fill) c.fill(item.path, 'evenodd'); else c.stroke(item.path); } c.restore();
  }
  private indicators(): void {
    const c = this.ink; c.clearRect(0, 0, this.width, this.height); if (!this.state) return;
    for (const poi of this.pois) {
      const [x, y] = mapPosition([poi.position.x, poi.position.z], this.center, this.span, this.width, this.height);
      if (x < 0 || y < 0 || x > this.width || y > this.height) continue;
      c.fillStyle = '#8d6248'; c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill();
      if (this.expanded) { c.font = '11px sans-serif'; c.fillText(poi.name, x + 6, y - 5, 170); }
    }
    const [x, y] = mapPosition([this.state.position.x, this.state.position.z], this.center, this.span, this.width, this.height);
    c.save(); c.translate(x, y); c.rotate(-this.state.yaw);
    if (!this.state.pedestrian) { c.fillStyle = '#28634d18'; c.beginPath(); c.moveTo(0, 0); const reach = Math.min(90, this.state.distance * this.width / this.span * .5); c.lineTo(-reach * .4, -reach); c.lineTo(reach * .4, -reach); c.closePath(); c.fill(); }
    c.fillStyle = '#28634d'; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -11); c.lineTo(7, 7); c.lineTo(0, 4); c.lineTo(-7, 7); c.closePath(); c.fill(); c.stroke(); c.restore();
    if (this.selected) { const [sx, sy] = mapPosition(this.selected, this.center, this.span, this.width, this.height); c.strokeStyle = '#9b5a39'; c.lineWidth = 2; c.beginPath(); c.arc(sx, sy, 7, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = '#344639'; c.font = '10px sans-serif'; c.fillText(`${Math.round(this.span / 5)} m`, 8, this.height - 8); c.fillRect(8, this.height - 22, this.width / 5, 2);
  }
  private zoom(factor: number): void { this.span = Math.max(300, Math.min(16000, this.span * factor)); this.background(); this.indicators(); }
  private click = (event: MouseEvent): void => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-map]')?.dataset.map;
    if (!action) return;
    if (action === 'expand') { this.expanded = !this.expanded; this.element.classList.toggle('expanded', this.expanded); const button = this.element.querySelector('[data-map="expand"]')!; button.textContent = this.expanded ? 'Réduire' : 'Agrandir'; button.setAttribute('aria-expanded', String(this.expanded)); (this.element.querySelector('.nantes-map-actions') as HTMLElement).hidden = !this.expanded; this.resize(); }
    if (action === 'in') this.zoom(.75); if (action === 'out') this.zoom(1.35);
    if (action === 'follow' && this.state) { this.center = [this.state.position.x, this.state.position.z]; this.background(); this.indicators(); }
    if (action === 'travel' && this.selected) this.travel(new Vector3(this.selected[0], 0, this.selected[1]));
    event.stopPropagation();
  };
  private choose(x: number, y: number): void {
    this.selected = mapDestination([x, y], this.center, this.span, this.width, this.height);
    (this.element.querySelector('[data-map="travel"]') as HTMLButtonElement).disabled = false;
    this.element.querySelector('[role="status"]')!.textContent = this.state?.pedestrian ? 'Destination choisie. « Aller ici » cherchera un départ piéton sûr.' : 'Destination choisie. Confirmer avec « Aller ici ».'; this.indicators();
  }
  private down = (event: PointerEvent): void => { if (!this.expanded || event.button !== 0) return; const rect = this.overlay.getBoundingClientRect(); this.drag = { x: event.clientX - rect.left, y: event.clientY - rect.top, center: [...this.center], moved: false, id: event.pointerId }; this.overlay.setPointerCapture(event.pointerId); this.element.querySelector<HTMLElement>('.nantes-map-canvas')!.focus(); event.stopPropagation(); };
  private move = (event: PointerEvent): void => { const drag = this.drag; if (!drag || drag.id !== event.pointerId) return; const rect = this.overlay.getBoundingClientRect(), dx = event.clientX - rect.left - drag.x, dy = event.clientY - rect.top - drag.y; if (Math.hypot(dx, dy) > 5) drag.moved = true; if (drag.moved) { this.center = [drag.center[0] - dx * this.span / this.width, drag.center[1] - dy * this.span / this.width]; this.background(); this.indicators(); } };
  private up = (event: PointerEvent): void => { if (this.drag?.id === event.pointerId && !this.drag.moved) this.choose(this.drag.x, this.drag.y); this.cancel(); };
  private cancel = (): void => { this.drag = undefined; };
  private wheel = (event: WheelEvent): void => { if (!this.expanded) return; event.preventDefault(); event.stopPropagation(); this.zoom(event.deltaY > 0 ? 1.2 : .8); };
  private keydown = (event: KeyboardEvent): void => {
    if (!this.expanded || event.target !== this.element.querySelector('.nantes-map-canvas')) return;
    const shifts: Record<string, Point> = { ArrowUp: [0, -.1], ArrowDown: [0, .1], ArrowLeft: [-.1, 0], ArrowRight: [.1, 0] };
    const shift = shifts[event.key]; if (shift) { this.center = [this.center[0] + shift[0] * this.span, this.center[1] + shift[1] * this.span]; this.background(); }
    else if (event.key === '+' || event.key === '=') this.zoom(.75); else if (event.key === '-') this.zoom(1.35); else if (event.key === 'Enter') this.choose(this.width / 2, this.height / 2); else return;
    this.indicators(); event.preventDefault(); event.stopPropagation();
  };
  dispose(): void {
    this.disposed = true; this.observer.disconnect(); this.element.removeEventListener('click', this.click); this.element.removeEventListener('keydown', this.keydown);
    this.overlay.removeEventListener('pointerdown', this.down); this.overlay.removeEventListener('pointermove', this.move); this.overlay.removeEventListener('pointerup', this.up); this.overlay.removeEventListener('pointercancel', this.cancel); this.overlay.removeEventListener('wheel', this.wheel);
    this.paths.length = 0; this.canvas.width = this.overlay.width = 0; this.element.remove();
  }
}
