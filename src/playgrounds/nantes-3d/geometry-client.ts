import { prepareGeometry, surfaceSampler } from './geometry-preparation';
import type { GeometryJob, GeometryReply } from './geometry-preparation';
import { unpackGeometry } from './geometry-wire';
import type { CityModel, DetailLevel } from './city';
import type { TerrainOverview } from './terrain';
import type { CityData } from './types';
import type { AtmosphereUniforms } from './atmosphere';
import type { PerformanceLog } from './performance';
interface Pending { job: GeometryJob; signal: AbortSignal; resolve: (model: CityModel) => void; reject: (error: unknown) => void; abort: () => void; start: number }
export interface GeometryPort { postMessage: (message: unknown) => void; terminate: () => void; onmessage: ((event: MessageEvent<GeometryReply>) => void) | null; onerror: ((event: ErrorEvent) => void) | null }
/** Un worker, une préparation en cours ; les tâches annulées ne sont jamais attachées. */
export class GeometryBuilder {
  private worker: GeometryPort | undefined;
  private active: Pending | undefined;
  private readonly queue: Pending[] = [];
  private sequence = 0;
  private disposed = false;
  constructor(private readonly terrain: TerrainOverview, private readonly atmosphere: AtmosphereUniforms, private readonly profile: PerformanceLog,
    factory: () => GeometryPort = () => new Worker(new URL('./geometry-worker.ts', import.meta.url), { type: 'module' })) {
    try { this.worker = factory(); this.worker.onmessage = this.received; this.worker.onerror = this.failed; this.worker.postMessage({ terrain }); }
    catch { this.worker?.terminate(); this.worker = undefined; }
  }
  prepare(data: CityData, lod: DetailLevel, signal: AbortSignal, overview = false): Promise<CityModel> {
    if (this.disposed || signal.aborted) return Promise.reject(new DOMException('Géométrie annulée', 'AbortError'));
    return new Promise((resolve, reject) => {
      const pending: Pending = { job: { id: this.sequence++, data, lod, overview }, signal, resolve, reject, start: 0, abort: () => {
        const index = this.queue.indexOf(pending); if (index >= 0) this.queue.splice(index, 1);
        reject(new DOMException('Géométrie annulée', 'AbortError'));
      } };
      signal.addEventListener('abort', pending.abort, { once: true }); this.queue.push(pending); this.pump();
    });
  }
  private pump(): void {
    if (this.active || this.disposed) return;
    const next = this.queue.shift(); if (!next) return;
    this.active = next; next.start = performance.now();
    if (!this.worker) { this.fallback(next); return; }
    try { this.worker.postMessage(next.job); } catch { this.failed(); }
  }
  private finish(pending: Pending): void {
    pending.signal.removeEventListener('abort', pending.abort); this.active = undefined; this.pump();
  }
  private received = (event: MessageEvent<GeometryReply>): void => {
    const pending = this.active; if (!pending || event.data.id !== pending.job.id) return;
    if (pending.signal.aborted || this.disposed) { this.finish(pending); return; }
    if (!event.data.packet) { this.failed(); return; }
    try {
      const packet = event.data.packet;
      this.profile.record('worker-cpu', `${pending.job.id}`, pending.start, packet.cpuMs);
      const sampler = this.profile.measure('sampler', String(pending.job.id), () => surfaceSampler(pending.job.data, pending.job.lod, this.terrain));
      const model = this.profile.measure('hydrate', String(pending.job.id), () => unpackGeometry(packet, sampler, this.atmosphere));
      this.profile.record('geometry', `${pending.job.overview ? 'overview' : pending.job.data.terrain?.id}:${pending.job.lod}`, pending.start); pending.resolve(model);
    } catch (error) { pending.reject(error); }
    finally { this.finish(pending); }
  };
  private fallback(pending: Pending): void {
    try { if (!pending.signal.aborted) pending.resolve(this.profile.measure('geometry-fallback', String(pending.job.id), () => prepareGeometry(pending.job.data, pending.job.lod, this.terrain, pending.job.overview, this.atmosphere))); }
    catch (error) { pending.reject(error); }
    finally { this.finish(pending); }
  }
  private failed = (event?: ErrorEvent): void => {
    event?.preventDefault(); this.worker?.terminate(); this.worker = undefined;
    if (this.active) this.fallback(this.active);
  };
  dispose(): void {
    this.disposed = true; this.worker?.terminate(); this.worker = undefined;
    for (const pending of [...this.queue, ...(this.active ? [this.active] : [])]) { pending.signal.removeEventListener('abort', pending.abort); pending.reject(new DOMException('Worker arrêté', 'AbortError')); }
    this.queue.length = 0; this.active = undefined;
  }
}
