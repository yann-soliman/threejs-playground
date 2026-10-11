import './style.css';
import { playgrounds } from './app/catalog';
import { renderHome } from './app/home';
import { parseRoute } from './app/router';
import type { Cleanup } from './shared/playground';

const app = document.querySelector<HTMLElement>('#app')!;
let cleanup: Cleanup | undefined;
let navigation = 0;

async function render(): Promise<void> {
  const currentNavigation = ++navigation;
  cleanup?.();
  cleanup = undefined;
  app.replaceChildren();
  const route = parseRoute(window.location.hash);
  document.title = 'Three.js Playground — Expériences 3D';

  if (route.kind === 'home') {
    renderHome(app);
  } else {
    const entry = route.kind === 'playground' ? playgrounds.find(({ id }) => id === route.id) : undefined;
    if (!entry) {
      app.innerHTML = '<section class="message"><p class="eyebrow">404</p><h1>Expérience introuvable</h1><p>Ce playground n’existe pas encore.</p><a class="button" href="#/">Retour à l’accueil</a></section>';
    } else {
      app.innerHTML = '<p class="loading" role="status">Chargement de l’expérience…</p>';
      try {
        const module = await entry.load();
        // Un import terminé après une autre navigation ne doit rien monter.
        if (currentNavigation !== navigation) return;
        app.replaceChildren();
        cleanup = module.mount(app);
        document.title = `${entry.title} — Three.js Playground`;
      } catch (error) {
        if (currentNavigation !== navigation) return;
        console.error('Impossible de charger le playground.', error);
        app.innerHTML = '<section class="message"><h1>Chargement impossible</h1><p>Vérifiez votre connexion, puis rechargez la page.</p><a class="button" href="#/">Retour à l’accueil</a></section>';
      }
    }
  }
  app.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => void render());
void render();
