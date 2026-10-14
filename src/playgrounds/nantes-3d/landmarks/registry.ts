import type { Feature, Point } from '../types';
export type LandmarkId = 'castle' | 'cathedral' | 'tour-lu' | 'titan' | 'pommeraye';
export interface Landmark { id: LandmarkId; name: string; coordinates: Point; source: string; reference: string; description: string; distance: number; height: number }
export const landmarks: readonly Landmark[] = [
  { id: 'castle', name: 'Château des ducs de Bretagne', coordinates: [47.21586895, -1.549972], source: 'relation/17369788', reference: 'https://www.chateaunantes.fr/le-chateau/', description: 'Enceinte fortifiée et résidence ducale des XVe–XVIe siècles. Tours, logis et décors sont interprétés à partir des empreintes OSM et de références patrimoniales.', distance: 330, height: 33 },
  { id: 'cathedral', name: 'Cathédrale Saint-Pierre-et-Saint-Paul', coordinates: [47.21837155, -1.55020215], source: 'way/28379422', reference: 'https://fr.wikipedia.org/wiki/Cathédrale_Saint-Pierre-et-Saint-Paul_de_Nantes', description: 'Cathédrale gothique construite de 1434 à 1891. Deux tours occidentales, portails et nef : volumes stylisés, sans restitution des sculptures ou vitraux.', distance: 340, height: 63 },
  { id: 'tour-lu', name: 'Tour LU', coordinates: [47.2154572, -1.5462031], source: 'way/288814717', reference: 'https://www.lelieuunique.com/les-espaces/la-tour-lu', description: 'Tour édifiée en 1909, restaurée en 1998. Les parties OSM guident le couronnement, les coupoles et la flèche ; couleurs et horloge sont interprétées, sans logo.', distance: 220, height: 38 },
  { id: 'titan', name: 'Grue Titan jaune', coordinates: [47.205091, -1.569744], source: 'way/288905411', reference: 'https://fr.wikipedia.org/wiki/Grues_Titan', description: 'Grue des anciens chantiers navals : portique, contrepoids et flèche en treillis. Hauteur de 43 m renseignée dans OSM ; proportions secondaires et orientation de flèche estimées.', distance: 240, height: 43 },
  { id: 'pommeraye', name: 'Passage Pommeraye', coordinates: [47.21347, -1.55966], source: 'relation/4016610', reference: 'https://fr.wikipedia.org/wiki/Passage_Pommeraye', description: 'Passage néoclassique ouvert en 1843. Volumes extérieurs, entrées et verrière stylisés ; aucun intérieur, escalier ou accès piéton supplémentaire.', distance: 260, height: 22 },
];
export const castleRoles: Readonly<Record<string, 'logis' | 'government' | 'gate' | 'wall' | 'tower' | 'hall' | 'ruin'>> = {
  'relation/17369788': 'logis', 'relation/17370071': 'government', 'relation/17369964': 'gate',
  'relation/17380803': 'wall', 'relation/17369992': 'wall', 'relation/17370109': 'wall',
  'relation/17370004': 'tower', 'relation/17383391': 'tower', 'relation/17369402': 'tower',
  'relation/17367654': 'tower', 'relation/17369384': 'hall', 'relation/17369522': 'hall',
  'relation/17369559': 'hall', 'relation/17369623': 'hall', 'relation/17380516': 'tower',
  'relation/17367543': 'ruin', 'relation/17369408': 'ruin',
};
export function landmarkForFeature(feature: Pick<Feature, 'id'>): Landmark | undefined {
  const id = castleRoles[feature.id] ? 'castle' : feature.id === 'way/28379422' ? 'cathedral'
    : feature.id === 'way/32428111' ? 'tour-lu' : feature.id === 'way/288905411' ? 'titan'
    : feature.id === 'relation/4016610' ? 'pommeraye' : undefined;
  return landmarks.find((landmark) => landmark.id === id);
}
export function landmarkHeight(feature: Feature): number {
  const landmark = landmarkForFeature(feature);
  if (landmark?.id !== 'castle') return landmark?.height ?? 0;
  const role = castleRoles[feature.id];
  return role === 'ruin' ? Number.parseFloat(feature.tags.height ?? '1') : role === 'wall' ? 10.5 : role === 'gate' ? 30 : role === 'logis' ? 33 : role === 'government' ? 32 : role === 'hall' ? 18 : 20;
}
export interface LandmarkSupport { entrances?: { source: string; point: Point }[]; parts?: Feature[]; visualRings?: Feature['rings']; additions?: Feature[]; meta: { rawSha256: string; osmTimestamp: string; preparedAt: string; license: string } }
export const supportTiles = new Set(['1_0', '-2_0']);
