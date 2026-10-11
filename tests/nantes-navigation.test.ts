import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import data from '../src/playgrounds/nantes-3d/data/city.json';
import {
  aerialPose, CameraNavigator, cameraPosition, interpolatePose, northPose,
  readCameraPose, shortestAngle,
} from '../src/playgrounds/nantes-3d/navigation';
import type { AnimationClock, CameraPose } from '../src/playgrounds/nantes-3d/navigation';
import { pointsOfInterest, projectCoordinates, selectPointOfInterest } from '../src/playgrounds/nantes-3d/pois';
import type { CityData } from '../src/playgrounds/nantes-3d/types';

const meta: CityData['meta'] = { ...data.meta, origin: [data.meta.origin[0]!, data.meta.origin[1]!] };
const pose = (azimuth = 0): CameraPose => ({ target: new Vector3(12, 0, 34), distance: 500, polar: 0.8, azimuth });
const degrees = (value: number): number => value * Math.PI / 180;

function harness() {
  let time = 0, nextId = 0, current = pose(), applied = 0;
  const callbacks = new Map<number, (time: number) => void>();
  const clock: AnimationClock = {
    now: () => time,
    request: (callback) => { const id = nextId++; callbacks.set(id, callback); return id; },
    cancel: (id) => { callbacks.delete(id); },
  };
  const navigator = new CameraNavigator(
    () => ({ ...current, target: current.target.clone() }),
    (value) => { current = value; applied++; },
    clock,
  );
  return {
    navigator, callbacks,
    current: () => current,
    applied: () => applied,
    tick: (at: number): void => {
      time = at;
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback(time));
    },
  };
}

describe('Boussole géographique', () => {
  it('réoriente au nord sans modifier cible, distance ni inclinaison', () => {
    const initial = pose(2.1);
    const north = northPose(initial);
    expect(north.target).toEqual(initial.target);
    expect(north.target).not.toBe(initial.target);
    expect(north.distance).toBe(initial.distance);
    expect(north.polar).toBe(initial.polar);
    expect(north.azimuth).toBe(0);
    const camera = new PerspectiveCamera(42, 1, 1, 4000);
    camera.position.copy(cameraPosition(north));
    camera.lookAt(north.target); camera.updateMatrixWorld();
    const projectedNorth = north.target.clone().add(new Vector3(0, 0, -50)).project(camera);
    expect(projectedNorth.x).toBeCloseTo(0);
    expect(projectedNorth.y).toBeGreaterThan(0);
    const captured = readCameraPose(camera, north.target);
    expect(captured.distance).toBeCloseTo(initial.distance);
    expect(captured.polar).toBeCloseTo(initial.polar);
  });
  it('oriente la rose comme la projection : nord à droite depuis l’est', () => {
    const east = pose(Math.PI / 2);
    const camera = new PerspectiveCamera(42, 1, 1, 4000);
    camera.position.copy(cameraPosition(east));
    camera.lookAt(east.target); camera.updateMatrixWorld();
    expect(east.target.clone().add(new Vector3(0, 0, -50)).project(camera).x).toBeGreaterThan(0);
  });
  it('traverse ±π par le chemin court et déroule les tours complets', () => {
    expect(shortestAngle(degrees(179), degrees(-179))).toBeCloseTo(degrees(2));
    expect(shortestAngle(degrees(-179), degrees(179))).toBeCloseTo(degrees(-2));
    expect(shortestAngle(2 * Math.PI, 0)).toBeCloseTo(0);
    expect(interpolatePose(pose(degrees(179)), pose(degrees(-179)), 0.5).azimuth).toBeCloseTo(Math.PI);
  });
});

describe('Transitions de caméra', () => {
  it('interpole avec easing, atteint la destination en 1,4 s et arrête les frames', () => {
    const h = harness();
    const destination = { ...pose(1), target: new Vector3(100, 10, -50), distance: 300, polar: 1.1 };
    h.navigator.moveTo(destination);
    expect(h.current().distance).toBe(500);
    expect(h.callbacks.size).toBe(1);
    h.tick(350);
    expect(h.current().distance).toBeCloseTo(468.75);
    expect(h.navigator.active).toBe(true);
    expect(h.callbacks.size).toBe(1);
    h.tick(700);
    expect(h.current().distance).toBe(400);
    expect(h.current().target).toEqual(new Vector3(56, 5, -8));
    h.tick(1400);
    expect(h.current().target).toEqual(destination.target);
    expect(h.current().distance).toBe(300);
    expect(h.current().polar).toBeCloseTo(1.1);
    expect(h.navigator.active).toBe(false);
    expect(h.callbacks.size).toBe(0);
    const count = h.applied();
    h.tick(2000);
    expect(h.applied()).toBe(count);
  });
  it('annule au geste manuel sans saut ni reprise automatique', () => {
    const h = harness();
    h.navigator.moveTo({ ...pose(), distance: 200 });
    h.tick(500);
    const captured = h.current();
    h.navigator.cancel();
    h.tick(1600);
    expect(h.current()).toBe(captured);
    expect(h.callbacks.size).toBe(0);
    expect(h.navigator.active).toBe(false);
  });
  it('remplace une action en cours depuis la pose actuelle avec un seul callback', () => {
    const h = harness();
    h.navigator.moveTo({ ...pose(), distance: 200 });
    const obsolete = [...h.callbacks.values()][0]!;
    h.tick(700);
    const captured = h.current();
    h.navigator.moveTo({ ...pose(-1), distance: 900 });
    expect(h.current()).toBe(captured);
    expect(h.callbacks.size).toBe(1);
    obsolete(1400);
    expect(h.current()).toBe(captured);
    h.tick(1400);
    expect(h.current().distance).toBeCloseTo(625);
    h.tick(2100);
    expect(h.current().distance).toBe(900);
    expect(h.callbacks.size).toBe(0);
  });
  it('honore la réduction des animations sans démarrer de boucle', () => {
    const h = harness();
    h.navigator.moveTo({ ...pose(), distance: 200 }, 0);
    expect(h.current().distance).toBe(200);
    expect(h.applied()).toBe(1);
    expect(h.callbacks.size).toBe(0);
  });
  it('annule les ressources et ignore les callbacks tardifs après fermeture', () => {
    const h = harness();
    h.navigator.moveTo({ ...pose(), distance: 200 });
    const obsolete = [...h.callbacks.values()][0]!;
    h.navigator.dispose(); h.navigator.dispose();
    obsolete(1400);
    h.navigator.moveTo(pose());
    expect(h.applied()).toBe(0);
    expect(h.callbacks.size).toBe(0);
  });
});

describe('Sélection des points d’intérêt', () => {
  it('utilise des identifiants uniques et des ancrages dans l’emprise OSM', () => {
    expect(new Set(pointsOfInterest.map((p) => p.id)).size).toBe(pointsOfInterest.length);
    for (const point of pointsOfInterest) {
      const selected = selectPointOfInterest(point.id, meta, pose(1.2), 1.7)!;
      expect(selected).toBeDefined();
      expect(selected.point.name).toBe(point.name);
      expect(selected.pose.azimuth).toBe(1.2);
      expect(selected.pose.polar).toBe(0.8);
      expect(selected.pose.distance).toBe(point.distance);
      expect(Math.abs(selected.pose.target.x)).toBeLessThan(meta.width / 2);
      expect(Math.abs(selected.pose.target.z)).toBeLessThan(meta.depth / 2);
      expect(selected.marker.y).toBeGreaterThan(0);
      const url = new URL(selected.url);
      expect(url.origin).toBe('https://www.openstreetmap.org');
      expect(Number(url.searchParams.get('mlat'))).toBe(point.coordinates[0]);
      expect(Number(url.searchParams.get('mlon'))).toBe(point.coordinates[1]);
    }
  });
  it('projette avec la même origine et le même sens des axes que le diorama', () => {
    expect(projectCoordinates(meta.origin, meta.origin).length()).toBe(0);
    expect(projectCoordinates([meta.origin[0] + 0.001, meta.origin[1]], meta.origin).z).toBeLessThan(0);
    expect(projectCoordinates([meta.origin[0], meta.origin[1] + 0.001], meta.origin).x).toBeGreaterThan(0);
    const cathedral = selectPointOfInterest('cathedral', meta, pose(), 1)!;
    expect(cathedral.pose.target.x).toBeCloseTo(166, 0);
    expect(cathedral.pose.target.z).toBeCloseTo(-308, 0);
  });
  it('ancre les lieux dans les géométries OSM nommées du snapshot', () => {
    for (const point of pointsOfInterest) {
      const building = data.buildings.find((feature) => feature.id === point.source);
      const road = data.roads.find((feature) => feature.id === point.source);
      const points = building?.rings[0] ?? road?.points;
      expect(points, point.source).toBeDefined();
      const xs = points!.map((p) => p[0]!), zs = points!.map((p) => p[1]!);
      const expected = new Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2);
      const projected = projectCoordinates(point.coordinates, meta.origin);
      // L'asset métrique arrondit les coordonnées OSM au centimètre.
      expect(projected.distanceTo(expected), point.source).toBeLessThan(0.02);
    }
  });
  it('refuse les identifiants inconnus et les lieux hors emprise', () => {
    expect(selectPointOfInterest('unknown', meta, pose(), 1)).toBeUndefined();
    expect(selectPointOfInterest('castle', { ...meta, bbox: [0, 0, 1, 1] }, pose(), 1)).toBeUndefined();
  });
  it('adapte le cadrage mobile et transmet une sélection à la transition', () => {
    const h = harness();
    const selected = selectPointOfInterest('castle', meta, h.current(), 0.8)!;
    expect(selected.pose.distance).toBeGreaterThan(pointsOfInterest[0]!.distance);
    h.navigator.moveTo(selected.pose);
    h.tick(1400);
    expect(h.current().target).toEqual(selected.pose.target);
    expect(h.current().distance).toBe(selected.pose.distance);
    expect(aerialPose(0.8).distance).toBeGreaterThan(aerialPose(1.7).distance);
    expect(aerialPose(0.1).distance).toBeLessThanOrEqual(2600);
  });
});
