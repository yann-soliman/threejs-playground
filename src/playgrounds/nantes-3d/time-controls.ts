import { parisInstant, parisTime } from './time';
import { solarEvents } from './solar';

export const timePanel = `
  <div class="nantes-time" role="group" aria-label="Date et heure à Nantes">
    <div class="nantes-time-heading"><label>Date <input type="date" min="2000-01-01" max="2099-12-31" aria-label="Date à Nantes"></label><output class="nantes-local-time"></output><span>Europe/Paris</span></div>
    <label class="nantes-hour"><span>Heure</span><input type="range" min="0" max="1439" step="1" aria-label="Heure à Nantes"><span aria-hidden="true">23:59</span></label>
    <div class="nantes-time-actions"><button type="button" data-time="now">Maintenant</button><button type="button" data-time="play" aria-pressed="false">▶ Lecture</button><label>Vitesse <select aria-label="Vitesse du temps"><option value="1">1 min/s</option><option value="10" selected>10 min/s</option><option value="60">60 min/s</option></select></label><label><input type="checkbox" class="nantes-water-toggle" checked> Animer l’eau</label><span class="nantes-sun-events"></span></div>
    <p class="nantes-time-note" role="status" hidden></p>
  </div>`;

export class TimeControls {
  instant = new Date();
  playing = false;
  private reduced = false;
  private lastDate = '';
  private lastLabel = '';
  private readonly panel: HTMLElement;
  private readonly date: HTMLInputElement;
  private readonly hour: HTMLInputElement;
  private readonly play: HTMLButtonElement;
  private readonly water: HTMLInputElement;
  private readonly speed: HTMLSelectElement;

  constructor(container: HTMLElement, private readonly changed: () => void) {
    this.panel = container.querySelector('.nantes-time')!;
    this.date = this.panel.querySelector('[type=date]')!;
    this.hour = this.panel.querySelector('[type=range]')!;
    this.play = this.panel.querySelector('[data-time=play]')!;
    this.water = this.panel.querySelector('.nantes-water-toggle')!;
    this.speed = this.panel.querySelector('select')!;
    this.panel.addEventListener('input', this.input);
    this.panel.addEventListener('click', this.click);
    this.refresh();
  }
  get waterPlaying(): boolean { return this.water.checked && !this.reduced; }
  advance(seconds: number): boolean {
    if (!this.playing || seconds <= 0) return false;
    const next = new Date(this.instant.getTime() + seconds * Number(this.speed.value) * 60000);
    if (parisTime(next).date > '2099-12-31') { this.pause(); return false; }
    this.instant = next; this.refresh(); return true;
  }
  pause(): void { this.playing = false; this.refresh(); }
  setReduced(reduced: boolean): void {
    this.reduced = reduced;
    if (reduced) this.pause();
    this.play.disabled = reduced; this.water.disabled = reduced;
    this.note(reduced ? 'Animations réduites : eau figée et lecture désactivée.' : '');
  }
  private note(message: string): void {
    const note = this.panel.querySelector<HTMLElement>('.nantes-time-note')!;
    note.textContent = message; note.hidden = !message;
  }
  private input = (event: Event): void => {
    if (event.target === this.date || event.target === this.hour) {
      if (!this.date.validity.valid || !this.date.value) return;
      const converted = parisInstant(this.date.value, Number(this.hour.value));
      this.instant = converted.instant; this.playing = false;
      this.note(converted.adjusted ? 'Changement d’heure : cette heure n’existe pas ; passage à 03:00.' : converted.ambiguous ? 'Changement d’heure : première occurrence de cette heure (heure d’été).' : this.reduced ? 'Animations réduites : eau figée et lecture désactivée.' : '');
      this.refresh();
    }
    this.changed();
  };
  private click = (event: MouseEvent): void => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-time]')?.dataset.time;
    if (action === 'now') { this.instant = new Date(); this.playing = false; this.note(''); }
    if (action === 'play' && !this.reduced) this.playing = !this.playing;
    if (action) { this.refresh(); this.changed(); }
  };
  private refresh(): void {
    const local = parisTime(this.instant);
    this.hour.value = String(local.minute); this.date.value = local.date;
    if (local.label !== this.lastLabel) {
      this.panel.querySelector('output')!.textContent = local.label;
      this.hour.setAttribute('aria-valuetext', `${local.label}, heure de Nantes`);
      this.lastLabel = local.label;
    }
    if (local.date !== this.lastDate) {
      const { sunrise, sunset } = solarEvents(local.date);
      this.panel.querySelector('.nantes-sun-events')!.textContent = `Lever ${sunrise ? parisTime(sunrise).label : '—'} · coucher ${sunset ? parisTime(sunset).label : '—'}`;
      this.lastDate = local.date;
    }
    this.play.textContent = this.playing ? 'Ⅱ Pause' : '▶ Lecture';
    this.play.setAttribute('aria-pressed', String(this.playing));
  }
  dispose(): void {
    this.playing = false;
    this.panel.removeEventListener('input', this.input);
    this.panel.removeEventListener('click', this.click);
  }
}
