import { buildingBody, buildingFoundation, buildingRoof, buildingStyle } from '../src/playgrounds/nantes-3d/buildings';
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, Mesh, MeshStandardMaterial, PerspectiveCamera, Frustum, Matrix4 } from 'three';
import { spatialBatches } from '../src/playgrounds/nantes-3d/spatial';
import { packGeometry, unpackGeometry } from '../src/playgrounds/nantes-3d/geometry-wire';
import { atmosphereUniforms, waterMaterial, windowMaterial } from '../src/playgrounds/nantes-3d/atmosphere';
import { GeometryBuilder } from '../src/playgrounds/nantes-3d/geometry-client';
import type { GeometryPort } from '../src/playgrounds/nantes-3d/geometry-client';
import { PerformanceLog } from '../src/playgrounds/nantes-3d/performance';
import { meshElevation } from '../src/playgrounds/nantes-3d/terrain';
import type { TerrainOverview } from '../src/playgrounds/nantes-3d/terrain';
import type { CityData } from '../src/playgrounds/nantes-3d/types';
import city from '../src/playgrounds/nantes-3d/data/city.json';
const terrain: TerrainOverview = { vertices: [], indices: [], grid: { origin: [0, 0], width: 2, depth: 2, heights: [0, 0, 0, 0], step: 500 }, bridgeLevels: {}, waterLevels: {} };
const data: CityData = { ...(city as unknown as CityData), buildings: [], roads: [], trees: [], surfaces: [], walls: [] };
function model(group: Group) { return { group, surfaceElevation: () => 0, windows: 0, estimatedHeights: 0, dispose: () => {} }; }
function port(): GeometryPort { return { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null }; }
function emptyPacket() { return packGeometry(model(new Group()), 20).packet; }
describe('Lots géographiques et buffers transférables', () => {
  it('conserve tous les triangles, les attributs et les faces franchissant les cases', () => {
    const group = new Group(), geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 140, 0, 0, 0, 1, 10, 600, 0, 0, 610, 0, 0, 600, 1, 10], 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(Array(18).fill(.5), 3));geometry.setIndex([0, 1, 2, 3, 4, 5]);
    const mesh = new Mesh(geometry, new MeshStandardMaterial()); mesh.castShadow = true;group.add(mesh);spatialBatches(group, 125);
    expect(group.children.length).toBe(2);const vertices: number[] = [];
    for (const child of group.children) { const part = child as Mesh; expect(part.castShadow).toBe(true); expect(part.geometry.getAttribute('normal').array.every((n) => n === .5)).toBe(true); for (const n of part.geometry.index!.array) vertices.push(part.geometry.getAttribute('position').getX(n)); }
    expect(vertices).toEqual([0, 140, 0, 600, 610, 600]);group.children.forEach((child) => (child as Mesh).geometry.dispose());mesh.material.dispose();
  });
  it('conserve matrices, couleurs et illumination des instances tout en permettant leur culling', () => {
    const group = new Group(), geometry = new BoxGeometry();geometry.setAttribute('windowGlow', new InstancedBufferAttribute(new Float32Array([1, 2, 3, 4, 5, 6]), 3));
    const mesh = new InstancedMesh(geometry, new MeshStandardMaterial(), 2);mesh.instanceMatrix.array[12] = 10;mesh.instanceMatrix.array[28] = 600;mesh.instanceColor = new InstancedBufferAttribute(new Float32Array([.1, .2, .3, .4, .5, .6]), 3);group.add(mesh);spatialBatches(group, 125);
    const camera = new PerspectiveCamera(40, 1, .1, 100);camera.position.set(10, 0, 10);camera.lookAt(10, 0, 0);camera.updateMatrixWorld();
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    expect(frustum.intersectsObject(group.children[0]!)).toBe(true);expect(frustum.intersectsObject(group.children[1]!)).toBe(false);
    const packet = packGeometry(model(group), 10);expect(packet.transfer.length).toBe(new Set(packet.transfer).size);
    const clone = structuredClone(packet.packet, { transfer: packet.transfer });expect(packet.transfer.every((b) => b.byteLength === 0)).toBe(true);
    const restored = unpackGeometry(clone, () => 3);const instances = restored.group.children as InstancedMesh[];
    expect(instances.map((m) => m.instanceMatrix.array[12])).toEqual([10, 600]);expect(Array.from(instances[1]!.geometry.getAttribute('windowGlow').array)).toEqual([4, 5, 6]);expect(instances[1]!.instanceColor!.array[0]).toBeCloseTo(.4);expect(restored.surfaceElevation(0, 0)).toBe(3);
    const dispose = vi.spyOn(instances[0]!.geometry, 'dispose');restored.dispose();restored.dispose();expect(dispose).toHaveBeenCalledOnce();
  });
  it('rétablit les shaders eau/fenêtres avec les uniformes vivants de la scène', () => {
    const group = new Group(), atmosphere = atmosphereUniforms(), plane = new BoxGeometry();
    group.add(new Mesh(plane, waterMaterial(atmosphere)));const window = new BoxGeometry();group.add(new Mesh(window, windowMaterial(window, [1, .5, .2], atmosphere)));
    const restored = unpackGeometry(packGeometry(model(group), 0).packet, () => 0, atmosphere);
    const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>\n#include <worldpos_vertex>', fragmentShader: '#include <color_fragment>\n#include <emissivemap_fragment>\n#include <normal_fragment_maps>' } as unknown as Parameters<MeshStandardMaterial['onBeforeCompile']>[0];
    const water = (restored.group.children[0] as Mesh).material as MeshStandardMaterial;water.onBeforeCompile(shader, undefined as never);expect(shader.uniforms.waterTime).toBe(atmosphere.time);
    const glass = (restored.group.children[1] as Mesh).material as MeshStandardMaterial;glass.onBeforeCompile(shader, undefined as never);expect(shader.uniforms.nightAmount).toBe(atmosphere.night);expect(shader.vertexShader).toContain('windowGlow');restored.dispose();
  });
});
describe('Worker borné, annulations et repli', () => {
  it('n’envoie qu’un travail à la fois et ignore les réponses obsolètes', async () => {
    const fake = port(), builder = new GeometryBuilder(terrain, atmosphereUniforms(), new PerformanceLog(false), () => fake), controller = new AbortController();
    const first = builder.prepare(data, 'near', controller.signal);const aborted = expect(first).rejects.toMatchObject({ name: 'AbortError' });controller.abort();const next = builder.prepare(data, 'near', new AbortController().signal);
    expect(fake.postMessage).toHaveBeenCalledTimes(2);fake.onmessage!({ data: { id: 0, packet: emptyPacket() } } as MessageEvent);await aborted;expect(fake.postMessage).toHaveBeenCalledTimes(3);
    fake.onmessage!({ data: { id: 0, packet: emptyPacket() } } as MessageEvent);fake.onmessage!({ data: { id: 1, packet: emptyPacket() } } as MessageEvent);(await next).dispose();builder.dispose();expect(fake.terminate).toHaveBeenCalledOnce();
  });
  it('annule les travaux en attente et termine le worker au démontage', async () => {
    const fake = port(), builder = new GeometryBuilder(terrain, atmosphereUniforms(), new PerformanceLog(false), () => fake);
    const a = builder.prepare(data, 'near', new AbortController().signal), b = builder.prepare(data, 'medium', new AbortController().signal);
    const checks = Promise.all([expect(a).rejects.toMatchObject({ name: 'AbortError' }), expect(b).rejects.toMatchObject({ name: 'AbortError' })]);builder.dispose();await checks;expect(fake.terminate).toHaveBeenCalledOnce();
  });
  it('produit une géométrie fonctionnelle lorsque le worker est indisponible ou échoue', async () => {
    const atmosphere = atmosphereUniforms();for (const unavailable of [true, false]) {
      const fake = port(), builder = new GeometryBuilder(terrain, atmosphere, new PerformanceLog(false), () => { if (unavailable) throw new Error('Indisponible');return fake; });
      const result = builder.prepare(data, 'near', new AbortController().signal);if (!unavailable) fake.onerror!({ preventDefault: () => {} } as ErrorEvent);
      const resource = await result;expect(resource.group).toBeInstanceOf(Group);resource.dispose();builder.dispose();
    }
  });
});
it('préserve les altitudes barycentriques, y compris les coordonnées éloignées et le fallback', () => {
  const sample = meshElevation([10000, 10, -5000, 10020, 20, -5000, 10000, 30, -4980], [0, 1, 2], () => -1);
  for (let x = 0; x <= 18; x += 2) for (let z = 0; z <= 18 - x; z += 2) expect(sample(10000 + x, -5000 + z)).toBeCloseTo(10 + x / 2 + z, 7);
  expect(sample(11000, -5000)).toBe(-1);
});

it('supprime uniquement les caps masqués et garde les dessous suspendus et les contours concaves', () => {
  const feature = { id: 'test', rings: [[[0, 0], [20, 0], [20, 20], [10, 10], [0, 20]]] as [number, number][][], tags: { building: 'house', height: '12', 'roof:shape': 'flat' } };
  const style = buildingStyle(feature), closed = buildingBody(feature, style), visible = buildingBody(feature, style, true);
  closed.computeBoundingBox();visible.computeBoundingBox();expect(visible.boundingBox).toEqual(closed.boundingBox);expect(visible.getAttribute('position').count).toBeLessThan(closed.getAttribute('position').count);
  const foundation = buildingFoundation(feature, -1, 1, style.facade, true);expect(Array.from(foundation.getAttribute('normal').array).every((n, i) => i % 3 !== 1 || Math.abs(n) < 1e-6)).toBe(true);
  const suspended = buildingBody(feature, { ...style, base: 3 }, true);expect(Array.from(suspended.getAttribute('normal').array).some((n, i) => i % 3 === 1 && n === -1)).toBe(true);
  const roof = buildingRoof(feature, style);expect(roof.getAttribute('position').count).toBe(9);
  for (const geometry of [closed, visible, foundation, suspended, roof]) geometry.dispose();
});
it('préserve le cadre, la rugosité et la lumière des fenêtres sur un seul plan', () => {
  const atmosphere = atmosphereUniforms(), geometry = new BoxGeometry(), material = windowMaterial(geometry, [1, .5, .2], atmosphere, [.1, .08]);
  expect(Array.from(geometry.getAttribute('windowBorder').array)).toEqual([expect.closeTo(.1), expect.closeTo(.08)]);
  const group = new Group();group.add(new Mesh(geometry, material));const restored = unpackGeometry(packGeometry(model(group), 0).packet, () => 0, atmosphere);
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>' } as unknown as Parameters<MeshStandardMaterial['onBeforeCompile']>[0];
  ((restored.group.children[0] as Mesh).material as MeshStandardMaterial).onBeforeCompile(shader, undefined as never);
  expect(shader.vertexShader).toContain('windowBorder');expect(shader.fragmentShader).toContain('roughnessFactor = mix(0.86');expect(shader.fragmentShader).toContain('glow * nightAmount * windowPane');expect(shader.uniforms.nightAmount).toBe(atmosphere.night);restored.dispose();geometry.dispose();material.dispose();
});
