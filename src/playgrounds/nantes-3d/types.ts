export type Point = [number, number];
export interface Feature {
  id: string;
  rings: Point[][];
  tags: Record<string, string>;
  visual?: { height: number; roofShape: string }; // Agrégats graphiques, séparés des tags OSM.
}
export interface CityData {
  meta: {
    bbox: number[];
    origin: Point;
    width: number;
    depth: number;
    extractedAt: string;
    osmTimestamp: string;
    source: string;
    license: string;
    skippedBuildings: string[];
  };
  buildings: Feature[];
  surfaces: (Feature & { kind: 'green' | 'water' | 'plaza' })[];
  roads: { id: string; points: Point[]; tags: Record<string, string> }[];
  walls: { id: string; points: Point[]; tags: Record<string, string> }[];
  trees: Point[];
}
