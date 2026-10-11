import { Spherical, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';

export interface CameraPose {
  target: Vector3;
  distance: number;
  polar: number;
  azimuth: number;
}

export function shortestAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function readCameraPose(camera: PerspectiveCamera, target: Vector3): CameraPose {
  const spherical = new Spherical().setFromVector3(camera.position.clone().sub(target));
  return { target: target.clone(), distance: spherical.radius, polar: spherical.phi, azimuth: spherical.theta };
}

export function cameraPosition(pose: CameraPose): Vector3 {
  return new Vector3().setFromSphericalCoords(pose.distance, pose.polar, pose.azimuth).add(pose.target);
}

export function northPose(pose: CameraPose): CameraPose {
  // X est, Z sud : une caméra au sud (azimut 0) place le nord en haut de l'écran.
  return { ...pose, target: pose.target.clone(), azimuth: 0 };
}

export function aerialPose(aspect: number): CameraPose {
  const offset = new Vector3(650, 800, 980).multiplyScalar(Math.max(1, 1.12 / Math.max(0.1, aspect)));
  const spherical = new Spherical().setFromVector3(offset);
  return { target: new Vector3(0, 0, 55), distance: Math.min(2600, spherical.radius), polar: spherical.phi, azimuth: spherical.theta };
}

export function interpolatePose(from: CameraPose, to: CameraPose, progress: number): CameraPose {
  const t = Math.max(0, Math.min(1, progress));
  const eased = t * t * (3 - 2 * t);
  return {
    target: from.target.clone().lerp(to.target, eased),
    distance: from.distance + (to.distance - from.distance) * eased,
    polar: from.polar + (to.polar - from.polar) * eased,
    azimuth: from.azimuth + shortestAngle(from.azimuth, to.azimuth) * eased,
  };
}

export interface AnimationClock {
  now: () => number;
  request: (callback: (time: number) => void) => number;
  cancel: (id: number) => void;
}

interface Transition {
  from: CameraPose;
  to: CameraPose;
  start: number;
  duration: number;
}

/** Une seule animation à la fois ; la scène redevient statique à sa fin. */
export class CameraNavigator {
  private transition: Transition | undefined;
  private frame: number | undefined;
  private disposed = false;

  constructor(
    private readonly read: () => CameraPose,
    private readonly apply: (pose: CameraPose) => void,
    private readonly clock: AnimationClock,
  ) {}

  get active(): boolean {
    return this.transition !== undefined;
  }

  moveTo(destination: CameraPose, duration = 1400): void {
    if (this.disposed) return;
    this.cancel();
    const to = { ...destination, target: destination.target.clone() };
    if (duration <= 0) {
      this.apply(to);
      return;
    }
    const transition = { from: this.read(), to, start: this.clock.now(), duration };
    this.transition = transition;
    const step = (time: number): void => {
      if (this.disposed || this.transition !== transition) return;
      this.frame = undefined;
      const progress = Math.max(0, Math.min(1, (time - transition.start) / transition.duration));
      this.apply(interpolatePose(transition.from, transition.to, progress));
      // Une interaction peut annuler ou remplacer la transition pendant apply().
      if (this.transition !== transition || this.disposed) return;
      if (progress < 1) this.frame = this.clock.request(step);
      else this.transition = undefined;
    };
    this.frame = this.clock.request(step);
  }

  cancel(): void {
    if (this.frame !== undefined) this.clock.cancel(this.frame);
    this.frame = undefined;
    this.transition = undefined;
  }

  dispose(): void {
    this.cancel();
    this.disposed = true;
  }
}

/** Cadrage du territoire complet avec une marge adaptée au format du viewport. */
export function cityOverviewPose(bounds: readonly number[], aspect: number): CameraPose {
  const [west, north, east, south] = bounds as [number, number, number, number];
  const width = east - west, depth = south - north;
  const halfFov = 21 * Math.PI / 180;
  const distance = Math.max(depth, width / Math.max(.1, aspect)) / (2 * Math.tan(halfFov)) * 1.3;
  return { target: new Vector3((west + east) / 2, 0, (north + south) / 2), distance, polar: .58, azimuth: 0 };
}
