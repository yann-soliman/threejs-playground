import type { AnimationClock } from './navigation';

/** Un seul rAF natif : caméra, simulation et rendu partagent la même cadence. */
export class AnimationScheduler implements AnimationClock {
  private frame: number | undefined;
  private readonly callbacks = new Map<number, (time: number) => void>();
  private nextId = 0;
  private inFrame = false;
  private dirty = false;
  private urgent = false;
  private continuous = false;
  private hidden = false;
  private disposed = false;
  private last: number | undefined;
  private nextDraw = -Infinity;

  constructor(private readonly clock: AnimationClock, private readonly update: (seconds: number, time: number) => void,
    private readonly render: () => void, private readonly fps: number | (() => number) = 24) {}
  now = (): number => this.clock.now();
  request = (callback: (time: number) => void): number => {
    const id = this.nextId++;
    if (!this.disposed) { this.callbacks.set(id, callback); this.wake(); }
    return id;
  };
  cancel = (id: number): void => { this.callbacks.delete(id); this.rest(); };
  invalidate(): void { if (!this.disposed) { this.dirty = true; if (!this.inFrame) this.urgent = true; this.wake(); } }
  setContinuous(active: boolean): void { this.continuous = active; active ? this.wake() : this.rest(); }
  setHidden(hidden: boolean): void {
    this.hidden = hidden; this.last = undefined;
    if (hidden) { if (this.frame !== undefined) this.clock.cancel(this.frame); this.frame = undefined; }
    else { this.dirty = true; this.wake(); }
  }
  private needed(): boolean { return this.dirty || this.continuous || this.callbacks.size > 0; }
  private rest(): void {
    if (!this.needed() && this.frame !== undefined) { this.clock.cancel(this.frame); this.frame = undefined; this.last = undefined; }
  }
  private wake(): void {
    if (!this.inFrame && this.frame === undefined && !this.hidden && !this.disposed && this.needed()) this.frame = this.clock.request(this.step);
  }
  private step = (time: number): void => {
    this.frame = undefined;
    if (this.hidden || this.disposed) return;
    this.inFrame = true;
    if (this.urgent || this.last === undefined || time >= this.nextDraw) {
      const delayedBy = this.urgent || this.last === undefined ? 0 : Math.max(0, time - this.nextDraw);
      const seconds = this.last === undefined ? 0 : Math.max(0, (time - this.last) / 1000);
      this.last = time; this.urgent = false;
      const callbacks = [...this.callbacks.values()]; this.callbacks.clear();
      callbacks.forEach((callback) => callback(time));
      this.update(seconds, time);
      if (this.disposed || this.hidden) { this.inFrame = false; return; }
      this.dirty = false;
      this.render();
      const fps = typeof this.fps === 'number' ? this.fps : this.fps();
      // Laisser un intervalle libre même si le GPU a bloqué le dessin précédent.
      this.nextDraw = this.clock.now() + Math.max(1000 / fps, Math.min(3000, delayedBy * 1.5));
    }
    this.inFrame = false;
    if (!this.needed()) this.last = undefined;
    this.wake();
  };
  dispose(): void {
    this.disposed = true;
    if (this.frame !== undefined) this.clock.cancel(this.frame);
    this.frame = undefined; this.callbacks.clear(); this.continuous = false; this.dirty = false;
  }
}
