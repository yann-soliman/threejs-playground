import { DataTexture, NearestFilter, RedFormat, Mesh, MeshStandardMaterial, ShapeGeometry, Group, BufferGeometry, Float32BufferAttribute, LineLoop, LineBasicMaterial } from 'three';
import { footprintShape } from './buildings';
import type { AtmosphereUniforms } from './atmosphere';
import { createCity } from './city';
import type { CityData } from './types';
import type { CityManifest, TileEntry } from './tiles';

/** Masque commun des tuiles remplacées : la vue générale ne double pas leurs objets. */
export function createOverview(data: CityData, manifest: CityManifest, atmosphere?: AtmosphereUniforms): {
  group: Group; setTile: (tile: TileEntry, active: boolean) => void; dispose: () => void;
} {
  const model = createCity(data, { lod: 'far', ground: false, atmosphere });
  const minX = Math.floor(manifest.bounds[0]! / manifest.tileSize);
  const minZ = Math.floor(manifest.bounds[1]! / manifest.tileSize);
  const width = Math.ceil(manifest.bounds[2]! / manifest.tileSize) - minX;
  const depth = Math.ceil(manifest.bounds[3]! / manifest.tileSize) - minZ;
  const pixels = new Uint8Array(width * depth);
  const mask = new DataTexture(pixels, width, depth, RedFormat);
  mask.magFilter = NearestFilter; mask.minFilter = NearestFilter; mask.needsUpdate = true;
  model.group.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = false;
    const material = object.material as MeshStandardMaterial;
    const compile = material.onBeforeCompile;
    const programKey = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      shader.uniforms.tileMask = { value: mask };
      shader.vertexShader = 'varying vec2 mapPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nmapPosition = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = 'uniform sampler2D tileMask;\nvarying vec2 mapPosition;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\nvec2 tileUv = (mapPosition / ${manifest.tileSize.toFixed(1)} - vec2(${minX.toFixed(1)}, ${minZ.toFixed(1)})) / vec2(${width.toFixed(1)}, ${depth.toFixed(1)});\nif (texture2D(tileMask, tileUv).r > 0.5) discard;`);
    };
    material.customProgramCacheKey = () => `${programKey}-nantes-overview-mask`;
  });
  const group = new Group();
  const groundMaterial = new MeshStandardMaterial({ color: '#d4d2c4', roughness: 1 });
  const grounds = manifest.boundary.map((rings) => {
    const geometry = new ShapeGeometry(footprintShape(rings)); geometry.rotateX(-Math.PI / 2);
    const ground = new Mesh(geometry, groundMaterial); ground.receiveShadow = true; group.add(ground); return geometry;
  });
  const outlineMaterial = new LineBasicMaterial({ color: '#9ca892' });
  const outlines = manifest.boundary.flatMap((rings) => rings.map((ring) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(ring.flatMap(([x, z]) => [x, .025, z]), 3));
    group.add(new LineLoop(geometry, outlineMaterial)); return geometry;
  }));
  group.add(model.group);
  return { group,
    setTile: (tile, active) => { pixels[(tile.z - minZ) * width + tile.x - minX] = active ? 255 : 0; mask.needsUpdate = true; },
    dispose: () => { model.dispose(); grounds.forEach((g) => g.dispose()); groundMaterial.dispose(); outlines.forEach((g) => g.dispose()); outlineMaterial.dispose(); mask.dispose(); group.clear(); },
  };
}
