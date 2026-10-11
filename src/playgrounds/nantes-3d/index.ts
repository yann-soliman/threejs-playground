import {
  ACESFilmicToneMapping, Color, DirectionalLight, Fog, HemisphereLight,
  PCFSoftShadowMap, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Cleanup } from '../../shared/playground';
import { createCity } from './city';
import type { CityModel } from './city';
import type { CityData } from './types';
import './style.css';

export function mount(container: HTMLElement): Cleanup {
  container.innerHTML = `
    <section class="experience nantes" aria-labelledby="nantes-title">
      <a class="back-link" href="#/">← Expériences</a>
      <div class="experience-heading"><h1 id="nantes-title">Nantes 3D</h1><span class="badge">Première exploration</span></div>
      <p class="experience-summary">Bouffay, le château et leurs alentours. Une promenade au-dessus de la ville, dessinée par OpenStreetMap.</p>
      <div class="nantes-toolbar" aria-label="Vues de la ville">
        <div class="nantes-views"><button type="button" data-view="aerial" aria-pressed="true">Vue d’ensemble</button><button type="button" data-view="castle" aria-pressed="false">Le château</button><button type="button" data-view="bouffay" aria-pressed="false">Bouffay</button></div>
        <span class="nantes-extent">846 × 801 m <span aria-hidden="true">·</span> centre historique</span>
      </div>
      <div class="viewport nantes-viewport" tabindex="0" role="region" aria-label="Maquette 3D interactive de Nantes" aria-describedby="nantes-help">
        <p class="nantes-loading" role="status">Préparation de la maquette…</p>
        <div class="nantes-compass" aria-hidden="true"><span>N</span><i>↑</i></div>
        <div class="nantes-navigation" aria-label="Commandes de caméra">
          <button type="button" data-action="in" aria-label="Zoom avant">+</button><button type="button" data-action="out" aria-label="Zoom arrière">−</button><button type="button" data-action="reset" aria-label="Réinitialiser la caméra">↺</button>
        </div>
        <a class="nantes-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors · ODbL</a>
      </div>
      <p class="controls-help" id="nantes-help">Glisser pour tourner · Molette pour zoomer · Clic droit ou deux doigts pour déplacer · Clavier : flèches, +, − et R</p>
      <div class="nantes-caption"><span><strong>Bouffay & Château des ducs de Bretagne</strong><br>Empreintes réelles, architecture interprétée</span><span class="nantes-stats" role="status"></span></div>
      <details class="nantes-data"><summary>À propos de cette maquette</summary><p class="nantes-provenance"></p><p>Les empreintes, rues, places, espaces verts et arbres proviennent d’OpenStreetMap. Les hauteurs et toitures utilisent les attributs disponibles ; les autres dimensions, fenêtres, matériaux et détails de façade sont estimés de manière déterministe. Le relief est plat et les formes de toit sont approximatives.</p><p><a href="https://www.openstreetmap.org/#map=16/47.2156/-1.5524" target="_blank" rel="noopener noreferrer">Voir ce quartier sur OpenStreetMap ↗</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">Licence des données ODbL ↗</a></p></details>
    </section>`;
  const viewport = container.querySelector<HTMLElement>('.viewport')!;
  const status = container.querySelector<HTMLElement>('.nantes-loading')!;
  const stats = container.querySelector<HTMLElement>('.nantes-stats')!;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  } catch {
    status.textContent = 'WebGL 2 est nécessaire pour afficher la maquette.';
    return () => {};
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  viewport.prepend(renderer.domElement);
  const scene = new Scene();
  scene.background = new Color('#e7ece5');
  scene.fog = new Fog('#e7ece5', 1600, 3200);
  scene.add(new HemisphereLight('#fff8e7', '#919987', 2.5));
  const sun = new DirectionalLight('#fff1d5', 3);
  sun.position.set(-350, 700, 250);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -620; sun.shadow.camera.right = 620;
  sun.shadow.camera.top = 620; sun.shadow.camera.bottom = -620;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 1800;
  sun.shadow.normalBias = 0.4;
  sun.shadow.bias = -0.00015;
  scene.add(sun);
  const camera = new PerspectiveCamera(42, 1, 1, 4000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 50; controls.maxDistance = 2600;
  controls.maxPolarAngle = Math.PI / 2.25;
  controls.screenSpacePanning = false;
  // Rendu à la demande : pas de boucle permanente ni amortissement nécessitant des frames.
  const compass = container.querySelector<HTMLElement>('.nantes-compass i')!;
  let disposed = false;
  let model: CityModel | undefined;
  const draw = (): void => {
    if (disposed) return;
    compass.style.transform = `rotate(${controls.getAzimuthalAngle()}rad)`;
    renderer.render(scene, camera);
  };
  function setView(view: string): void {
    const target = view === 'castle' ? new Vector3(245, 0, -65) : view === 'bouffay' ? new Vector3(-180, 0, 150) : new Vector3(0, 0, 55);
    controls.target.copy(target);
    camera.position.copy(target).add(view === 'aerial' ? new Vector3(650, 800, 980).multiplyScalar(Math.max(1, 1.12 / (viewport.clientWidth / viewport.clientHeight))) : new Vector3(170, 220, 260));
    controls.update();
    container.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
    draw();
  }
  const resize = (): void => {
    if (disposed || !viewport.clientWidth || !viewport.clientHeight) return;
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix(); draw();
  };
  const zoom = (factor: number): void => {
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(Math.max(controls.minDistance, Math.min(controls.maxDistance, offset.length() * factor)));
    camera.position.copy(controls.target).add(offset); controls.update(); draw();
  };
  const click = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (button?.dataset.view) setView(button.dataset.view);
    if (button?.dataset.action === 'reset') setView('aerial');
    if (button?.dataset.action === 'in') zoom(0.8);
    if (button?.dataset.action === 'out') zoom(1.25);
  };
  const keydown = (event: KeyboardEvent): void => {
    if (event.target !== viewport) return;
    const direction: Record<string, Vector3> = { ArrowLeft: new Vector3(-15, 0, 0), ArrowRight: new Vector3(15, 0, 0), ArrowUp: new Vector3(0, 0, -15), ArrowDown: new Vector3(0, 0, 15) };
    if (direction[event.key]) {
      camera.position.add(direction[event.key]!); controls.target.add(direction[event.key]!); controls.update(); draw();
    } else if (event.key === '+' || event.key === '=') zoom(0.8);
    else if (event.key === '-') zoom(1.25);
    else if (event.key.toLowerCase() === 'r') setView('aerial');
    else return;
    event.preventDefault();
  };
  container.addEventListener('click', click);
  viewport.addEventListener('keydown', keydown);
  controls.addEventListener('change', draw);
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  setView('aerial'); resize();
  const request = new AbortController();
  // Vite émet une ressource hashée sous le base GitHub Pages ; aucune API au runtime.
  void fetch(new URL('./data/city.json', import.meta.url), { signal: request.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as CityData;
    })
    .then((data) => {
      if (disposed) return;
      model = createCity(data);
      scene.add(model.group);
      status.hidden = true;
      stats.textContent = `${data.buildings.length.toLocaleString('fr-FR')} bâtiments · ${data.trees.length.toLocaleString('fr-FR')} arbres cartographiés`;
      container.querySelector<HTMLElement>('.nantes-provenance')!.textContent = `Extraction Overpass du ${new Date(data.meta.extractedAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}. Emprise : ${data.meta.bbox.join(', ')}. ${model.estimatedHeights} hauteurs estimées sur ${data.buildings.length} bâtiments. Le modèle n’est pas un relevé architectural.`;
      draw();
      renderer.shadowMap.autoUpdate = false;
    })
    .catch((error: unknown) => {
      if (disposed) return;
      console.error('Chargement des données Nantes impossible.', error);
      status.textContent = 'La maquette n’a pas pu être chargée. Rechargez la page pour réessayer.';
    });

  return () => {
    disposed = true;
    request.abort();
    observer.disconnect();
    container.removeEventListener('click', click);
    viewport.removeEventListener('keydown', keydown);
    controls.removeEventListener('change', draw);
    controls.dispose();
    model?.dispose();
    sun.shadow.dispose();
    scene.clear();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
