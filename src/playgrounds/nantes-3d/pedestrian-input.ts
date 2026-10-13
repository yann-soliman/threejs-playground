import { editableTarget, movementKey, Walker } from './walking';

export class PedestrianInput {
  private pointer: { id: number; x: number; y: number; type: string; moved: boolean } | undefined;
  private readonly touch = new Map<number, string>();
  private disposed = false;
  private readonly shifts = new Set<string>();
  private readonly abort = new AbortController();
  constructor(private readonly viewport: HTMLElement, private readonly canvas: HTMLCanvasElement, private readonly walker: Walker, private readonly enabled: () => boolean, private readonly changed: () => void, private readonly message: (text: string) => void) {
    const options = { signal: this.abort.signal };
    window.addEventListener('keydown', this.keydown, options); window.addEventListener('keyup', this.keyup, options); window.addEventListener('blur', this.stop, options);
    document.addEventListener('pointerlockchange', this.lockChanged, options); document.addEventListener('pointerlockerror', this.lockError, options); document.addEventListener('mousemove', this.mousemove, options);
    canvas.addEventListener('pointerdown', this.down, options); canvas.addEventListener('pointermove', this.move, options); canvas.addEventListener('pointerup', this.up, options); canvas.addEventListener('pointercancel', this.cancel, options);
    viewport.addEventListener('focusout', this.focusout, options);
    for (const button of viewport.querySelectorAll<HTMLButtonElement>('[data-walk]')) {
      button.addEventListener('pointerdown', (event) => { if (!this.enabled()) return; event.preventDefault(); button.setPointerCapture(event.pointerId); const key = button.dataset.walk!; this.touch.set(event.pointerId, key); this.walker.setKey(key, true); this.changed(); }, options);
      const release = (event: PointerEvent): void => { const key = this.touch.get(event.pointerId); this.touch.delete(event.pointerId); if (key && ![...this.touch.values()].includes(key) && !(key === 'fast' && this.shifts.size)) this.walker.setKey(key, false); this.changed(); };
      button.addEventListener('pointerup', release, options); button.addEventListener('pointercancel', release, options); button.addEventListener('lostpointercapture', release, options);
    }
  }
  private keydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && document.pointerLockElement === this.canvas) { this.release(); return; }
    if (!this.enabled() || editableTarget(event.target) || (document.activeElement !== this.viewport && document.pointerLockElement !== this.canvas)) return;
    const key = movementKey(event); if (!key) return;
    event.preventDefault(); if (key === 'fast') this.shifts.add(event.code); if (this.walker.keys.has(key)) return; this.walker.setKey(key, true); this.changed();
  };
  private keyup = (event: KeyboardEvent): void => { const key = movementKey(event); if (key === 'fast') { this.shifts.delete(event.code); if (this.shifts.size || [...this.touch.values()].includes('fast')) return; } if (key && this.walker.keys.has(key)) { this.walker.setKey(key, false); this.changed(); } };
  private focusout = (): void => { if (document.pointerLockElement !== this.canvas) this.stop(); };
  private lockChanged = (): void => { if (document.pointerLockElement === this.canvas && !this.enabled()) { this.release(); return; } if (document.pointerLockElement !== this.canvas) this.stop(); this.message(document.pointerLockElement === this.canvas ? 'Échap libère la souris · ZQSD / WASD pour marcher.' : 'Cliquer dans la scène pour regarder autour de soi ; glisser si la capture est indisponible.'); };
  private lockError = (): void => { if (!this.disposed) this.message('Capture indisponible : glisser dans la scène pour regarder autour de soi.'); };
  private mousemove = (event: MouseEvent): void => { if (this.enabled() && document.pointerLockElement === this.canvas) { this.walker.look(event.movementX, event.movementY); this.changed(); } };
  private down = (event: PointerEvent): void => {
    if (!this.enabled() || !event.isPrimary || event.button !== 0) return;
    this.viewport.focus({ preventScroll: true }); this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, type: event.pointerType, moved: false };
    this.canvas.setPointerCapture(event.pointerId);
  };
  private move = (event: PointerEvent): void => {
    const p = this.pointer; if (!this.enabled() || !p || p.id !== event.pointerId || document.pointerLockElement === this.canvas) return;
    if (Math.hypot(event.clientX - p.x, event.clientY - p.y) > 3) p.moved = true;
    this.walker.look(event.clientX - p.x, event.clientY - p.y); p.x = event.clientX; p.y = event.clientY; this.changed();
  };
  private up = (event: PointerEvent): void => {
    const p = this.pointer; this.pointer = undefined;
    if (!p || p.moved || !this.enabled() || p.type === 'touch' || document.pointerLockElement === this.canvas || !this.canvas.requestPointerLock) return;
    // Exclusivement le geste utilisateur ; jamais à l'entrée dans le mode.
    try { const result = this.canvas.requestPointerLock(); result?.then(() => { if ((this.disposed || !this.enabled()) && document.pointerLockElement === this.canvas) document.exitPointerLock(); }).catch(() => this.lockError()); } catch { this.lockError(); }
    void event;
  };
  private cancel = (): void => { this.pointer = undefined; };
  stop = (): void => { this.walker.stop(); this.shifts.clear(); this.touch.clear(); this.pointer = undefined; this.changed(); };
  release(): void { this.stop(); if (document.pointerLockElement === this.canvas) document.exitPointerLock(); }
  dispose(): void { this.disposed = true; this.abort.abort(); this.release(); }
}
