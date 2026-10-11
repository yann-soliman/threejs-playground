import {
  ACESFilmicToneMapping, BufferGeometry, Color, DirectionalLight, Fog, HemisphereLight, InstancedMesh, Mesh,
  PCFSoftShadowMap, PerspectiveCamera, Scene, Vector2, Vector3, Raycaster, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Cleanup } from '../../shared/playground';
import { createCity } from './city';
import type { CityModel, DetailLevel } from './city';
import { createOverview } from './overview';
import { selectTiles, TileLoader } from './tiles';
import type { CityManifest, TileResource } from './tiles';
import type { CityData } from './types';
import { aerialPose, cityOverviewPose, CameraNavigator, cameraPosition, northPose, readCameraPose, shortestAngle } from './navigation';
import type { CameraPose } from './navigation';
import { pointsOfInterest, selectPointOfInterest } from './pois';
import type { PoiSelection } from './pois';
import { AnimationScheduler } from './animation';
import { atmosphereUniforms } from './atmosphere';
import { SolarLighting } from './lighting';
import { TerrainStore, sampleElevation, tileElevation } from './terrain';
import type { TerrainManifest, TerrainOverview } from './terrain';
import { TimeControls, timePanel } from './time-controls';
import { Traffic } from './traffic';
import type { TrafficDensity } from './traffic';
import { BuildingSelection, buildingInformation, isSelectionClick } from './selection';
import './style.css';

type InteractiveTile = CityModel & TileResource & { data: CityData; lod: DetailLevel };

export function mount(container: HTMLElement): Cleanup {
  container.innerHTML = `
    <section class="experience nantes" aria-labelledby="nantes-title">
      <a class="back-link" href="#/">← Expériences</a>
      <div class="experience-heading"><h1 id="nantes-title">Nantes 3D</h1><span class="badge">Toute la ville</span></div>
      <p class="experience-summary">Du centre historique aux quartiers de Nantes. Explorez la commune entière, dessinée par OpenStreetMap.</p>
      <div class="nantes-toolbar" aria-label="Vues de la ville">
        <div class="nantes-views"><button type="button" data-view="aerial" aria-pressed="true">Vue d’ensemble</button><button type="button" data-view="castle" aria-pressed="false" disabled>Le château</button><button type="button" data-view="bouffay" aria-pressed="false" disabled>Bouffay</button></div>
        <label class="nantes-poi-picker"><span>Lieux à explorer</span><select aria-label="Choisir un point d’intérêt" disabled><option value="">Choisir un lieu…</option></select></label>
        <span class="nantes-extent">Commune de Nantes <span aria-hidden="true">·</span> chargement progressif</span>
      </div>
      ${timePanel}
      <div class="viewport nantes-viewport" tabindex="0" role="region" aria-label="Maquette 3D interactive de Nantes" aria-describedby="nantes-help">
        <p class="nantes-loading" role="status">Préparation de la maquette…</p>
        <button type="button" class="nantes-compass" data-action="north" aria-label="Orienter la vue vers le nord" title="Orienter vers le nord sans changer le centre, le zoom ni l’inclinaison (N)">
          <span class="nantes-compass-rose" aria-hidden="true">
            <span class="nantes-cardinal north"><span>N</span></span><span class="nantes-cardinal east"><span>E</span></span><span class="nantes-cardinal south"><span>S</span></span><span class="nantes-cardinal west"><span>W</span></span>
            <svg viewBox="0 0 80 80" focusable="false"><path class="north-needle" d="M40 20 34 43 40 39 46 43Z"/><path class="south-needle" d="M40 60 34 43 40 47 46 43Z"/><circle cx="40" cy="42" r="2"/></svg>
          </span>
        </button>
        <div class="nantes-poi-marker" aria-hidden="true" hidden><span></span></div>
        <div class="nantes-navigation" aria-label="Commandes de caméra">
          <button type="button" data-action="in" aria-label="Zoom avant">+</button><button type="button" data-action="out" aria-label="Zoom arrière">−</button><button type="button" data-action="reset" aria-label="Réinitialiser la caméra">↺</button>
        </div>
        <a class="nantes-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors · ODbL</a>
      </div>
      <p class="nantes-terrain-source">Relief IGN RGE ALTI · NGF-IGN69 · échelle verticale 1:1 · <a href="https://geoservices.ign.fr/rgealti" target="_blank" rel="noopener noreferrer">Source</a> · <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noopener noreferrer">Licence ouverte</a></p>
      <p class="controls-help" id="nantes-help">Glisser pour tourner · Molette pour zoomer · Clic droit ou deux doigts pour déplacer · Clavier : flèches, +, −, R pour réinitialiser et N pour le nord</p>
      <label class="nantes-traffic">Circulation <select aria-label="Circulation"><option value="off">Désactivée</option><option value="low">Faible</option><option value="normal" selected>Normale</option></select><small>Cliquer sur un bâtiment pour l’inspecter.</small></label>
      <div class="nantes-building" hidden aria-live="polite"><div><strong></strong><dl></dl><a target="_blank" rel="noopener noreferrer">Voir le bâtiment sur OpenStreetMap ↗</a></div><button type="button" aria-label="Fermer la fiche du bâtiment">×</button></div>
      <div class="nantes-place" hidden><span><strong class="nantes-place-name"></strong><a class="nantes-place-link" target="_blank" rel="noopener noreferrer">Voir sur OpenStreetMap ↗</a></span><button type="button" data-action="clear-poi" aria-label="Masquer le repère du lieu" title="Masquer le repère">×</button></div>
      <span class="nantes-sr-only nantes-announcement" role="status"></span>
      <div class="nantes-caption"><span><strong>Nantes · Loire & Erdre</strong><br>Empreintes réelles, architecture interprétée</span><span class="nantes-stats" role="status"></span></div>
      <details class="nantes-diagnostics"><summary>Diagnostic du rendu</summary><output></output></details>
      <details class="nantes-data"><summary>À propos de cette maquette</summary><p class="nantes-provenance"></p><p>Les empreintes, rues, places, espaces verts et arbres proviennent d’OpenStreetMap. Les hauteurs et toitures utilisent les attributs disponibles ; les autres dimensions, fenêtres, matériaux et détails de façade sont estimés de manière déterministe. Le relief provient du MNT IGN RGE ALTI ; les formes de toit restent approximatives. La vue générale agrège la densité bâtie ; les empreintes réelles apparaissent en zoomant.</p><p><a href="https://www.openstreetmap.org/#map=16/47.2156/-1.5524" target="_blank" rel="noopener noreferrer">Voir Nantes sur OpenStreetMap ↗</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">Licence des données ODbL ↗</a></p></details>
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
  scene.fog = new Fog('#e7ece5', 20000, 65000);
  const ambient = new HemisphereLight('#fff8e7', '#919987', 2.5);
  scene.add(ambient);
  const traffic = new Traffic(viewport.clientWidth < 600 ? 48 : 96);
  const trafficControl = container.querySelector<HTMLSelectElement>('.nantes-traffic select')!;
  const buildingCard = container.querySelector<HTMLElement>('.nantes-building')!;
  const selectionIndex = new BuildingSelection((feature) => {
    buildingCard.hidden = !feature;
    if (feature) {
      const info = buildingInformation(feature);
      buildingCard.querySelector('strong')!.textContent = info.title;
      const list = buildingCard.querySelector('dl')!; list.replaceChildren();
      for (const [label, value] of [['Type OSM', info.type], ['Hauteur', info.height], ['Niveaux OSM', info.floors], ['Identifiant OSM', info.id]]) {
        const term = document.createElement('dt'), detail = document.createElement('dd'); term.textContent = label!; detail.textContent = value!; list.append(term, detail);
      }
      buildingCard.querySelector('a')!.href = info.url;
    }
    requestDraw();
  });
  scene.add(traffic.group, selectionIndex.group);
  const atmosphere = atmosphereUniforms();
  const sun = new DirectionalLight('#fff1d5', 3);
  sun.position.set(-350, 700, 250);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -620; sun.shadow.camera.right = 620;
  sun.shadow.camera.top = 620; sun.shadow.camera.bottom = -620;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 8500;
  sun.shadow.normalBias = 0.4;
  sun.shadow.bias = -0.00015;
  scene.add(sun, sun.target);
  renderer.shadowMap.autoUpdate = false;
  const camera = new PerspectiveCamera(42, 1, 2, 100000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 50; controls.maxDistance = 50000;
  controls.maxPolarAngle = Math.PI / 2.25;
  controls.screenSpacePanning = false;
  const compass = container.querySelector<HTMLElement>('.nantes-compass')!;
  const marker = container.querySelector<HTMLElement>('.nantes-poi-marker')!;
  const picker = container.querySelector<HTMLSelectElement>('.nantes-poi-picker select')!;
  const place = container.querySelector<HTMLElement>('.nantes-place')!;
  const announcement = container.querySelector<HTMLElement>('.nantes-announcement')!;
  for (const point of pointsOfInterest) {
    const option = document.createElement('option');
    option.value = point.id; option.textContent = point.name;
    picker.append(option);
  }
  let disposed = false;
  let manifest: CityManifest | undefined;
  let overview: ReturnType<typeof createOverview> | undefined;
  let terrainOverview: TerrainOverview | undefined;
  let terrainStore: TerrainStore | undefined;
  const terrainFiles = new Map<string, string>();
  let loader: TileLoader<InteractiveTile> | undefined;
  let destination: Vector3 | undefined;
  let tileTimer: number | undefined;
  let sceneDirty = false;
  const lighting = new SolarLighting(scene, renderer, sun, ambient, atmosphere);
  const diagnostics = container.querySelector<HTMLDetailsElement>('.nantes-diagnostics')!;
  let lastDraw = 0;
  let movementFps = 0;
  let tileFailures = 0;
  const base = `${import.meta.env.BASE_URL}nantes/`;
  const updateTiles = (): void => {
    tileTimer = undefined;
    if (disposed || !manifest || !loader) return;
    loader.update(selectTiles(manifest, camera, controls.target, loader.levels, destination, aspect() < 1 ? 10 : 16));
  };
  const scheduleTiles = (): void => {
    if (tileTimer === undefined && !disposed) tileTimer = window.setTimeout(updateTiles, 80);
  };
  let selection: PoiSelection | undefined;
  let compassHeading = 0;
  let previousHeading = 0;
  const markerProjection = new Vector3();
  const elevationAt = (x: number, z: number): number => {
    if (!terrainOverview) return 0;
    const fine = terrainStore?.peek(`${Math.floor(x / 500)}_${Math.floor(z / 500)}`);
    return fine ? tileElevation(fine, x, z) : sampleElevation(terrainOverview.grid, x, z);
  };
  const fitCamera = (): void => {
    if (!terrainOverview) return;
    const delta = elevationAt(controls.target.x, controls.target.z) - controls.target.y;
    controls.target.y += delta; camera.position.y += delta;
    camera.position.y = Math.max(camera.position.y, elevationAt(camera.position.x, camera.position.z) + 3);
    camera.lookAt(controls.target);
  };
  const refreshDiagnostics = (): void => {
    if (diagnostics.open && loader) {
      const info = loader.info;
      diagnostics.querySelector('output')!.textContent = `${navigator.active || timeControls.playing || waterActive() || traffic.count > 0 ? `Rendu animé : ${movementFps.toFixed(1)} images/s` : 'Au repos : rendu à la demande'} · ${info.active} tuiles · ${info.pending} requêtes · LOD proche/moyen/lointain : ${info.lod.near}/${info.lod.medium}/${info.lod.far} · ${renderer.info.render.calls} appels de dessin · ${renderer.info.render.triangles.toLocaleString('fr-FR')} triangles · relief 20/50/100 m · buffers estimés : ${(info.bytes / 1048576).toFixed(1)} Mio (hors pilote GPU) · ${traffic.count} véhicules · ${traffic.drawCalls} appels circulation · eau ${waterActive() ? 'animée' : 'figée'}`;
    }
  };
  const requestDraw = (): void => scheduler.invalidate();
  const render = (): void => {
    if (disposed) return;
    sceneDirty = false;
    fitCamera();
    const heading = controls.getAzimuthalAngle();
    // Dérouler les angles évite un tour artificiel lors du passage de +π à −π.
    compassHeading += shortestAngle(previousHeading, heading);
    previousHeading = heading;
    compass.style.setProperty('--heading', `${compassHeading}rad`);
    const distance = camera.position.distanceTo(controls.target);
    if (scene.fog instanceof Fog) { scene.fog.near = Math.max(1600, distance * 1.15); scene.fog.far = Math.max(4000, distance * 2.2); }
    lighting.prepare(controls.target, distance, performance.now());
    renderer.render(scene, camera);
    if (diagnostics.open) {
      const now = performance.now();
      if ((navigator.active || timeControls.playing || waterActive() || traffic.count > 0) && lastDraw && now > lastDraw) movementFps = 1000 / (now - lastDraw);
      lastDraw = now;
      refreshDiagnostics();
    }
    if (selection) {
      selection.marker.y = elevationAt(selection.marker.x, selection.marker.z) + selection.point.markerHeight;
      markerProjection.copy(selection.marker).project(camera);
      const visible = markerProjection.z >= -1 && markerProjection.z <= 1 && Math.abs(markerProjection.x) <= 1 && Math.abs(markerProjection.y) <= 1;
      marker.hidden = !visible;
      if (visible) marker.style.transform = `translate(${(markerProjection.x + 1) * viewport.clientWidth / 2}px, ${(1 - markerProjection.y) * viewport.clientHeight / 2}px)`;
    } else marker.hidden = true;
  };
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const waterActive = (): boolean => timeControls.waterPlaying && camera.position.distanceTo(controls.target) < 6500 && overview !== undefined;
  const updateAnimation = (): void => scheduler.setContinuous(timeControls.playing || waterActive() || traffic.count > 0 && !motion.matches);
  const timeControls = new TimeControls(container, () => {
    lighting.select(timeControls.instant, true);
    updateAnimation(); requestDraw();
  });
  timeControls.setReduced(motion.matches); trafficControl.disabled = motion.matches;
  lighting.select(timeControls.instant, true);
  const scheduler = new AnimationScheduler({
    now: () => performance.now(),
    request: (callback) => window.requestAnimationFrame(callback),
    cancel: (id) => window.cancelAnimationFrame(id),
  }, (seconds) => {
    if (timeControls.advance(seconds)) lighting.select(timeControls.instant);
    if (waterActive()) atmosphere.time.value += seconds;
    if (!motion.matches) traffic.update(seconds);
  }, render, () => navigator.active || traffic.count || waterActive() ? 24 : 12);
  const readPose = (): CameraPose => readCameraPose(camera, controls.target);
  const applyPose = (pose: CameraPose): void => {
    controls.target.copy(pose.target);
    camera.position.copy(cameraPosition(pose));
    // L’événement change assure le rendu ; aucune seconde frame pour le même pas.
    fitCamera(); controls.update();
  };
  const navigator = new CameraNavigator(readPose, applyPose, scheduler);
  const aspect = (): number => viewport.clientWidth / Math.max(1, viewport.clientHeight);
  const moveTo = (pose: CameraPose): void => {
    navigator.moveTo(pose, motion.matches ? 0 : 1400);
  };
  const activeView = (id: string): void => {
    container.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === id)));
  };
  const clearPoi = (): void => {
    navigator.cancel();
    selection = undefined;
    destination = undefined;
    scheduleTiles();
    picker.value = '';
    marker.hidden = true;
    place.hidden = true;
    announcement.textContent = '';
  };
  const selectPoi = (id: string): void => {
    if (!manifest) return;
    const next = selectPointOfInterest(id, manifest.meta, readPose(), aspect(), elevationAt);
    if (!next) return;
    selection = next;
    destination = next.pose.target.clone();
    updateTiles();
    picker.value = next.point.id;
    container.querySelector<HTMLElement>('.nantes-place-name')!.textContent = next.point.name;
    container.querySelector<HTMLAnchorElement>('.nantes-place-link')!.href = next.url;
    announcement.textContent = `Lieu sélectionné : ${next.point.name}`;
    place.hidden = false;
    activeView(id);
    requestDraw();
    moveTo(next.pose);
  };
  const setView = (view: string): void => {
    if (view !== 'aerial') { selectPoi(view); return; }
    clearPoi();
    activeView('aerial');
    moveTo(manifest ? cityOverviewPose(manifest.bounds, aspect()) : aerialPose(aspect()));
  };
  const orientNorth = (): void => moveTo(northPose(readPose()));
  const manualInteraction = (): void => {
    navigator.cancel();
    destination = undefined;
    scheduleTiles();
    activeView('');
  };
  const resize = (): void => {
    if (disposed || !viewport.clientWidth || !viewport.clientHeight) return;
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    camera.aspect = aspect();
    camera.updateProjectionMatrix(); requestDraw(); scheduleTiles();
  };
  const zoom = (factor: number): void => {
    manualInteraction();
    const pose = readPose();
    pose.distance = Math.max(controls.minDistance, Math.min(controls.maxDistance, pose.distance * factor));
    applyPose(pose);
  };
  const click = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (button?.disabled) return;
    if (button?.dataset.view) setView(button.dataset.view);
    if (button?.dataset.action === 'reset') setView('aerial');
    if (button?.dataset.action === 'north') orientNorth();
    if (button?.dataset.action === 'in') zoom(0.8);
    if (button?.dataset.action === 'out') zoom(1.25);
    if (button?.dataset.action === 'clear-poi') clearPoi();
  };
  const selectChange = (): void => {
    if (picker.value) selectPoi(picker.value);
    else { clearPoi(); activeView(''); }
  };
  const keydown = (event: KeyboardEvent): void => {
    if (event.target !== viewport) return;
    const direction: Record<string, Vector3> = { ArrowLeft: new Vector3(-15, 0, 0), ArrowRight: new Vector3(15, 0, 0), ArrowUp: new Vector3(0, 0, -15), ArrowDown: new Vector3(0, 0, 15) };
    if (direction[event.key]) {
      manualInteraction();
      camera.position.add(direction[event.key]!); controls.target.add(direction[event.key]!); controls.update();
    } else if (event.key === '+' || event.key === '=') zoom(0.8);
    else if (event.key === '-') zoom(1.25);
    else if (event.key.toLowerCase() === 'r') setView('aerial');
    else if (event.key.toLowerCase() === 'n') orientNorth();
    else return;
    event.preventDefault();
  };
  const trafficChanged = (): void => { traffic.select(camera, controls.target, trafficControl.value as TrafficDensity, motion.matches); updateAnimation(); requestDraw(); };
  const closeBuilding = (): void => selectionIndex.clear();
  const raycaster = new Raycaster();
  let press: { x: number; y: number; time: number; id: number } | undefined;
  const pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || event.target !== renderer.domElement || !event.isPrimary) { press = undefined; return; }
    press = { x: event.clientX, y: event.clientY, time: performance.now(), id: event.pointerId };
  };
  const pointerUp = (event: PointerEvent): void => {
    const start = press; press = undefined;
    if (!start || start.id !== event.pointerId || !isSelectionClick(start, { x: event.clientX, y: event.clientY, time: performance.now() }) || navigator.active) return;
    const bounds = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1), camera);
    selectionIndex.pick(raycaster.ray);
  };
  const pointerCancel = (): void => { press = undefined; };
  const pointerMove = (event: PointerEvent): void => { if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) press = undefined; };
  viewport.addEventListener('pointerdown', pointerDown); viewport.addEventListener('pointerup', pointerUp); viewport.addEventListener('pointercancel', pointerCancel); viewport.addEventListener('pointermove', pointerMove);
  trafficControl.addEventListener('change', trafficChanged);
  buildingCard.querySelector('button')!.addEventListener('click', closeBuilding);
  container.addEventListener('click', click);
  picker.addEventListener('change', selectChange);
  viewport.addEventListener('keydown', keydown);
  controls.addEventListener('start', manualInteraction);
  const cameraChanged = (): void => { fitCamera(); traffic.select(camera, controls.target, trafficControl.value as TrafficDensity, motion.matches); updateAnimation(); requestDraw(); scheduleTiles(); };
  const diagnosticChanged = (): void => { lastDraw = 0; requestDraw(); };
  diagnostics.addEventListener('toggle', diagnosticChanged);
  controls.addEventListener('change', cameraChanged);
  let inViewport = true;
  const visibilityChanged = (): void => {
    const hidden = document.hidden || !inViewport;
    if (hidden) { navigator.cancel(); timeControls.pause(); }
    scheduler.setHidden(hidden); updateAnimation();
  };
  const motionChanged = (): void => {
    if (motion.matches) navigator.cancel();
    timeControls.setReduced(motion.matches); trafficControl.disabled = motion.matches; traffic.select(camera, controls.target, trafficControl.value as TrafficDensity, motion.matches); updateAnimation(); requestDraw();
  };
  document.addEventListener('visibilitychange', visibilityChanged);
  motion.addEventListener('change', motionChanged);
  const intersection = new IntersectionObserver((entries) => {
    inViewport = entries[0]?.isIntersecting ?? false; visibilityChanged();
  });
  intersection.observe(viewport);
  scheduler.setHidden(document.hidden);
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  // Premier cadrage immédiat au montage ; toutes les actions suivantes sont animées.
  applyPose(aerialPose(aspect())); resize();
  const request = new AbortController();
  const fetchData = async <T,>(url: string, signal: AbortSignal): Promise<T> => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as T;
  };
  void fetchData<CityManifest>(`${base}manifest.json`, request.signal)
    .then(async (data) => {
      if (disposed) return;
      manifest = data;
      status.textContent = 'Préparation de la vue générale de Nantes…';
      const [general, reliefManifest] = await Promise.all([
        fetchData<CityData>(base + data.overview, request.signal),
        fetchData<TerrainManifest>(base + 'terrain/manifest.json', request.signal),
      ]);
      for (const entry of reliefManifest.tiles) terrainFiles.set(entry.id, 'terrain/' + entry.url);
      if (data.tiles.some((tile) => !terrainFiles.has(tile.id))) throw new Error('Une tuile IGN nécessaire est absente');
      terrainOverview = await fetchData<TerrainOverview>(base + 'terrain/' + reliefManifest.overview, request.signal);
      if (disposed) return;
      overview = createOverview(general, data, atmosphere, terrainOverview);
      scene.add(overview.group);
      terrainStore = new TerrainStore((url, signal) => fetchData(base + url, signal));
      loader = new TileLoader({
        fetch: async (choice, signal) => {
          const [city, terrain] = await Promise.all([
            fetchData<CityData>(base + choice.tile.urls[choice.lod], signal),
            terrainStore!.load(choice.tile.id, terrainFiles.get(choice.tile.id)!, signal),
          ]);
          return { ...city, terrain };
        },
        generate: async (tileData, choice, signal) => {
          // Laisser le navigateur traiter les interactions entre deux lots de géométrie.
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
          if (signal.aborted || disposed) throw new DOMException('Chargement annulé', 'AbortError');
          const model = createCity(tileData, { lod: choice.lod, ground: false, atmosphere, terrain: tileData.terrain, elevation: (x, z) => sampleElevation(terrainOverview!.grid, x, z), waterLevels: terrainOverview!.waterLevels, bridgeLevels: terrainOverview!.bridgeLevels });
          let bytes = 0;
          const geometries = new Set<BufferGeometry>();
          model.group.traverse((object) => {
            if (!(object instanceof Mesh)) return;
            if (!geometries.has(object.geometry)) {
              geometries.add(object.geometry);
              for (const attribute of Object.values(object.geometry.attributes)) bytes += (attribute as { array: { byteLength: number } }).array.byteLength;
              bytes += object.geometry.index?.array.byteLength ?? 0;
            }
            if (object instanceof InstancedMesh) bytes += object.instanceMatrix.array.byteLength + (object.instanceColor?.array.byteLength ?? 0);
          });
          return { ...model, bytes, data: tileData, lod: choice.lod };
        },
        attach: (resource, tile) => { scene.add(resource.group); selectionIndex.setTile(tile.id, resource.data, resource.lod, resource.surfaceElevation); if (resource.lod !== 'far') traffic.setTile(tile.id, resource.data, resource.surfaceElevation, terrainOverview!.bridgeLevels); overview?.setTile(tile, true); lighting.invalidateShadows(); sceneDirty = true; },
        detach: (resource, tile) => { scene.remove(resource.group); selectionIndex.removeTile(tile.id); traffic.removeTile(tile.id); overview?.setTile(tile, false); lighting.invalidateShadows(); sceneDirty = true; },
        changed: () => {
          if (disposed || !loader) return;
          const info = loader.info;
          status.hidden = info.pending === 0 && tileFailures === 0;
          status.textContent = tileFailures ? `${tileFailures} tuile(s) indisponible(s) ; la vue générale reste visible.` : destination ? 'Affinage du quartier sélectionné…' : 'Chargement des quartiers visibles…';
          selectionIndex.reconcile(); traffic.select(camera, controls.target, trafficControl.value as TrafficDensity, motion.matches); updateAnimation();
          refreshDiagnostics();
          if (sceneDirty) requestDraw();
        },
        failed: (_tile, error) => { tileFailures++; console.error('Une tuile Nantes ne peut pas être chargée.', error); },
      }, aspect() < 1 ? 48 * 1048576 : 96 * 1048576);
      picker.disabled = false;
      container.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => { button.disabled = false; });
      stats.textContent = `${data.counts.buildings!.toLocaleString('fr-FR')} empreintes · ${data.tiles.length} tuiles · ${(data.areaSquareMetres / 1e6).toFixed(1)} km²`;
      container.querySelector<HTMLElement>('.nantes-provenance')!.textContent = `Données OpenStreetMap / Geofabrik du ${new Date(data.meta.extractedAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}. Limite communale officielle : Nantes, INSEE 44109 (API Découpage administratif). Relief IGN RGE ALTI 5 m, édition ${reliefManifest.meta.edition}, altitudes NGF-IGN69 (${reliefManifest.range[0]} à ${reliefManifest.range[1]} m). Le modèle n’est pas un relevé architectural.`;
      applyPose(cityOverviewPose(data.bounds, aspect()));
      status.hidden = true;
      updateAnimation(); updateTiles(); requestDraw();
    })
    .catch((error: unknown) => {
      if (disposed) return;
      console.error('Chargement des données Nantes impossible.', error);
      status.textContent = 'La maquette n’a pas pu être chargée. Rechargez la page pour réessayer.';
    });

  return () => {
    disposed = true;
    request.abort();
    navigator.dispose(); scheduler.dispose(); timeControls.dispose();
    observer.disconnect(); intersection.disconnect();
    document.removeEventListener('visibilitychange', visibilityChanged);
    motion.removeEventListener('change', motionChanged);
    container.removeEventListener('click', click);
    picker.removeEventListener('change', selectChange);
    viewport.removeEventListener('keydown', keydown);
    controls.removeEventListener('start', manualInteraction);
    controls.removeEventListener('change', cameraChanged);
    diagnostics.removeEventListener('toggle', diagnosticChanged);
    if (tileTimer !== undefined) window.clearTimeout(tileTimer);
    viewport.removeEventListener('pointerdown', pointerDown); viewport.removeEventListener('pointerup', pointerUp); viewport.removeEventListener('pointercancel', pointerCancel); viewport.removeEventListener('pointermove', pointerMove);
    trafficControl.removeEventListener('change', trafficChanged); buildingCard.querySelector('button')!.removeEventListener('click', closeBuilding);
    selectionIndex.dispose(); traffic.dispose();
    controls.dispose();
    loader?.dispose(); terrainStore?.dispose();
    overview?.dispose();
    sun.shadow.dispose();
    scene.clear();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
