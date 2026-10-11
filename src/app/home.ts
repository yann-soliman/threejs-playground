import { playgrounds } from './catalog';
import { playgroundUrl } from './router';

export function renderHome(container: HTMLElement): void {
  container.innerHTML = `
    <section class="collection" aria-labelledby="home-title">
      <h1 id="home-title">Expériences</h1>
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
    visual.innerHTML = `<svg viewBox="0 0 480 240" xmlns="http://www.w3.org/2000/svg" focusable="false">
      <defs><pattern id="map-grid-${entry.id}" width="32" height="32" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)"><path d="M32 0H0V32" fill="none" stroke="#cddbd3" stroke-width="1"/></pattern></defs>
      <rect width="480" height="240" fill="#e8f0e9"/>
      <rect width="480" height="240" fill="url(#map-grid-${entry.id})"/>
      <path d="M-30 200C90 200 120 100 235 124S340 67 510 60" fill="none" stroke="#b7d8e4" stroke-width="32"/>
      <circle cx="240" cy="112" r="18" fill="#fff"/>
      <circle cx="240" cy="112" r="6" fill="#28634d"/>
    </svg>`;
    const content = document.createElement('div');
    content.className = 'card-content';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = entry.status;
    const title = document.createElement('h2');
    title.textContent = entry.title;
    const description = document.createElement('p');
    description.textContent = entry.description;
    const heading = document.createElement('div');
    heading.className = 'card-heading';
    heading.append(title, badge);
    const action = document.createElement('span');
    action.className = 'card-action';
    action.innerHTML = 'Ouvrir la scène <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
    content.append(heading, description, action);
    card.append(visual, content);
    cards.append(card);
  }
}
