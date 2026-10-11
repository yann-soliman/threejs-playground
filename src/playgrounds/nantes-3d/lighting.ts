import { Color, Vector3 } from 'three';
import type { DirectionalLight, Fog, HemisphereLight, Scene, WebGLRenderer } from 'three';
import type { AtmosphereUniforms } from './atmosphere';
import { daylight, solarDirection, solarPosition } from './solar';

export class SolarLighting {
  private readonly direction = new Vector3();
  private readonly shadowDirection = new Vector3();
  private readonly shadowCenter = new Vector3(Infinity, 0, Infinity);
  private lastShadow = -Infinity;
  private dirty = true;
  private elevation = 0;
  private readonly nightSky = new Color('#101c35');
  private readonly daySky = new Color('#e7ece5');
  private readonly sunsetSky = new Color('#dbc1ae');
  private readonly nightAmbient = new Color('#90abc9');
  private readonly nightGround = new Color('#526278');
  private readonly dayGround = new Color('#919987');
  private readonly dayAmbient = new Color('#fff8e7');
  private readonly warmSun = new Color('#ffb36c');
  private readonly daySun = new Color('#fff1d5');

  constructor(private readonly scene: Scene, private readonly renderer: WebGLRenderer,
    private readonly sun: DirectionalLight, private readonly ambient: HemisphereLight,
    private readonly uniforms: AtmosphereUniforms) {}
  select(instant: Date, forceShadow = false): void {
    const position = solarPosition(instant);
    this.elevation = position.elevation;
    this.direction.set(...solarDirection(position.azimuth, position.elevation));
    const { day, sunlight, night, warmth } = daylight(position.elevation);
    this.uniforms.day.value = day; this.uniforms.night.value = night; this.uniforms.warmth.value = warmth;
    this.sun.intensity = sunlight;
    this.sun.color.copy(this.daySun).lerp(this.warmSun, warmth);
    this.ambient.intensity = .6 + day * 1.9;
    this.ambient.color.copy(this.nightAmbient).lerp(this.dayAmbient, day);
    this.ambient.groundColor.copy(this.nightGround).lerp(this.dayGround, day);
    const sky = this.scene.background as Color;
    sky.copy(this.nightSky).lerp(this.daySky, day).lerp(this.sunsetSky, day * warmth * .23);
    (this.scene.fog as Fog).color.copy(sky);
    this.renderer.toneMappingExposure = 1 + day * .15;
    if (forceShadow) this.dirty = true;
  }
  invalidateShadows(): void { this.dirty = true; }
  prepare(target: Vector3, distance: number, time: number): void {
    // Frustum local orienté selon le soleil ; aucune caméra d’ombre municipale.
    const shadows = distance < 2400 && this.elevation > .5 * Math.PI / 180;
    if (this.sun.castShadow !== shadows) { this.sun.castShadow = shadows; this.dirty = true; }
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.direction, 4000);
    const moved = target.distanceTo(this.shadowCenter) > 140;
    const rotated = this.direction.dot(this.shadowDirection) < Math.cos(.5 * Math.PI / 180);
    if (shadows && (this.dirty || moved || (rotated && time - this.lastShadow >= 500))) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowDirection.copy(this.direction); this.shadowCenter.copy(target);
      this.lastShadow = time; this.dirty = false;
    }
  }
}
