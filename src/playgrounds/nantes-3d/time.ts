const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
export function parisTime(instant: Date): { date: string; minute: number; label: string } {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute), label: `${parts.hour}:${parts.minute}` };
}
const wallTime = (instant: Date): number => {
  const p = parisTime(instant);
  return Date.parse(`${p.date}T00:00:00Z`) + p.minute * 60000;
};

/** Heure répétée : première occurrence. Heure inexistante : prochain instant local valide. */
export function parisInstant(date: string, minute: number): { instant: Date; adjusted: boolean; ambiguous: boolean } {
  const midnight = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(midnight) || !Number.isFinite(minute) || minute < 0 || minute > 1439) throw new Error('Date ou heure locale invalide');
  const wall = midnight + Math.floor(minute) * 60000;
  const offsets = new Set([-18, 0, 18].map((hours) => {
    const sample = wall + hours * 3600000;
    return wallTime(new Date(sample)) - sample;
  }));
  for (let shift = 0; shift <= 120; shift++) {
    const local = wall + shift * 60000;
    const matches = [...offsets].map((offset) => local - offset).filter((instant) => wallTime(new Date(instant)) === local).sort((a, b) => a - b);
    if (matches.length) return { instant: new Date(matches[0]!), adjusted: shift > 0, ambiguous: matches.length > 1 };
  }
  throw new Error('Heure de Paris introuvable');
}
