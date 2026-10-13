/** Mesures facultatives (?profil=1), bornées et sans dépendance de diagnostic. */
export interface Timing { kind: string; id: string; start: number; duration: number }
interface ProfileApi { snapshot: () => { events: Timing[]; state: unknown } }
export class PerformanceLog {
  readonly enabled: boolean;
  private readonly events: Timing[] = [];
  private api: ProfileApi | undefined;
  constructor(enabled = new URL(location.href).searchParams.get('profil') === '1') { this.enabled = enabled; }
  record(kind: string, id: string, start: number, duration = performance.now() - start): void {
    if (!this.enabled) return;
    this.events.push({ kind, id, start, duration });
    if (this.events.length > 1024) this.events.shift();
  }
  measure<T>(kind: string, id: string, task: () => T): T {
    if (!this.enabled) return task();
    const start = performance.now(); try { return task(); } finally { this.record(kind, id, start); }
  }
  publish(state: () => unknown): void {
    if (!this.enabled) return;
    this.api = { snapshot: () => ({ events: this.events.slice(), state: state() }) };
    (window as unknown as { nantesProfile?: ProfileApi }).nantesProfile = this.api;
  }
  dispose(): void {
    if (!this.enabled) return;
    const target = window as unknown as { nantesProfile?: ProfileApi };
    if (target.nantesProfile === this.api) delete target.nantesProfile;
    this.events.length = 0; this.api = undefined;
  }
}
