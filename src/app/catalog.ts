import type { PlaygroundEntry } from '../shared/playground';

// Les métadonnées restent légères : aucun import statique des expériences.
export const playgrounds: readonly PlaygroundEntry[] = [
  {
    id: 'nantes-3d',
    title: 'Nantes 3D',
    description: 'Reconstruction 3D interactive de Nantes à partir des données OpenStreetMap.',
    status: 'En préparation',
    load: () => import('../playgrounds/nantes-3d'),
  },
];
