import { playgrounds } from './catalog';
import { playgroundUrl } from './router';

export function renderHome(container: HTMLElement): void {
  container.innerHTML = `
    <section class="hero" aria-labelledby="home-title">
      <p class="eyebrow"><span class="status-dot"></span> EXPÉRIENCES INTERACTIVES</p>
      <h1 id="home-title">Une autre<br>dimension <span>à explorer.</span></h1>
      <p class="hero-description">Des idées, du code et un peu de perspective.<br>Une collection d’explorations indépendantes en 3D.</p>
      <div class="hero-coordinate" aria-hidden="true">X / Y / Z <span>↗</span></div>
    </section>
    <section class="collection" aria-labelledby="collection-title">
      <div class="section-heading"><h2 id="collection-title">Les playgrounds</h2><span>01 expérience</span></div>
      <div class="cards"></div>
    </section>`;
  const cards = container.querySelector('.cards')!;
  for (const entry of playgrounds) {
    const card = document.createElement('a');
    card.className = 'playground-card';
    card.href = playgroundUrl(entry.id);
    const visual = document.createElement('div');
    visual.className = 'card-visual';
    visual.setAttribute('aria-hidden', 'true');
    visual.innerHTML = '<div class="map-grid"></div><div class="map-river"></div><span class="map-pin">◇</span><span class="map-coordinate">47.2184° N / 1.5536° O</span><span class="visual-label">NANTES</span>';
    const content = document.createElement('div');
    content.className = 'card-content';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = entry.status;
    const title = document.createElement('h3');
    title.textContent = entry.title;
    const description = document.createElement('p');
    description.textContent = entry.description;
    const action = document.createElement('span');
    action.className = 'card-action';
    action.textContent = 'Explorer le projet ↗';
    content.append(badge, title, description, action);
    card.append(visual, content);
    cards.append(card);
  }
}
