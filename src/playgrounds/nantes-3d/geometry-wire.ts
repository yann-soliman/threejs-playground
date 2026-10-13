import { Box3, BufferAttribute, BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, MaterialLoader, Mesh, Sphere, Vector3 } from 'three';
import type { MaterialJSON, MeshStandardMaterial, TypedArray } from 'three';
import type { CityModel } from './city';
import { atmosphereUniforms, waterMaterial, windowMaterial } from './atmosphere';
import type { AtmosphereUniforms } from './atmosphere';
export interface WireAttribute { array: TypedArray; itemSize: number; normalized: boolean; instanced: boolean }
interface WireGeometry { attributes: Record<string, WireAttribute>; index?: WireAttribute; sphere?: number[]; box?: number[] }
interface WireMesh { geometry: number; material: number; matrix?: Float32Array; color?: Float32Array; count?: number; cast: boolean; receive: boolean; sphere?: number[] }
interface WireMaterial { kind: 'standard' | 'water' | 'windows'; json: MaterialJSON; framed?: boolean }
export interface GeometryPacket { geometries: WireGeometry[]; materials: WireMaterial[]; meshes: WireMesh[]; windows: number; estimatedHeights: number; cpuMs: number }
function sphereValues(sphere: Sphere | null): number[] | undefined { return sphere ? [...sphere.center.toArray(), sphere.radius] : undefined; }
export function packGeometry(model: CityModel, cpuMs: number): { packet: GeometryPacket; transfer: ArrayBuffer[] } {
  const geometries = new Map<BufferGeometry, number>(), materials = new Map<MeshStandardMaterial, number>(), buffers = new Set<ArrayBuffer>();
  const packet: GeometryPacket = { geometries: [], materials: [], meshes: [], windows: model.windows, estimatedHeights: model.estimatedHeights, cpuMs };
  const attribute = (a: BufferAttribute): WireAttribute => { buffers.add(a.array.buffer as ArrayBuffer); return { array: a.array, itemSize: a.itemSize, normalized: a.normalized, instanced: a instanceof InstancedBufferAttribute }; };
  model.group.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const geometry = object.geometry, material = object.material as MeshStandardMaterial;
    if (!geometries.has(geometry)) {
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      geometries.set(geometry, packet.geometries.length);
      packet.geometries.push({ attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([name, a]) => [name, attribute(a as BufferAttribute)])), index: geometry.index ? attribute(geometry.index) : undefined, sphere: sphereValues(geometry.boundingSphere), box: geometry.boundingBox ? [...geometry.boundingBox.min.toArray(), ...geometry.boundingBox.max.toArray()] : undefined });
    }
    if (!materials.has(material)) {
      materials.set(material, packet.materials.length); const key = material.customProgramCacheKey();
      packet.materials.push({ kind: key === 'nantes-water-v2' ? 'water' : key.startsWith('nantes-night-windows-v') ? 'windows' : 'standard', json: material.toJSON(), framed: key === 'nantes-night-windows-v2' });
    }
    const mesh: WireMesh = { geometry: geometries.get(geometry)!, material: materials.get(material)!, cast: object.castShadow, receive: object.receiveShadow };
    if (object instanceof InstancedMesh) {
      const matrix = object.instanceMatrix.array as Float32Array; mesh.matrix = matrix; buffers.add(matrix.buffer as ArrayBuffer); mesh.count = object.count; mesh.sphere = sphereValues(object.boundingSphere);
      if (object.instanceColor) { const color = object.instanceColor.array as Float32Array; mesh.color = color; buffers.add(color.buffer as ArrayBuffer); }
    }
    packet.meshes.push(mesh);
  });
  return { packet, transfer: [...buffers] };
}
export function unpackGeometry(packet: GeometryPacket, surfaceElevation: CityModel['surfaceElevation'], atmosphere: AtmosphereUniforms = atmosphereUniforms()): CityModel {
  const restoreSphere = (values: number[]): Sphere => new Sphere(new Vector3(values[0], values[1], values[2]), values[3]);
  const geometries = packet.geometries.map((wire) => {
    const geometry = new BufferGeometry();
    for (const [name, a] of Object.entries(wire.attributes)) geometry.setAttribute(name, a.instanced ? new InstancedBufferAttribute(a.array, a.itemSize, a.normalized) : new BufferAttribute(a.array, a.itemSize, a.normalized));
    if (wire.index) geometry.setIndex(new BufferAttribute(wire.index.array, wire.index.itemSize, wire.index.normalized));
    if (wire.sphere) geometry.boundingSphere = restoreSphere(wire.sphere);
    if (wire.box) geometry.boundingBox = new Box3(new Vector3(...wire.box.slice(0, 3)), new Vector3(...wire.box.slice(3)));
    return geometry;
  });
  const loader = new MaterialLoader();
  const materials = packet.materials.map((wire) => {
    const standard = loader.parse(wire.json) as MeshStandardMaterial;
    if (wire.kind === 'standard') return standard;
    const scratch = new BufferGeometry();
    const material = wire.kind === 'water' ? waterMaterial(atmosphere) : windowMaterial(scratch, [], atmosphere, wire.framed ? [] : undefined); scratch.dispose();
    material.copy(standard); standard.dispose(); return material;
  });
  const group = new Group();
  for (const wire of packet.meshes) {
    const geometry = geometries[wire.geometry]!, material = materials[wire.material]!;
    const mesh = wire.matrix ? new InstancedMesh(geometry, material, wire.count!) : new Mesh(geometry, material);
    if (mesh instanceof InstancedMesh) {
      mesh.instanceMatrix = new InstancedBufferAttribute(wire.matrix!, 16);
      if (wire.color) mesh.instanceColor = new InstancedBufferAttribute(wire.color, 3);
      if (wire.sphere) mesh.boundingSphere = restoreSphere(wire.sphere);
    }
    mesh.castShadow = wire.cast; mesh.receiveShadow = wire.receive; group.add(mesh);
  }
  let disposed = false;
  return { group, surfaceElevation, windows: packet.windows, estimatedHeights: packet.estimatedHeights, dispose: () => {
    if (disposed) return; disposed = true;
    group.traverse((object) => { if (object instanceof InstancedMesh) object.dispose(); });
    geometries.forEach((geometry) => geometry.dispose()); materials.forEach((material) => material.dispose()); group.clear();
  } };
}
