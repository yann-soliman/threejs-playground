import { BufferAttribute, BufferGeometry, InstancedBufferAttribute, InstancedMesh, Mesh } from 'three';
import type { Group } from 'three';

/** Lots géographiques, sans suppression ni approximation des triangles/détails. */
export function spatialBatches(group: Group, size: number, minimumTriangles = 0): void {
  for (const object of [...group.children]) {
    if (!(object instanceof Mesh)) continue;
    const geometry = object.geometry, position = geometry.getAttribute('position');
    if (!position?.count) continue;
    if ((geometry.index?.count ?? position.count) / 3 * (object instanceof InstancedMesh ? object.count : 1) < minimumTriangles) continue;
    const bins = new Map<string, number[]>();
    const bucket = (x: number, z: number, index: number): void => {
      const key = `${Math.floor(x / size)}_${Math.floor(z / size)}`, entries = bins.get(key) ?? []; entries.push(index); bins.set(key, entries);
    };
    if (object instanceof InstancedMesh) {
      for (let i = 0; i < object.count; i++) bucket(object.instanceMatrix.array[i * 16 + 12]!, object.instanceMatrix.array[i * 16 + 14]!, i);
    } else {
      const index = geometry.index, count = index?.count ?? position.count;
      for (let i = 0; i < count; i += 3) {
        const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
        bucket((position.getX(a) + position.getX(b) + position.getX(c)) / 3, (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3, i);
      }
    }
    if (bins.size < 2) continue;
    group.remove(object);
    for (const entries of bins.values()) {
      const part = new BufferGeometry();
      const unique: number[] = [], remap = new Map<number, number>(), indices: number[] = [];
      if (!(object instanceof InstancedMesh) && geometry.index) {
        for (const triangle of entries) for (let corner = 0; corner < 3; corner++) {
          const source = geometry.index.getX(triangle + corner);
          if (!remap.has(source)) { remap.set(source, unique.length); unique.push(source); }
          indices.push(remap.get(source)!);
        }
        part.setIndex(indices);
      }
      for (const [name, attribute] of Object.entries(geometry.attributes) as [string, BufferAttribute][]) {
        if (attribute instanceof InstancedBufferAttribute) {
          const array = new Float32Array(entries.length * attribute.itemSize);
          entries.forEach((index, i) => { for (let k = 0; k < attribute.itemSize; k++) array[i * attribute.itemSize + k] = attribute.array[index * attribute.itemSize + k]!; });
          part.setAttribute(name, new InstancedBufferAttribute(array, attribute.itemSize, attribute.normalized));
        } else if (object instanceof InstancedMesh) {
          // Petit modèle de fenêtre/arbre réutilisé ; aucun grand buffer dupliqué.
          part.setAttribute(name, attribute);
        } else {
          if (geometry.index) {
            const array = new Float32Array(unique.length * attribute.itemSize);
            unique.forEach((index, i) => { for (let k = 0; k < attribute.itemSize; k++) array[i * attribute.itemSize + k] = attribute.array[index * attribute.itemSize + k]!; });
            part.setAttribute(name, new BufferAttribute(array, attribute.itemSize, attribute.normalized)); continue;
          }
          const array = new Float32Array(entries.length * 3 * attribute.itemSize);
          entries.forEach((triangle, i) => { for (let corner = 0; corner < 3; corner++) {
            const index = geometry.index ? geometry.index.getX(triangle + corner) : triangle + corner;
            for (let k = 0; k < attribute.itemSize; k++) array[(i * 3 + corner) * attribute.itemSize + k] = attribute.array[index * attribute.itemSize + k]!;
          } });
          part.setAttribute(name, new BufferAttribute(array, attribute.itemSize, attribute.normalized));
        }
      }
      let mesh: Mesh;
      if (object instanceof InstancedMesh) {
        part.setIndex(geometry.index);
        const instances = new InstancedMesh(part, object.material, entries.length);
        entries.forEach((index, i) => {
          instances.instanceMatrix.array.set(object.instanceMatrix.array.subarray(index * 16, index * 16 + 16), i * 16);
          if (object.instanceColor) {
            instances.instanceColor ??= new InstancedBufferAttribute(new Float32Array(entries.length * 3), 3);
            instances.instanceColor.array.set(object.instanceColor.array.subarray(index * 3, index * 3 + 3), i * 3);
          }
        });
        instances.computeBoundingSphere(); mesh = instances;
      } else { part.computeBoundingSphere(); mesh = new Mesh(part, object.material); }
      mesh.castShadow = object.castShadow; mesh.receiveShadow = object.receiveShadow; group.add(mesh);
    }
    if (object instanceof InstancedMesh) object.dispose();
    geometry.dispose();
  }
}
