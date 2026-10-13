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
export function windowMaterial(geometry: BufferGeometry, lights: number[], uniforms: AtmosphereUniforms, borders?: number[]): MeshStandardMaterial {
  geometry.setAttribute('windowGlow', new InstancedBufferAttribute(new Float32Array(lights), 3));
  if (borders) geometry.setAttribute('windowBorder', new InstancedBufferAttribute(new Float32Array(borders), 2));
  const frame = new Color('#f0e5ce');
  const material = new MeshStandardMaterial({ color: '#ffffff', roughness: .55 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.nightAmount = uniforms.night;
    shader.vertexShader = 'attribute vec3 windowGlow; varying vec3 glow;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nglow = windowGlow;');
    shader.fragmentShader = 'uniform float nightAmount; varying vec3 glow;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += glow * nightAmount' + (borders ? ' * windowPane;' : ';'));
    if (borders) {
      shader.vertexShader = 'attribute vec2 windowBorder; varying vec2 paneBorder; varying vec2 paneUv;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\npaneBorder = windowBorder; paneUv = uv;');
      shader.fragmentShader = 'varying vec2 paneBorder; varying vec2 paneUv;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\nfloat windowPane = step(paneBorder.x, paneUv.x) * step(paneBorder.y, paneUv.y) * step(paneUv.x, 1.0 - paneBorder.x) * step(paneUv.y, 1.0 - paneBorder.y);\ndiffuseColor.rgb = mix(vec3(${frame.r.toFixed(8)}, ${frame.g.toFixed(8)}, ${frame.b.toFixed(8)}), diffuseColor.rgb, windowPane);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.86, roughnessFactor, windowPane);');
    }
  };
  material.customProgramCacheKey = () => borders ? 'nantes-night-windows-v2' : 'nantes-night-windows-v1';
  return material;
}

export function waterMaterial(uniforms: AtmosphereUniforms): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: '#78aeb0', roughness: .28, metalness: .16 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterTime = uniforms.time;
    shader.uniforms.waterDay = uniforms.day;
    shader.uniforms.waterWarmth = uniforms.warmth;
    shader.vertexShader = 'varying vec2 waterPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nwaterPosition = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = 'uniform float waterTime; uniform float waterDay; uniform float waterWarmth; varying vec2 waterPosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
float flow = sin(dot(waterPosition, vec2(0.013, -0.017)) + waterTime * 0.12) * 0.7;
float waveA = dot(waterPosition, vec2(0.23, 0.11)) + waterTime * 1.35 + flow;
float waveB = dot(waterPosition, vec2(-0.15, 0.39)) - waterTime * 0.95;
float waveC = dot(waterPosition, vec2(0.08, -0.13)) + waterTime * 0.63;
float filterA = 1.0 - smoothstep(0.6, 2.0, fwidth(waveA));
float filterB = 1.0 - smoothstep(0.6, 2.0, fwidth(waveB));
float filterC = 1.0 - smoothstep(0.6, 2.0, fwidth(waveC));
float ripple = sin(waveA) * 0.55 * filterA + sin(waveB) * 0.3 * filterB + sin(waveC) * 0.15 * filterC;
float glint = pow(max(0.0, ripple), 4.0);
diffuseColor.rgb *= mix(0.60, 1.0, waterDay) * (0.91 + ripple * 0.12);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.64, 0.79, 0.77), glint * 0.17 * waterDay);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.24, 0.16), waterWarmth * waterDay * 0.18);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
vec3 rippleNormal = vec3(cos(waveA) * 0.12 * filterA + cos(waveB) * 0.06 * filterB, 0.0, cos(waveB) * 0.11 * filterB + cos(waveC) * 0.045 * filterC);
normal = normalize(normal + mat3(viewMatrix) * rippleNormal);`);
  };
  material.customProgramCacheKey = () => 'nantes-water-v2';
  return material;
}
