import { describe, expect, it, vi } from 'vitest';
import { Color, DirectionalLight, Fog, HemisphereLight, Scene, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import type { WebGLRenderer } from 'three';
import { solarDirection, solarEvents, solarPosition, daylight } from '../src/playgrounds/nantes-3d/solar';
import { parisInstant, parisTime } from '../src/playgrounds/nantes-3d/time';
import { AnimationScheduler } from '../src/playgrounds/nantes-3d/animation';
import { atmosphereUniforms, waterMaterial, windowIllumination, windowMaterial } from '../src/playgrounds/nantes-3d/atmosphere';
import { createCity } from '../src/playgrounds/nantes-3d/city';
import { createOverview } from '../src/playgrounds/nantes-3d/overview';
import type { CityData } from '../src/playgrounds/nantes-3d/types';
import type { CityManifest } from '../src/playgrounds/nantes-3d/tiles';
import { CameraNavigator } from '../src/playgrounds/nantes-3d/navigation';
import { Vector3 } from 'three';
import { SolarLighting } from '../src/playgrounds/nantes-3d/lighting';

const deg = 180 / Math.PI;
describe('Soleil géographique NOAA', () => {
  it('retrouve l’exemple de référence NREL SPA du 17 octobre 2003 au Colorado', () => {
    // Exemple spa.c : 12:30:30 MST, azimut 194,34024°, hauteur environ 39,9°.
    const sun = solarPosition(new Date('2003-10-17T19:30:30Z'), 39.742476, -105.1786);
    expect(sun.azimuth * deg).toBeCloseTo(194.34, 0);
    expect(Math.abs(sun.elevation * deg - 39.89)).toBeLessThan(.1);
  });
  it('donne les horaires saisonniers de Nantes et le crépuscule civil', () => {
    const summer = solarEvents('2026-06-21');
    expect(Math.abs(summer.sunrise!.getTime() - Date.parse('2026-06-21T04:10:00Z'))).toBeLessThan(5 * 60000);
    expect(Math.abs(summer.sunset!.getTime() - Date.parse('2026-06-21T20:06:00Z'))).toBeLessThan(5 * 60000);
    const winter = solarEvents('2026-12-21');
    expect(Math.abs(winter.sunrise!.getTime() - Date.parse('2026-12-21T07:49:00Z'))).toBeLessThan(5 * 60000);
    expect(Math.abs(winter.sunset!.getTime() - Date.parse('2026-12-21T16:18:00Z'))).toBeLessThan(5 * 60000);
    expect(summer.dawn!.getTime()).toBeLessThan(summer.sunrise!.getTime());
    expect(summer.dusk!.getTime()).toBeGreaterThan(summer.sunset!.getTime());
    expect(solarEvents('2026-06-21', 89).sunrise).toBeUndefined();
  });
  it('convertit les points cardinaux en X est, Y haut, Z sud', () => {
    expect(solarDirection(0, 0)).toEqual([0, 0, -1]);
    expect(solarDirection(Math.PI / 2, 0)[0]).toBeCloseTo(1);
    expect(solarDirection(Math.PI, 0)[2]).toBeCloseTo(1);
    expect(solarDirection(3 * Math.PI / 2, 0)[0]).toBeCloseTo(-1);
    expect(solarDirection(0, Math.PI / 2)[1]).toBeCloseTo(1);
    const midday = solarPosition(new Date('2026-06-21T12:08:00Z'));
    expect(midday.azimuth * deg).toBeCloseTo(180, 0);
    expect(midday.elevation * deg).toBeGreaterThan(65);
  });
  it('supprime le soleil sous l’horizon avec des transitions progressives', () => {
    expect(daylight(-.001).sunlight).toBe(0);
    expect(daylight(-10 / deg).night).toBe(1);
    expect(daylight(30 / deg).night).toBe(0);
    let previous = 0;
    for (let angle = -12; angle <= 50; angle += .1) {
      const light = daylight(angle / deg);
      expect(light.day).toBeGreaterThanOrEqual(previous);
      expect(light.day).toBeGreaterThanOrEqual(0); expect(light.day).toBeLessThanOrEqual(1);
      previous = light.day;
    }
  });
});

describe('Heure Europe/Paris', () => {
  it('convertit minuit et 23:59 sans dépendre du fuseau du navigateur', () => {
    expect(parisInstant('2026-01-10', 0).instant.toISOString()).toBe('2026-01-09T23:00:00.000Z');
    expect(parisInstant('2026-06-21', 1439).instant.toISOString()).toBe('2026-06-21T21:59:00.000Z');
    expect(parisTime(new Date('2026-06-21T22:00:00Z'))).toEqual({ date: '2026-06-22', minute: 0, label: '00:00' });
  });
  it('normalise l’heure inexistante au printemps vers 03:00', () => {
    const converted = parisInstant('2026-03-29', 150);
    expect(converted.adjusted).toBe(true);
    expect(parisTime(converted.instant).label).toBe('03:00');
    expect(converted.instant.toISOString()).toBe('2026-03-29T01:00:00.000Z');
  });
  it('choisit explicitement la première occurrence en automne', () => {
    const converted = parisInstant('2026-10-25', 150);
    expect(converted.ambiguous).toBe(true);
    expect(converted.instant.toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(parisTime(new Date(converted.instant.getTime() + 3600000)).label).toBe('02:30');
  });
  it('préserve toutes les minutes d’une journée ordinaire et les deux bascules', () => {
    for (let minute = 0; minute < 1440; minute++) expect(parisTime(parisInstant('2026-10-11', minute).instant).minute).toBe(minute);
    expect(parisTime(new Date('2026-03-29T00:59:00Z')).label).toBe('01:59');
    expect(parisTime(new Date('2026-03-29T01:00:00Z')).label).toBe('03:00');
    expect(parisTime(new Date('2026-10-25T00:59:00Z')).label).toBe('02:59');
    expect(parisTime(new Date('2026-10-25T01:00:00Z')).label).toBe('02:00');
  });
});

function schedulerHarness(renderCost = 0) {
  let now = 0, id = 0;
  const pending = new Map<number, (time: number) => void>();
  const update = vi.fn(), render = vi.fn(() => { now += renderCost; });
  const scheduler = new AnimationScheduler({ now: () => now, request: (callback) => { pending.set(++id, callback); return id; }, cancel: (key) => { pending.delete(key); } }, update, render, 20);
  return { scheduler, pending, update, render, tick: (time: number) => { now = time; const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach((callback) => callback(time)); } };
}
describe('Ordonnanceur central', () => {
  it('regroupe les invalidations, limite la cadence et retrouve le repos', () => {
    const h = schedulerHarness(); h.scheduler.invalidate(); h.scheduler.invalidate(); expect(h.pending.size).toBe(1);
    h.tick(0); expect(h.render).toHaveBeenCalledTimes(1); expect(h.pending.size).toBe(0);
    h.scheduler.setContinuous(true); h.tick(10); h.tick(20); h.tick(30); h.tick(60);
    expect(h.render).toHaveBeenCalledTimes(3); expect(h.pending.size).toBe(1);
    h.scheduler.setContinuous(false); expect(h.pending.size).toBe(0);
    h.scheduler.invalidate(); h.tick(70); expect(h.update.mock.calls.at(-1)![0]).toBe(0);
  });
  it('laisse un intervalle libre après un dessin coûteux et conserve le delta réel', () => {
    const h = schedulerHarness(200); h.scheduler.setContinuous(true); h.tick(0);
    h.tick(210); expect(h.render).toHaveBeenCalledTimes(1);
    h.tick(250); expect(h.render).toHaveBeenCalledTimes(2);
    expect(h.update.mock.calls.at(-1)![0]).toBe(.25);
  });
  it('réduit la pression quand les frames arrivent très en retard', () => {
    const h = schedulerHarness(); h.scheduler.setContinuous(true); h.tick(0); h.tick(1000);
    h.tick(1100); expect(h.render).toHaveBeenCalledTimes(2);
    h.tick(2500); expect(h.render).toHaveBeenCalledTimes(3);
  });
  it('traite un changement manuel sans attendre le refroidissement adaptatif', () => {
    const h = schedulerHarness(); h.scheduler.setContinuous(true); h.tick(0); h.tick(1000);
    h.scheduler.invalidate(); h.tick(1100); expect(h.render).toHaveBeenCalledTimes(3);
  });
  it('partage une seule chaîne avec CameraNavigator et finit à la destination', () => {
    const h = schedulerHarness();
    let pose = { target: new Vector3(), distance: 500, polar: 1, azimuth: 0 };
    const navigator = new CameraNavigator(() => pose, (next) => { pose = next; h.scheduler.invalidate(); }, h.scheduler);
    h.scheduler.setContinuous(true); navigator.moveTo({ ...pose, distance: 200 });
    for (let time = 0; time <= 1400; time += 50) { expect(h.pending.size).toBe(1); h.tick(time); }
    expect(pose.distance).toBe(200); expect(navigator.active).toBe(false);
    h.scheduler.setContinuous(false); expect(h.pending.size).toBe(0);
  });
  it('arrête toute activité masquée et reprend sans accumuler le temps absent', () => {
    const h = schedulerHarness(); h.scheduler.setContinuous(true); h.tick(0); h.tick(100);
    expect(h.update.mock.calls.at(-1)![0]).toBe(.1);
    h.scheduler.setHidden(true); expect(h.pending.size).toBe(0); h.tick(5000);
    h.scheduler.invalidate(); expect(h.pending.size).toBe(0);
    h.scheduler.setHidden(false); h.tick(6000); expect(h.update.mock.calls.at(-1)![0]).toBe(0);
  });
  it('annule les callbacks périmés et ne reprend pas après destruction', () => {
    const h = schedulerHarness(); const callback = vi.fn(); const id = h.scheduler.request(callback); h.scheduler.cancel(id);
    expect(h.pending.size).toBe(0);
    h.scheduler.setContinuous(true); const stale = [...h.pending.values()][0]!;
    h.scheduler.dispose(); h.scheduler.dispose(); stale(100); h.scheduler.invalidate(); h.scheduler.setContinuous(true);
    expect(h.pending.size).toBe(0); expect(h.render).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled();
  });
});

const data: CityData = { meta: { bbox: [47, -2, 48, -1], origin: [47.2156, -1.5524], width: 500, depth: 500, extractedAt: '', osmTimestamp: '', skippedBuildings: [], source: '', license: '' }, buildings: [], roads: [], walls: [], trees: [], surfaces: [{ id: 'water/1', tags: {}, kind: 'water', rings: [[[0, 0], [50, 0], [50, 50], [0, 50]]] }] };
const compile = (material: MeshStandardMaterial) => {
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>\n#include <worldpos_vertex>', fragmentShader: '#include <color_fragment>\n#include <normal_fragment_maps>\n#include <emissivemap_fragment>\n#include <clipping_planes_fragment>' } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as WebGLRenderer); return shader;
};
describe('Fenêtres et eau sans reconstruction', () => {
  it('éclaire une minorité stable de fenêtres avec plusieurs teintes', () => {
    const colors = Array.from({ length: 1000 }, (_, i) => windowIllumination(`way/123:0:2:1:${i}`));
    const count = colors.filter((rgb) => rgb[0] > 0).length;
    expect(count).toBeGreaterThan(150); expect(count).toBeLessThan(300);
    expect(new Set(colors.map((c) => c.join())).size).toBe(4);
    expect(windowIllumination('building/window')).toEqual(windowIllumination('building/window'));
  });
  it('partage les uniformes et conserve les coordonnées mondiales de l’eau', () => {
    const uniforms = atmosphereUniforms(); const a = waterMaterial(uniforms), b = waterMaterial(uniforms);
    const shader = compile(a), second = compile(b);
    expect(shader.uniforms.waterTime).toBe(second.uniforms.waterTime);
    expect(shader.vertexShader).toContain('(modelMatrix * vec4(transformed, 1.0)).xz');
    uniforms.time.value = 123; expect(shader.uniforms.waterTime!.value).toBe(123);
    a.dispose(); b.dispose();
  });
  it('utilise une émission par instance, sans PointLight ni mutation de géométrie', () => {
    const uniforms = atmosphereUniforms(), geometry = new PlaneGeometry(1, 1);
    const material = windowMaterial(geometry, [1, .5, .2, 0, 0, 0], uniforms), shader = compile(material);
    const array = geometry.getAttribute('windowGlow').array;
    uniforms.night.value = 1;
    expect(shader.uniforms.nightAmount!.value).toBe(1);
    expect(geometry.getAttribute('windowGlow').array).toBe(array);
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance += glow');
    material.dispose(); geometry.dispose();
  });
  it('sépare l’eau des sols pour tous les LOD et libère les ressources', () => {
    for (const lod of ['near', 'medium', 'far'] as const) {
      const city = createCity(data, { lod, ground: false });
      const mesh = city.group.children.find((object) => object instanceof Mesh) as Mesh;
      const material = mesh.material as MeshStandardMaterial;
      expect(compile(material).uniforms.waterTime).toBeDefined();
      const disposed = vi.fn(); material.addEventListener('dispose', disposed);
      city.dispose(); city.dispose(); expect(disposed).toHaveBeenCalledTimes(1);
    }
  });
  it('combine le shader d’eau avec le masque de remplacement de la vue générale', () => {
    const manifest = { bounds: [0, 0, 500, 500], tileSize: 500, boundary: [[[[0, 0], [500, 0], [500, 500], [0, 500]]]] } as unknown as CityManifest;
    const overview = createOverview(data, manifest);
    const nested = overview.group.children.find((child) => child.type === 'Group')!;
    const water = nested.children.find((child) => child instanceof Mesh) as Mesh;
    const shader = compile(water.material as MeshStandardMaterial);
    expect(shader.uniforms.waterTime).toBeDefined(); expect(shader.uniforms.tileMask).toBeDefined();
    expect(shader.fragmentShader).toContain('discard'); overview.dispose();
  });
});


describe('Éclairage et ombres locales', () => {
  it('oriente réellement le soleil, garde la nuit navigable et désactive les ombres lointaines', () => {
    const scene = new Scene(); scene.background = new Color(); scene.fog = new Fog('#ffffff', 100, 10000);
    const sun = new DirectionalLight(), ambient = new HemisphereLight();
    const renderer = { shadowMap: { needsUpdate: false }, toneMappingExposure: 1 } as unknown as WebGLRenderer;
    const uniforms = atmosphereUniforms(), light = new SolarLighting(scene, renderer, sun, ambient, uniforms);
    light.select(new Date('2026-06-21T12:08:00Z'), true); light.prepare(new Vector3(100, 0, 200), 500, 0);
    expect(sun.castShadow).toBe(true); expect(renderer.shadowMap.needsUpdate).toBe(true);
    expect(sun.position.y).toBeGreaterThan(3500); expect(sun.position.z).toBeGreaterThan(200);
    renderer.shadowMap.needsUpdate = false; light.prepare(new Vector3(100, 0, 200), 500, 100);
    expect(renderer.shadowMap.needsUpdate).toBe(false);
    light.select(new Date('2026-06-21T12:12:00Z')); light.prepare(new Vector3(100, 0, 200), 500, 200);
    expect(renderer.shadowMap.needsUpdate).toBe(false);
    light.prepare(new Vector3(100, 0, 200), 500, 700); expect(renderer.shadowMap.needsUpdate).toBe(true);
    light.prepare(new Vector3(), 15000, 800); expect(sun.castShadow).toBe(false);
    light.select(new Date('2026-06-21T00:00:00Z'), true); light.prepare(new Vector3(), 500, 900);
    expect(sun.intensity).toBe(0); expect(sun.castShadow).toBe(false); expect(uniforms.night.value).toBe(1);
    expect(ambient.intensity).toBeGreaterThan(.1); expect(ambient.intensity).toBeLessThan(1);
  });
});
