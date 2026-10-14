import { landmarks } from './landmarks/registry';
import { Vector3 } from 'three';
import type { CameraPose } from './navigation';
import type { CityData, Point } from './types';

export interface PointOfInterest {
  id: string;
  name: string;
  coordinates: Point; // Latitude, longitude WGS84 ; ancrage dans le lieu nommé.
  source: string;
  distance: number; // Cadrage en mètres ; estimation visuelle, pas une propriété OSM.
  azimuth?: number;
  polar?: number;
  targetHeight?: number;
  markerHeight: number; // Au-dessus du volume procédural, sans mesure d'altitude réelle.
}

// Monuments : snapshot V2 ; parcs et Commerce : géométries municipales V3.
// Île et Chantenay : points de cadrage géographiques, sans mesure architecturale.
// Le Grand Logis représente le château ; la place représente le quartier Bouffay.
export const pointsOfInterest: readonly PointOfInterest[] = [
  ...landmarks.map((m) => ({ id: m.id, name: m.name, coordinates: m.coordinates, source: m.source, distance: m.distance, markerHeight: m.height + 4 })),
  { id: 'centre', name: 'Centre-ville · Commerce', coordinates: [47.21334549, -1.55785167], source: 'relation/4764728', distance: 1050, markerHeight: 5 },
  { id: 'ile', name: 'Île de Nantes · Parc des Chantiers', coordinates: [47.2053, -1.5642], source: 'https://www.openstreetmap.org/#map=18/47.2053/-1.5642', distance: 1300, markerHeight: 5 },
  { id: 'chantenay', name: 'Chantenay · Butte Sainte-Anne', coordinates: [47.20282, -1.57778], source: 'https://www.openstreetmap.org/#map=18/47.20282/-1.57778', distance: 1050, markerHeight: 10 },
  { id: 'doulon', name: 'Doulon · Parc du Grand-Blottereau', coordinates: [47.22761973, -1.50835957], source: 'way/27532467', distance: 1300, markerHeight: 5 },
  { id: 'nord', name: 'Nantes Nord · Parc de l’Amande', coordinates: [47.2629815, -1.57511275], source: 'way/399064135', distance: 1300, markerHeight: 5 },

  { id: 'bouffay', name: 'Quartier du Bouffay', coordinates: [47.21477925, -1.5532396], source: 'way/160751210', distance: 300, markerHeight: 4 },

  { id: 'sainte-croix', name: 'Église Sainte-Croix', coordinates: [47.21536645, -1.55395435], source: 'way/28810231', distance: 260, markerHeight: 28 },
];

export function projectCoordinates(coordinates: Point, origin: Point): Vector3 {
  const scale = 6371008.8 * Math.PI / 180;
  return new Vector3(
    (coordinates[1] - origin[1]) * scale * Math.cos(origin[0] * Math.PI / 180),
    0,
    -(coordinates[0] - origin[0]) * scale,
  );
}

export function osmLocation(poi: PointOfInterest): string {
  const [latitude, longitude] = poi.coordinates;
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`;
}

export function poiPose(poi: PointOfInterest, origin: Point, current: CameraPose, aspect: number): CameraPose {
  return {
    ...current,
    azimuth: poi.azimuth ?? current.azimuth,
    polar: poi.polar ?? current.polar,
    target: projectCoordinates(poi.coordinates, origin),
    distance: Math.max(50, Math.min(2600, poi.distance * Math.max(1, 0.95 / Math.max(0.1, aspect)))),
  };
}

export interface PoiSelection {
  point: PointOfInterest;
  pose: CameraPose;
  marker: Vector3;
  url: string;
}

export function selectPointOfInterest(id: string, meta: CityData['meta'], current: CameraPose, aspect: number, elevation?: (x: number, z: number) => number): PoiSelection | undefined {
  const point = pointsOfInterest.find((poi) => poi.id === id);
  if (!point) return undefined;
  const [south, west, north, east] = meta.bbox;
  const [latitude, longitude] = point.coordinates;
  if (latitude < south! || latitude > north! || longitude < west! || longitude > east!) return undefined;
  const marker = projectCoordinates(point.coordinates, meta.origin);
  const pose = poiPose(point, meta.origin, current, aspect);
  const height = elevation?.(marker.x, marker.z) ?? 0;
  marker.y = height + point.markerHeight; pose.target.y = height + (point.targetHeight ?? 0);
  return { point, pose, marker, url: osmLocation(point) };
}

/** Cadrage volontaire d'inspection ; la sélection simple conserve l'orientation manuelle. */
export function landmarkView(id: string, meta: CityData['meta'], current: CameraPose, aspect: number, elevation?: (x:number,z:number)=>number): PoiSelection | undefined {
  const monument=landmarks.find(m=>m.id===id),selection=selectPointOfInterest(id,meta,current,aspect,elevation);
  if(!monument||!selection)return undefined;
  selection.pose.azimuth=monument.id==='cathedral'?-1.3:-.9;selection.pose.polar=1.02;selection.pose.target.y+=monument.height*.35;return selection;
}
