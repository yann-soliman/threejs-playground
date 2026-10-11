import { describe, expect, it } from 'vitest';
import { parseRoute, playgroundUrl } from '../src/app/router';
import { playgrounds } from '../src/app/catalog';

describe('Routage compatible avec GitHub Pages', () => {
  it.each(['', '#', '#/'])('ouvre l’accueil pour %s', (hash) => {
    expect(parseRoute(hash)).toEqual({ kind: 'home' });
  });
  it('reconnaît un lien direct vers Nantes', () => {
    expect(parseRoute('#/playgrounds/nantes-3d')).toEqual({ kind: 'playground', id: 'nantes-3d' });
  });
  it('accepte un slash final', () => {
    expect(parseRoute('#/playgrounds/nantes-3d/')).toEqual({ kind: 'playground', id: 'nantes-3d' });
  });
  it('encode et décode les identifiants', () => {
    expect(parseRoute(playgroundUrl('été 3d'))).toEqual({ kind: 'playground', id: 'été 3d' });
  });
  it.each(['#/ailleurs', '#/playgrounds/', '#/playgrounds/nantes-3d/autre', '#/playgrounds/%E0%A4%A'])('rejette une route invalide : %s', (hash) => {
    expect(parseRoute(hash)).toEqual({ kind: 'not-found' });
  });
});

describe('Catalogue', () => {
  it('utilise des identifiants uniques et stables', () => {
    const ids = playgrounds.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
  it('relie chaque entrée à son module indépendant', async () => {
    for (const entry of playgrounds) {
      expect(parseRoute(playgroundUrl(entry.id))).toEqual({ kind: 'playground', id: entry.id });
      expect((await entry.load()).mount).toBeTypeOf('function');
    }
  });
});
