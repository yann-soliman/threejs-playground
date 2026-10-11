/** Chaque expérience libère ses ressources et écouteurs à sa fermeture. */
export type Cleanup = () => void;

export interface PlaygroundModule {
  mount: (container: HTMLElement) => Cleanup;
}

export interface PlaygroundEntry {
  id: string;
  title: string;
  description: string;
  status: string;
  load: () => Promise<PlaygroundModule>;
}
