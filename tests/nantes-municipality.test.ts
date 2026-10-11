/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildingBody, buildingRoof, buildingStyle } from '../src/playgrounds/nantes-3d/buildings';
import { pointsOfInterest, projectCoordinates, selectPointOfInterest } from '../src/playgrounds/nantes-3d/pois';
import { cityOverviewPose } from '../src/playgrounds/nantes-3d/navigation';
import type { CityManifest } from '../src/playgrounds/nantes-3d/tiles';
import type { CityData } from '../src/playgrounds/nantes-3d/types';

const root = new URL('../public/nantes/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')) as CityManifest;
const load = (url: string): CityData => JSON.parse(readFileSync(new URL(url, root), 'utf8')) as CityData;

describe('Assets municipaux déployables', () => {
  it('produit des corps et toits finis sur toutes les empreintes de Nantes', () => {
    let count = 0;
    for (const tile of manifest.tiles) {
      for (const feature of load(tile.urls.near).buildings) {
        const style = buildingStyle(feature);
        for (const geometry of [buildingBody(feature, style), buildingRoof(feature, style)]) {
          for (const key of ['position', 'normal']) {
            const values = geometry.getAttribute(key);
            if (!values.count || !Array.from(values.array).every(Number.isFinite)) throw new Error(`Géométrie invalide : ${feature.id}/${key}`);
          }
          geometry.dispose();
        }
        count++;
      }
    }
    expect(count).toBe(manifest.counts.buildings);
  }, 120000);
  it('garde les lieux V2 et permet les destinations éloignées avec la même projection', () => {
    const pose = cityOverviewPose(manifest.bounds, 1.5);
    for (const poi of pointsOfInterest) {
      const selection = selectPointOfInterest(poi.id, manifest.meta, pose, 1.5)!;
      expect(selection).toBeDefined();
      expect(selection.pose.target).toEqual(projectCoordinates(poi.coordinates, manifest.meta.origin));
      expect(selection.pose.azimuth).toBe(pose.azimuth);
      expect(selection.pose.polar).toBe(pose.polar);
    }
    const nord = selectPointOfInterest('nord', manifest.meta, pose, 1.5)!;
    const castle = selectPointOfInterest('castle', manifest.meta, pose, 1.5)!;
    expect(nord.pose.target.distanceTo(castle.pose.target)).toBeGreaterThan(3000);
  });
});
