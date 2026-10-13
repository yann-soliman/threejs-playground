import { createCity } from './city';
import type { CityModel, DetailLevel } from './city';
import { meshElevation, sampleElevation, terrainMesh, tileElevation } from './terrain';
import type { TerrainOverview } from './terrain';
import type { CityData } from './types';
import { spatialBatches } from './spatial';
import type { AtmosphereUniforms } from './atmosphere';
import type { GeometryPacket } from './geometry-wire';
export interface GeometryJob { id: number; data: CityData; lod: DetailLevel; overview: boolean }
export interface GeometryReply { id: number; packet?: GeometryPacket; error?: string }
export function prepareGeometry(data: CityData, lod: DetailLevel, overview: TerrainOverview, general = false, atmosphere?: AtmosphereUniforms): CityModel {
  const elevation = (x: number, z: number): number => sampleElevation(overview.grid, x, z);
  const model = createCity(data, { lod, ground: false, atmosphere, terrain: data.terrain, elevation,
    waterLevels: overview.waterLevels, bridgeLevels: overview.bridgeLevels,
    waterSurfaces: general ? overview.waterSurfaces : undefined, surfaceRings: general ? overview.surfaceRings : undefined,
    groundElevation: general ? meshElevation(overview.vertices, overview.indices, elevation) : undefined,
  });
  if (general) model.group.add(terrainMesh(overview.vertices, overview.indices, elevation));
  if (!general) spatialBatches(model.group, 250, 8000);
  return model;
}
export function surfaceSampler(data: CityData, lod: DetailLevel, overview: TerrainOverview): CityModel['surfaceElevation'] {
  return data.terrain ? meshElevation(data.terrain.vertices, data.terrain.indices[lod], (x, z) => tileElevation(data.terrain!, x, z)) : (x, z) => sampleElevation(overview.grid, x, z);
}
