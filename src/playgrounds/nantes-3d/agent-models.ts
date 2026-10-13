import { BoxGeometry, Color, CylinderGeometry, Float32BufferAttribute, InstancedBufferAttribute, MeshStandardMaterial, SphereGeometry, TorusGeometry, ShaderChunk } from 'three';
import type { BufferGeometry, IUniform } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Un seul lot par catégorie ; articulation des membres et roues dans le shader. */
export function agentModel(kind: 'pedestrian' | 'cyclist' | 'tram'): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const add = (geometry: BufferGeometry, color: string, pivot = [0, 0, 0], gain = 0, phase = 0, wheel = false): void => {
    const count = geometry.getAttribute('position').count, c = new Color(color);
    geometry.setAttribute('color', new Float32BufferAttribute(Array.from({ length: count }, () => [c.r, c.g, c.b]).flat(), 3));
    geometry.setAttribute('joint', new Float32BufferAttribute(Array.from({ length: count }, () => pivot).flat(), 3));
    geometry.setAttribute('motion', new Float32BufferAttribute(Array.from({ length: count }, () => [gain, phase, Number(wheel)]).flat(), 3)); parts.push(geometry);
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, pivot?: number[], gain?: number, phase?: number): void => add(new BoxGeometry(w, h, d).translate(x, y, z), color, pivot, gain, phase);
  if (kind === 'tram') {
    box(2.45, 1.6, 7.8, 0, 1.65, 0, '#e6ece7');
    box(2.48, .28, 7.82, 0, .82, 0, '#448b73');
    box(2.25, .22, 7.6, 0, 2.58, 0, '#bcc8c3');
    for (const side of [-1, 1]) {
      for (const z of [-2.65, -.9, .9, 2.65]) box(.035, .78, 1.3, side * 1.24, 1.94, z, '#405a60');
      for (const z of [-1.8, 1.8]) { box(.055, 1.7, .55, side * 1.245, 1.54, z, '#799f94'); box(.06, .65, .4, side * 1.28, 1.95, z, '#314b54'); }
    }
    for (const z of [-3.94, 3.94]) { box(1.85, .82, .04, 0, 1.95, z, '#354f58'); box(.9, .1, .05, 0, 1.16, z, '#fff1c4'); }
    for (const z of [-2.5, 2.5]) box(1.85, .36, 1.3, 0, .3, z, '#424748');
    box(1.95, 1.8, .35, 0, 1.53, 4.08, '#7c8582');
  } else {
    const bike = kind === 'cyclist', hip = bike ? 1 : .82, torso = bike ? 1.32 : 1.16;
    box(.42, .58, .25, 0, torso, bike ? .05 : 0, '#ffffff');
    add(new SphereGeometry(.15, 7, 5).translate(0, bike ? 1.79 : 1.63, bike ? .14 : 0), '#dbb191');
    add(new SphereGeometry(.154, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, bike ? 1.83 : 1.7, bike ? .14 : 0), bike ? '#eac265' : '#51453e');
    for (const side of [-1, 1]) {
      const phase = side === 1 ? Math.PI : 0;
      box(.13, .7, .15, side * .12, hip - .35, 0, '#40576b', [side * .12, hip, 0], bike ? .55 : .5, phase);
      box(.14, .12, .26, side * .12, hip - .73, .06, '#393d3a', [side * .12, hip, 0], bike ? .55 : .5, phase);
      box(.11, .53, .13, side * .27, torso - .12, bike ? .27 : 0, '#ffffff', [side * .27, torso + .12, bike ? .27 : 0], bike ? .06 : -.42, phase);
      add(new SphereGeometry(.065, 5, 4).translate(side * .27, torso - .42, bike ? .27 : 0), '#dbb191', [side * .27, torso + .12, bike ? .27 : 0], bike ? .06 : -.42, phase);
    }
    if (bike) {
      for (const z of [-.57, .57]) {
        const pivot = [0, .34, z];
        add(new TorusGeometry(.32, .025, 4, 12).rotateY(Math.PI / 2).translate(...pivot as [number, number, number]), '#303c3d', pivot, 1, 0, true);
        add(new BoxGeometry(.04, .57, .025).translate(0, .34, z), '#aebdb9', pivot, 1, 0, true);
        add(new BoxGeometry(.04, .025, .57).translate(0, .34, z), '#aebdb9', pivot, 1, 0, true);
      }
      const tube = (a: number[], b: number[]): void => {
        const dy = b[1]! - a[1]!, dz = b[2]! - a[2]!;
        add(new CylinderGeometry(.022, .022, Math.hypot(dy, dz), 5).rotateX(Math.atan2(dz, dy)).translate(0, (a[1]! + b[1]!) / 2, (a[2]! + b[2]!) / 2), '#588d7b');
      };
      for (const [a, b] of [[[0, .34, -.57], [0, .86, -.16]], [[0, .86, -.16], [0, .34, 0]], [[0, .34, 0], [0, .34, -.57]], [[0, .34, 0], [0, .8, .43]], [[0, .8, .43], [0, .86, -.16]], [[0, .8, .43], [0, .34, .57]]]) tube(a!, b!);
      box(.28, .06, .22, 0, .95, -.12, '#444c49');box(.55, .05, .07, 0, 1.02, .48, '#384a48');
    }
  }
  const geometry = mergeGeometries(parts)!;parts.forEach((p) => p.dispose());return geometry;
}
export function animatedAgentMaterial(geometry: BufferGeometry, capacity: number, time: IUniform<number>): MeshStandardMaterial {
  geometry.setAttribute('agentMotion', new InstancedBufferAttribute(new Float32Array(capacity * 2), 2));
  const material = new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .85 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.agentTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', ShaderChunk.color_vertex.replace('vColor.rgb *= instanceColor.rgb;', 'if (color.r > 0.99 && color.g > 0.99 && color.b > 0.99) vColor.rgb *= instanceColor.rgb;'));
    shader.vertexShader = 'uniform float agentTime; attribute vec3 joint; attribute vec3 motion; attribute vec2 agentMotion;\n' + shader.vertexShader;
    const rotate = 'float phase = agentTime * agentMotion.y + agentMotion.x; float turn = motion.z > 0.5 ? phase * 1.04 : sin(phase + motion.y) * motion.x; mat3 articulation = mat3(1.0,0.0,0.0,0.0,cos(turn),sin(turn),0.0,-sin(turn),cos(turn));';
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + rotate + '\nobjectNormal = articulation * objectNormal;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = articulation * (transformed - joint) + joint;');
  };
  material.customProgramCacheKey = () => 'nantes-agent-joints-v1';return material;
}
