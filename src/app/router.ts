export type Route = { kind: 'home' } | { kind: 'playground'; id: string } | { kind: 'not-found' };

export function playgroundUrl(id: string): string {
  return `#/playgrounds/${encodeURIComponent(id)}`;
}

export function parseRoute(hash: string): Route {
  if (hash === '' || hash === '#' || hash === '#/') return { kind: 'home' };
  const match = /^#\/playgrounds\/([^/]+)\/?$/.exec(hash);
  if (!match?.[1]) return { kind: 'not-found' };
  try {
    return { kind: 'playground', id: decodeURIComponent(match[1]) };
  } catch {
    return { kind: 'not-found' };
  }
}
