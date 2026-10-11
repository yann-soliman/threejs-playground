import { Box3, Frustum, Matrix4, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import type { DetailLevel } from './city';
import type { CityData, Point } from './types';

export interface TileEntry {
  id: string;
  x: number;
  z: number;
  bounds: number[];
  contentBounds: number[];
  counts: Record<string, number>;
  urls: Record<DetailLevel, string>;
  bytes: Record<DetailLevel, number>;
}
export interface CityManifest {
  version: number;
  tileSize: number;
  meta: CityData['meta'] & { boundarySource: string; boundaryCode: string };
  boundary: Point[][][];
  bounds: number[];
  counts: Record<string, number>;
  tiles: TileEntry[];
  overview: string;
  overviewBytes: number;
  tileBytes: number;
  areaSquareMetres: number;
}
export interface TileChoice { tile: TileEntry; lod: DetailLevel; priority: number }

export function detailLevel(distance: number, previous?: DetailLevel): DetailLevel {
  // Une marge de 15 % évite les oscillations autour des seuils.
  if (previous === 'near' && distance < 1035) return 'near';
  if (previous === 'medium' && distance >= 765 && distance < 2760) return 'medium';
  if (previous === 'far' && distance > 2040) return 'far';
  return distance < 900 ? 'near' : distance < 2400 ? 'medium' : 'far';
}

export function selectTiles(manifest: CityManifest, camera: PerspectiveCamera, target: Vector3,
  previous: ReadonlyMap<string, DetailLevel> = new Map(), destination?: Vector3, limit = 16): TileChoice[] {
  camera.updateMatrixWorld();
  const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const choices: TileChoice[] = [];
  const box = new Box3();
  for (const tile of manifest.tiles) {
    const [x0, z0, x1, z1] = tile.contentBounds as [number, number, number, number];
    box.min.set(x0, -1, z0); box.max.set(x1, 250, z1);
    const center = box.getCenter(new Vector3()); center.y = 0;
    const groundDistance = center.distanceTo(target);
    const destinationDistance = destination ? center.distanceTo(destination) : Infinity;
    const visible = frustum.intersectsBox(box);
    if (destinationDistance > 800 && (!visible || groundDistance > 4200)) continue;
    const distance = camera.position.distanceTo(center);
    const lod = destinationDistance < 550 ? 'near' : detailLevel(distance, previous.get(tile.id));
    if (lod === 'far' && !destination && camera.position.distanceTo(target) > 6500) continue;
    choices.push({ tile, lod, priority: destinationDistance < 800 ? -10000 + destinationDistance : groundDistance + (visible ? 0 : 5000) });
  }
  choices.sort((a, b) => a.priority - b.priority || a.tile.id.localeCompare(b.tile.id));
  const selected: TileChoice[] = [];
  let near = 0;
  for (const choice of choices) {
    if (choice.lod === 'near' && near++ >= 4) choice.lod = 'medium';
    selected.push(choice);
    if (selected.length === limit) break;
  }
  return selected;
}

export interface TileResource {
  bytes: number;
  dispose: () => void;
}
interface Cached<R> { choice: TileChoice; resource: R; used: number }
interface Pending { choice: TileChoice; controller: AbortController }
export interface TileLoaderHooks<R extends TileResource> {
  fetch: (choice: TileChoice, signal: AbortSignal) => Promise<CityData>;
  generate: (data: CityData, choice: TileChoice, signal: AbortSignal) => Promise<R>;
  attach: (resource: R, tile: TileEntry) => void;
  detach: (resource: R, tile: TileEntry) => void;
  changed: () => void;
  failed: (tile: TileEntry, error: unknown) => void;
}

/** Réseau borné, génération séquentielle et réponses périmées sans effet. */
export class TileLoader<R extends TileResource> {
  private desired = new Map<string, TileChoice>();
  private readonly pending = new Map<string, Pending>();
  private readonly cache = new Map<string, Cached<R>>();
  private readonly active = new Map<string, Cached<R>>();
  private readonly budgetBlocked = new Set<string>();
  private readonly failures = new Set<string>();
  private generation: Promise<void> = Promise.resolve();
  private disposed = false;
  private tick = 0;
  private selectionSignature = '';

  constructor(private readonly hooks: TileLoaderHooks<R>, private readonly budget = 96 * 1024 * 1024, private readonly concurrency = 3) {}
  get info(): { active: number; pending: number; bytes: number; lod: Record<DetailLevel, number> } {
    const lod = { near: 0, medium: 0, far: 0 };
    for (const item of this.active.values()) lod[item.choice.lod]++;
    return { active: this.active.size, pending: this.pending.size,
      bytes: [...this.cache.values()].reduce((sum, item) => sum + item.resource.bytes, 0), lod };
  }
  get levels(): Map<string, DetailLevel> { return new Map([...this.active].map(([id, item]) => [id, item.choice.lod])); }
  private key(choice: TileChoice): string { return `${choice.tile.id}:${choice.lod}`; }
  update(choices: TileChoice[]): void {
    if (this.disposed) return;
    const signature = choices.map((choice) => this.key(choice)).join('|');
    if (signature !== this.selectionSignature) {
      this.budgetBlocked.clear();
      this.selectionSignature = signature;
    }
    this.desired = new Map(choices.map((choice) => [choice.tile.id, choice]));
    for (const [key, pending] of this.pending) {
      if (this.key(this.desired.get(pending.choice.tile.id) ?? pending.choice) !== key || !this.desired.has(pending.choice.tile.id)) pending.controller.abort();
    }
    for (const [id, item] of this.active) {
      if (!this.desired.has(id)) { this.hooks.detach(item.resource, item.choice.tile); this.active.delete(id); }
    }
    for (const choice of choices) {
      const cached = this.cache.get(this.key(choice));
      if (cached) this.activate(cached);
    }
    this.evict();
    this.pump();
    this.hooks.changed();
  }
  private activate(item: Cached<R>): void {
    const id = item.choice.tile.id;
    const old = this.active.get(id);
    if (old === item) { item.used = ++this.tick; return; }
    if (old) this.hooks.detach(old.resource, old.choice.tile);
    this.active.set(id, item); item.used = ++this.tick;
    this.hooks.attach(item.resource, item.choice.tile);
  }
  private pump(): void {
    if (this.disposed) return;
    for (const choice of this.desired.values()) {
      if (this.pending.size >= this.concurrency) break;
      const key = this.key(choice);
      if (this.cache.has(key) || this.pending.has(key) || this.failures.has(key) || this.budgetBlocked.has(key)) continue;
      const controller = new AbortController();
      this.pending.set(key, { choice, controller });
      void this.load(choice, key, controller);
    }
  }
  private async load(choice: TileChoice, key: string, controller: AbortController): Promise<void> {
    let resource: R | undefined;
    try {
      const data = await this.hooks.fetch(choice, controller.signal);
      const task = this.generation.then(async () => {
        if (controller.signal.aborted || this.disposed) return;
        resource = await this.hooks.generate(data, choice, controller.signal);
      });
      this.generation = task.then(() => {}, () => {});
      await task;
      if (!resource) return;
      if (this.disposed || controller.signal.aborted || this.key(this.desired.get(choice.tile.id) ?? choice) !== key || !this.desired.has(choice.tile.id)) {
        resource.dispose(); return;
      }
      if (resource.bytes > this.budget) { resource.dispose(); this.budgetBlocked.add(key); return; }
      const item = { choice, resource, used: ++this.tick };
      this.cache.set(key, item);
      this.activate(item);
      this.evict();
    } catch (error) {
      if (!controller.signal.aborted && !this.disposed) { this.failures.add(key); this.hooks.failed(choice.tile, error); }
    } finally {
      this.pending.delete(key);
      if (!this.disposed) { this.pump(); this.hooks.changed(); }
    }
  }
  private evict(): void {
    let bytes = this.info.bytes;
    const activeItems = new Set(this.active.values());
    const items = [...this.cache].sort((a, b) => a[1].used - b[1].used);
    for (const [key, item] of items) {
      // Une seule géométrie par tuile : l'ancien LOD ne reste pas en cache.
      const replaced = this.active.has(item.choice.tile.id) && !activeItems.has(item);
      if ((bytes > this.budget || this.cache.size > 24 || replaced) && !activeItems.has(item)) {
        bytes -= item.resource.bytes; this.cache.delete(key); item.resource.dispose();
      }
    }
    // Le budget comprend les tuiles actives ; les plus lointaines cèdent à la vue générale.
    for (const [key, item] of items.sort((a, b) => (this.desired.get(b[1].choice.tile.id)?.priority ?? Infinity) - (this.desired.get(a[1].choice.tile.id)?.priority ?? Infinity))) {
      if (bytes <= this.budget || this.active.size <= 1) break;
      if (!this.cache.has(key) || !activeItems.has(item)) continue;
      this.hooks.detach(item.resource, item.choice.tile);
      this.active.delete(item.choice.tile.id); this.cache.delete(key); bytes -= item.resource.bytes; item.resource.dispose();
      this.budgetBlocked.add(key); // Ne pas boucler sur une tuile dépassant le budget pendant ce cadrage.
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of this.pending.values()) pending.controller.abort();
    for (const item of this.active.values()) this.hooks.detach(item.resource, item.choice.tile);
    for (const item of this.cache.values()) item.resource.dispose();
    this.active.clear(); this.cache.clear(); this.desired.clear(); this.pending.clear();
  }
}
