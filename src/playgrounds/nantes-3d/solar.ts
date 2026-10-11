/** Équations solaires NOAA (coordonnées géographiques, azimut depuis le nord). */
const rad = Math.PI / 180;
export const NANTES = { latitude: 47.2156, longitude: -1.5524 };
const wrap = (n: number, period: number): number => ((n % period) + period) % period;

function elements(instant: Date): { declination: number; equation: number } {
  const t = (instant.getTime() / 86400000 + 2440587.5 - 2451545) / 36525;
  const l = wrap(280.46646 + t * (36000.76983 + t * .0003032), 360) * rad;
  const m = (357.52911 + t * (35999.05029 - .0001537 * t)) * rad;
  const e = .016708634 - t * (.000042037 + .0000001267 * t);
  const c = (1.914602 - t * (.004817 + .000014 * t)) * Math.sin(m) + (.019993 - .000101 * t) * Math.sin(2 * m) + .000289 * Math.sin(3 * m);
  const omega = (125.04 - 1934.136 * t) * rad;
  const longitude = l + (c - .00569 - .00478 * Math.sin(omega)) * rad;
  const obliquity = (23 + (26 + (21.448 - t * (46.815 + t * (.00059 - .001813 * t))) / 60) / 60 + .00256 * Math.cos(omega)) * rad;
  const y = Math.tan(obliquity / 2) ** 2;
  return { declination: Math.asin(Math.sin(obliquity) * Math.sin(longitude)),
    equation: 4 / rad * (y * Math.sin(2 * l) - 2 * e * Math.sin(m) + 4 * e * y * Math.sin(m) * Math.cos(2 * l) - .5 * y * y * Math.sin(4 * l) - 1.25 * e * e * Math.sin(2 * m)) };
}

export function solarPosition(instant: Date, latitude = NANTES.latitude, longitude = NANTES.longitude): { azimuth: number; elevation: number } {
  const { declination, equation } = elements(instant);
  const minutes = instant.getUTCHours() * 60 + instant.getUTCMinutes() + instant.getUTCSeconds() / 60 + instant.getUTCMilliseconds() / 60000;
  const hourAngle = (wrap(minutes + equation + longitude * 4, 1440) / 4 - 180) * rad;
  const lat = latitude * rad;
  const elevation = Math.asin(Math.max(-1, Math.min(1, Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle))));
  const azimuth = wrap(Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat)) + Math.PI, Math.PI * 2);
  return { azimuth, elevation };
}

/** X est, Y haut, Z sud ; vecteur dirigé vers le soleil, et non vers ses rayons. */
export function solarDirection(azimuth: number, elevation: number): [number, number, number] {
  return [Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)];
}

export function solarEvents(date: string, latitude = NANTES.latitude, longitude = NANTES.longitude): { sunrise?: Date; sunset?: Date; dawn?: Date; dusk?: Date } {
  const midnight = Date.parse(`${date}T00:00:00Z`);
  function crossing(altitude: number, rising: boolean): Date | undefined {
    let minutes = rising ? 360 : 1080;
    for (let i = 0; i < 4; i++) {
      const { declination, equation } = elements(new Date(midnight + minutes * 60000));
      const lat = latitude * rad;
      const cosine = (Math.sin(altitude * rad) - Math.sin(lat) * Math.sin(declination)) / (Math.cos(lat) * Math.cos(declination));
      if (Math.abs(cosine) > 1) return undefined;
      minutes = 720 - longitude * 4 - equation + (rising ? -1 : 1) * Math.acos(cosine) / rad * 4;
    }
    return new Date(midnight + minutes * 60000);
  }
  return { sunrise: crossing(-.833, true), sunset: crossing(-.833, false), dawn: crossing(-6, true), dusk: crossing(-6, false) };
}

export function smoothstep(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}
export function daylight(elevation: number): { day: number; sunlight: number; night: number; warmth: number } {
  const degrees = elevation / rad;
  return { day: smoothstep(-8, 12, degrees), sunlight: 3 * smoothstep(0, 18, degrees),
    night: 1 - smoothstep(-6, 3, degrees), warmth: 1 - smoothstep(2, 25, degrees) };
}
