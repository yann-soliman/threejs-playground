import { Color, InstancedBufferAttribute, MeshStandardMaterial } from 'three';
import type { BufferGeometry } from 'three';
import { seedOf } from './buildings';

export interface AtmosphereUniforms {
  time: { value: number };
  night: { value: number };
  day: { value: number };
  warmth: { value: number };
}
export function atmosphereUniforms(): AtmosphereUniforms {
  return { time: { value: 0 }, night: { value: 0 }, day: { value: 1 }, warmth: { value: 0 } };
}
export function windowIllumination(id: string): [number, number, number] {
  const seed = seedOf(id);
  if (seed % 100 >= 21) return [0, 0, 0];
  const color = new Color(['#ffc878', '#ffe1a3', '#ffb967'][seed % 3]!);
  return [color.r * 1.5, color.g * 1.5, color.b * 1.5];
}
export function windowMaterial(geometry: BufferGeometry, lights: number[], uniforms: AtmosphereUniforms): MeshStandardMaterial {
  geometry.setAttribute('windowGlow', new InstancedBufferAttribute(new Float32Array(lights), 3));
  const material = new MeshStandardMaterial({ color: '#ffffff', roughness: .55 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.nightAmount = uniforms.night;
    shader.vertexShader = 'attribute vec3 windowGlow; varying vec3 glow;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nglow = windowGlow;');
    shader.fragmentShader = 'uniform float nightAmount; varying vec3 glow;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += glow * nightAmount;');
  };
  material.customProgramCacheKey = () => 'nantes-night-windows-v1';
  return material;
}

export function waterMaterial(uniforms: AtmosphereUniforms): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: '#78aeb0', roughness: .38, metalness: .12 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterTime = uniforms.time;
    shader.uniforms.waterDay = uniforms.day;
    shader.uniforms.waterWarmth = uniforms.warmth;
    shader.vertexShader = 'varying vec2 waterPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nwaterPosition = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = 'uniform float waterTime; uniform float waterDay; uniform float waterWarmth; varying vec2 waterPosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
float ripple = sin(dot(waterPosition, vec2(0.19, 0.12)) + waterTime * 0.75) * sin(dot(waterPosition, vec2(-0.08, 0.23)) - waterTime * 0.5);
diffuseColor.rgb *= mix(0.60, 1.0, waterDay) * (0.96 + ripple * 0.04);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.24, 0.16), waterWarmth * waterDay * 0.18);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
vec3 rippleNormal = vec3(cos(dot(waterPosition, vec2(0.19, 0.12)) + waterTime * 0.75) * 0.06, 0.0, sin(dot(waterPosition, vec2(-0.08, 0.23)) - waterTime * 0.5) * 0.06);
normal = normalize(normal + mat3(viewMatrix) * rippleNormal);`);
  };
  material.customProgramCacheKey = () => 'nantes-water-v1';
  return material;
}
