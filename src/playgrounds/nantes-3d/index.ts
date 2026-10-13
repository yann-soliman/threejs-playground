import {
  ACESFilmicToneMapping, BufferGeometry, Color, DirectionalLight, Fog, HemisphereLight, InstancedMesh, Mesh,
  PCFSoftShadowMap, PerspectiveCamera, Scene, Vector2, Vector3, Raycaster, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Cleanup } from '../../shared/playground';
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
import { WalkingWorld, Walker, walkingTiles, EYE_HEIGHT } from './walking';
import { PedestrianInput } from './pedestrian-input';
import { Minimap } from './minimap';
import { GeometryBuilder } from './geometry-client';
import { PerformanceLog } from './performance';
import { UrbanActivity } from './urban-activity';
import type { UrbanDensity } from './mobility-paths';
import { parisTime } from './time';
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
      <div class="nantes-modes" aria-label="Mode de caméra"><button type="button" data-mode="aerial" aria-pressed="true">Vue aérienne</button><button type="button" data-mode="pedestrian" aria-pressed="false" disabled>Mode piéton</button><button type="button" data-action="inspect" hidden>Inspecter devant soi</button></div>
      ${timePanel}
      <div class="viewport nantes-viewport" tabindex="0" role="region" aria-label="Maquette 3D interactive de Nantes" aria-describedby="nantes-help">
        <div class="nantes-walk-pad" hidden aria-label="Déplacements piétons"><button type="button" data-walk="forward" aria-label="Avancer">↑</button><button type="button" data-walk="left" aria-label="Pas à gauche">←</button><button type="button" data-walk="back" aria-label="Reculer">↓</button><button type="button" data-walk="right" aria-label="Pas à droite">→</button></div>
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
      <p class="nantes-walk-help" id="nantes-walk-help" hidden role="status">ZQSD / WASD · Maj pour accélérer · Cliquer dans la scène pour regarder autour de soi · Échap libère la souris · Sur écran tactile : glisser pour regarder, flèches pour marcher.</p>
      <p class="nantes-terrain-source">Relief IGN RGE ALTI · NGF-IGN69 · échelle verticale 1:1 · <a href="https://geoservices.ign.fr/rgealti" target="_blank" rel="noopener noreferrer">Source</a> · <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noopener noreferrer">Licence ouverte</a></p>
      <p class="controls-help" id="nantes-help">Glisser pour tourner · Molette pour zoomer · Clic droit ou deux doigts pour déplacer · Clavier : flèches, +, −, R pour réinitialiser et N pour le nord</p>
      <label class="nantes-traffic">Circulation <select aria-label="Circulation"><option value="off">Désactivée</option><option value="low">Faible</option><option value="normal" selected>Normale</option></select><small>Cliquer sur un bâtiment pour l’inspecter.</small></label>
      <div class="nantes-building" hidden aria-live="polite"><div><strong></strong><dl></dl><a target="_blank" rel="noopener noreferrer">Voir le bâtiment sur OpenStreetMap ↗</a></div><button type="button" aria-label="Fermer la fiche du bâtiment">×</button></div>
      <div class="nantes-place" hidden><span><strong class="nantes-place-name"></strong><a class="nantes-place-link" target="_blank" rel="noopener noreferrer">Voir sur OpenStreetMap ↗</a></span><button type="button" data-action="walk-poi">Rejoindre le lieu</button><button type="button" data-action="clear-poi" aria-label="Masquer le repère du lieu" title="Masquer le repère">×</button></div>
      <span class="nantes-sr-only nantes-announcement" role="status"></span>
      <div class="nantes-caption"><span><strong>Nantes · Loire & Erdre</strong><br>Empreintes réelles, architecture interprétée</span><span class="nantes-stats" role="status"></span></div>
      <fieldset class="nantes-activity"><legend>Activité urbaine</legend><label>Passants et cyclistes <select aria-label="Passants et cyclistes"><option value="off">Désactivée</option><option value="low" selected>Faible</option><option value="normal">Normale</option></select></label><label><input type="checkbox" class="nantes-trams" checked> Tramways</label><small role="status">Densités et déplacements estimés, sans horaires réels.</small></fieldset>
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
  const profile = new PerformanceLog();
  const scene = new Scene();
  scene.background = new Color('#e7ece5');
  scene.fog = new Fog('#e7ece5', 20000, 65000);
  const ambient = new HemisphereLight('#fff8e7', '#919987', 2.5);
  scene.add(ambient);
  const traffic = new Traffic(viewport.clientWidth < 600 ? 48 : 96);
  const urban = new UrbanActivity(`${import.meta.env.BASE_URL}nantes/mobility/`, viewport.clientWidth < 600, () => { urbanChanged(); }, profile);
  const urbanControl = container.querySelector<HTMLSelectElement>('.nantes-activity select')!;
  const tramControl = container.querySelector<HTMLInputElement>('.nantes-trams')!;
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
  scene.add(traffic.group, urban.group, selectionIndex.group);
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
  let geometryBuilder: GeometryBuilder | undefined;
  let world: WalkingWorld | undefined;
  let walker: Walker | undefined;
  let pedestrianInput: PedestrianInput | undefined;
  let minimap: Minimap | undefined;
  let mode: 'aerial' | 'pedestrian' = 'aerial';
  let pendingSpawn: Vector3 | undefined;
  let entry: { from: Vector3; to: Vector3; start: number } | undefined;
  let lastWalkingBlock: Walker['blocked'];
  const walkHelp = container.querySelector<HTMLElement>('.nantes-walk-help')!;
  const walkPad = container.querySelector<HTMLElement>('.nantes-walk-pad')!;
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
    loader.update(mode === 'pedestrian' && walker ? walkingTiles(manifest, pendingSpawn ?? walker.position, walker.yaw) : selectTiles(manifest, camera, controls.target, loader.levels, destination, aspect() < 1 ? 10 : 16));
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
    if (!terrainOverview || mode === 'pedestrian') return;
    const delta = elevationAt(controls.target.x, controls.target.z) - controls.target.y;
    controls.target.y += delta; camera.position.y += delta;
    camera.position.y = Math.max(camera.position.y, elevationAt(camera.position.x, camera.position.z) + 3);
    camera.lookAt(controls.target);
  };
  const refreshDiagnostics = (): void => {
    if (diagnostics.open && loader) {
      const info = loader.info;
      diagnostics.querySelector('output')!.textContent = `${mode === 'pedestrian' ? `Mode piéton · X ${walker!.position.x.toFixed(1)}, Z ${walker!.position.z.toFixed(1)} m · sol ${(walker!.position.y - EYE_HEIGHT).toFixed(2)} m NGF · ${world!.count} tuiles proches · collision ${walker!.blocked ? ({ loading: 'chargement', obstacle: 'obstacle', water: 'eau', access: 'accès interdit', slope: 'pente refusée' })[walker!.blocked] : 'prête'} · ` : 'Vue aérienne · '}${walker?.moving || entry || navigator.active || timeControls.playing || waterActive() || traffic.count > 0 || urban.active ? `Rendu animé : ${movementFps.toFixed(1)} images/s` : 'Au repos : rendu à la demande'} · ${info.active} tuiles · ${info.pending} requêtes · LOD proche/moyen/lointain : ${info.lod.near}/${info.lod.medium}/${info.lod.far} · ${renderer.info.render.calls} appels de dessin · ${renderer.info.render.triangles.toLocaleString('fr-FR')} triangles · relief 20/50/100 m · buffers estimés : ${(info.bytes / 1048576).toFixed(1)} Mio (hors pilote GPU) · ${traffic.count} véhicules · ${traffic.drawCalls} appels circulation · ${urban.counts.pedestrian} passants · ${urban.counts.cyclist} cyclistes · ${urban.counts.tram} tramways · ${urban.drawCalls} lots d’activité estimés (hors ombres) · ${(urban.bytes / 1048576).toFixed(2)} Mio de buffers agents estimés · eau ${waterActive() ? 'animée' : 'figée'}`;
    }
  };
  const requestDraw = (): void => scheduler.invalidate();
  const render = (): void => {
    if (disposed) return;
    sceneDirty = false;
    fitCamera();
    const heading = mode === 'pedestrian' && walker ? walker.yaw : controls.getAzimuthalAngle();
    // Dérouler les angles évite un tour artificiel lors du passage de +π à −π.
    compassHeading += shortestAngle(previousHeading, heading);
    previousHeading = heading;
    compass.style.setProperty('--heading', `${compassHeading}rad`);
    const distance = camera.position.distanceTo(controls.target);
    if (scene.fog instanceof Fog && mode === 'pedestrian') { scene.fog.near = 450; scene.fog.far = 1800; }
    else if (scene.fog instanceof Fog) { scene.fog.near = Math.max(1600, distance * 1.15); scene.fog.far = Math.max(4000, distance * 2.2); }
    lighting.prepare(controls.target, distance, performance.now());
    minimap?.update({ position: mode === 'pedestrian' && walker ? walker.position : controls.target, yaw: heading, pedestrian: mode === 'pedestrian', distance }, performance.now(), true);
    profile.measure('render', mode, () => renderer.render(scene, camera));
    if (diagnostics.open) {
      const now = performance.now();
      if ((walker?.moving || entry || navigator.active || timeControls.playing || waterActive() || traffic.count > 0 || urban.active) && lastDraw && now > lastDraw) movementFps = 1000 / (now - lastDraw);
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
  const updateAnimation = (): void => scheduler.setContinuous(!!entry || !!walker?.moving || timeControls.playing || waterActive() || (traffic.count > 0 || urban.active) && !motion.matches);
  const timeControls = new TimeControls(container, () => {
    lighting.select(timeControls.instant, true);
    urbanChanged();
    updateAnimation(); requestDraw();
  });
  timeControls.setReduced(motion.matches); trafficControl.disabled = motion.matches; urbanControl.disabled = motion.matches; tramControl.disabled = motion.matches;
  lighting.select(timeControls.instant, true);
  const scheduler = new AnimationScheduler({
    now: () => performance.now(),
    request: (callback) => window.requestAnimationFrame(callback),
    cancel: (id) => window.cancelAnimationFrame(id),
  }, (seconds) => {
    if (mode === 'pedestrian' && walker && !pendingSpawn) {
      if (entry) {
        const progress = motion.matches ? 1 : Math.min(1, (performance.now() - entry.start) / 1000);
        camera.position.copy(entry.from).lerp(entry.to, progress * progress * (3 - 2 * progress));
        camera.rotation.set(walker.pitch, walker.yaw, 0, 'YXZ');
        if (progress === 1) { entry = undefined; applyWalkingCamera(); updateAnimation(); }
      } else if (walker.advance(performance.now())) { applyWalkingCamera(); scheduleTiles(); }
      if (!pendingSpawn && !entry && walker.blocked !== lastWalkingBlock) {
        lastWalkingBlock = walker.blocked;
        walkHelp.textContent = walker.blocked ? ({ loading: 'Chargement du terrain voisin… Position conservée.', slope: 'Pente ou dénivelé trop important : passage bloqué.', obstacle: 'Obstacle : contourner le bâtiment ou le mur.', water: 'Bord de l’eau : passage bloqué.', access: 'Accès piéton interdit ou surface non prise en charge.' })[walker.blocked] : walkingMessage;
      }
    }
    if (timeControls.advance(seconds)) { lighting.select(timeControls.instant); urban.configure(urbanControl.value as UrbanDensity, tramControl.checked, motion.matches, parisTime(timeControls.instant).minute / 60); }
    if (waterActive()) atmosphere.time.value += seconds;
    if (!motion.matches) { traffic.update(seconds); urban.update(seconds); }
    updateAnimation();
  }, render, () => walker?.moving || entry || navigator.active || traffic.count || urban.active || waterActive() ? 24 : 12);
  const readPose = (): CameraPose => readCameraPose(camera, controls.target);
  const applyPose = (pose: CameraPose): void => {
    controls.target.copy(pose.target);
    camera.position.copy(cameraPosition(pose));
    // L’événement change assure le rendu ; aucune seconde frame pour le même pas.
    fitCamera(); controls.update();
  };
  const navigator = new CameraNavigator(readPose, applyPose, scheduler);
  const aspect = (): number => viewport.clientWidth / Math.max(1, viewport.clientHeight);
  const walkingMessage = 'ZQSD / WASD · Maj pour accélérer · Cliquer dans la scène pour regarder autour de soi · Échap libère la souris · Tactile : glisser et flèches.';
  const applyWalkingCamera = (): void => {
    if (!walker) return;
    camera.position.copy(walker.position); camera.rotation.set(walker.pitch, walker.yaw, 0, 'YXZ');
    controls.target.copy(walker.position); controls.target.y -= EYE_HEIGHT;
    camera.updateMatrixWorld(); urban.select(camera, controls.target); requestDraw();
  };
  const resolveSpawn = (): void => {
    if (mode !== 'pedestrian' || !pendingSpawn || !world || !walker) return;
    const spawn = world.spawn(pendingSpawn);
    if (!spawn) {
      walkHelp.textContent = loader?.info.pending ? 'Recherche d’un départ piéton sûr…' : 'Aucun départ piéton sûr disponible ici. Choisir un autre lieu ou revenir en vue aérienne.';
      return;
    }
    const relocating = walker.position.lengthSq() > 0;
    walker.blocked = lastWalkingBlock = undefined; walker.yaw = world.heading(spawn, walker.yaw); walker.position.copy(spawn); pendingSpawn = undefined;
    walkHelp.textContent = walkingMessage;
    if (!relocating && !motion.matches) entry = { from: camera.position.clone(), to: spawn.clone(), start: performance.now() };
    else applyWalkingCamera();
    scheduleTiles(); updateAnimation(); requestDraw(); viewport.focus({ preventScroll: true });
  };
  const setMode = (next: 'aerial' | 'pedestrian'): void => {
    if (!walker || !world || mode === next) return;
    navigator.cancel(); pedestrianInput?.release(); entry = undefined;
    if (next === 'pedestrian') {
      pendingSpawn = controls.target.clone(); walker.position.set(0, 0, 0); walker.yaw = readPose().azimuth; walker.pitch = 0;
      controls.enabled = false; camera.near = .15; camera.updateProjectionMatrix();
    } else {
      const target = walker.position.lengthSq() ? walker.position.clone() : pendingSpawn!.clone(); target.y = elevationAt(target.x, target.z);
      pendingSpawn = undefined; controls.enabled = true; camera.near = 2; camera.updateProjectionMatrix();
      mode = next; applyPose({ target, distance: 400, polar: .85, azimuth: walker.yaw });
    }
    camera.far = next === 'pedestrian' ? 2000 : 100000; camera.updateProjectionMatrix();
    const shadowExtent = next === 'pedestrian' ? 180 : 620;
    sun.shadow.camera.left = -shadowExtent; sun.shadow.camera.right = shadowExtent;
    sun.shadow.camera.top = shadowExtent; sun.shadow.camera.bottom = -shadowExtent;
    sun.shadow.camera.updateProjectionMatrix(); lighting.invalidateShadows();
    container.querySelector<HTMLElement>('#nantes-help')!.hidden = next === 'pedestrian';
    container.querySelector<HTMLElement>('.nantes-traffic small')!.textContent = next === 'pedestrian' ? 'Utiliser « Inspecter devant soi » pour consulter un bâtiment.' : 'Cliquer sur un bâtiment pour l’inspecter.';
    mode = next; container.querySelector<HTMLButtonElement>('[data-action=inspect]')!.hidden = next !== 'pedestrian'; walkHelp.hidden = walkPad.hidden = next !== 'pedestrian';
    viewport.classList.toggle('is-pedestrian', next === 'pedestrian');
    viewport.setAttribute('aria-describedby', next === 'pedestrian' ? 'nantes-walk-help' : 'nantes-help');
    container.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === next)));
    container.querySelectorAll<HTMLButtonElement>('.nantes-navigation button').forEach((button) => { button.disabled = next === 'pedestrian'; });
    renderer.setPixelRatio(next === 'pedestrian' ? Math.min(window.devicePixelRatio, 1) : Math.min(window.devicePixelRatio, 1.5)); resize();
    updateTiles(); resolveSpawn(); updateAnimation(); requestDraw();
  };
  const travelTo = (point: Vector3): void => {
    if (mode === 'pedestrian') {
      pedestrianInput?.release(); entry = undefined; walker!.stop(); pendingSpawn = point.clone();
      // Le déplacement n'est confirmé qu'après validation : garder l'ancienne position.
      walkHelp.textContent = 'Validation du départ à la destination…'; updateTiles(); resolveSpawn(); updateAnimation();
    } else moveTo({ ...readPose(), target: new Vector3(point.x, elevationAt(point.x, point.z), point.z), distance: 550 });
  };
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
    if (mode === 'pedestrian') { walkHelp.textContent = 'Lieu sélectionné. Utiliser « Rejoindre le lieu » pour valider un nouveau départ.'; } else moveTo(next.pose);
  };
  const setView = (view: string): void => {
    if (view === 'aerial' && mode === 'pedestrian') setMode('aerial');
    if (view !== 'aerial') { selectPoi(view); return; }
    clearPoi();
    activeView('aerial');
    moveTo(manifest ? cityOverviewPose(manifest.bounds, aspect()) : aerialPose(aspect()));
  };
  const orientNorth = (): void => { if (mode === 'pedestrian' && walker && !pendingSpawn) { entry = undefined; walker.yaw = 0; applyWalkingCamera(); updateAnimation(); } else if (mode === 'aerial') moveTo(northPose(readPose())); };
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
    if (button?.dataset.action === 'inspect' && mode === 'pedestrian' && !entry && !pendingSpawn) { pedestrianInput?.release(); raycaster.setFromCamera(new Vector2(0, 0), camera); selectionIndex.pick(raycaster.ray); }
    if (button?.dataset.mode) setMode(button.dataset.mode as 'aerial' | 'pedestrian');
    if (button?.dataset.action === 'walk-poi' && selection) travelTo(selection.pose.target);
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
    if (event.target !== viewport || mode === 'pedestrian') return;
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
  const urbanChanged = (): void => {
    urban.configure(urbanControl.value as UrbanDensity, tramControl.checked, motion.matches, parisTime(timeControls.instant).minute / 60);
    urban.select(camera, controls.target);
    container.querySelector('.nantes-activity small')!.textContent = motion.matches ? 'Animations réduites : activité urbaine désactivée.' : urban.status;
    updateAnimation(); requestDraw();
  };
  const trafficChanged = (): void => { traffic.select(camera, controls.target, trafficControl.value as TrafficDensity, motion.matches); updateAnimation(); requestDraw(); };
  const closeBuilding = (): void => selectionIndex.clear();
  const raycaster = new Raycaster();
  let press: { x: number; y: number; time: number; id: number } | undefined;
  const pointerDown = (event: PointerEvent): void => {
    if (mode === 'pedestrian' || event.button !== 0 || event.target !== renderer.domElement || !event.isPrimary) { press = undefined; return; }
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
  urbanControl.addEventListener('change', urbanChanged); tramControl.addEventListener('change', urbanChanged);
  buildingCard.querySelector('button')!.addEventListener('click', closeBuilding);
  container.addEventListener('click', click);
  picker.addEventListener('change', selectChange);
  viewport.addEventListener('keydown', keydown);
  controls.addEventListener('start', manualInteraction);
  const cameraChanged = (): void => { fitCamera(); urban.select(camera, controls.target); traffic.select(camera, controls.target, trafficControl.value as TrafficDensity, motion.matches); updateAnimation(); requestDraw(); scheduleTiles(); };
  const diagnosticChanged = (): void => { lastDraw = 0; requestDraw(); };
  diagnostics.addEventListener('toggle', diagnosticChanged);
  controls.addEventListener('change', cameraChanged);
  let inViewport = true;
  const visibilityChanged = (): void => {
    const hidden = document.hidden || !inViewport;
    if (hidden) { navigator.cancel(); timeControls.pause(); pedestrianInput?.release(); entry = undefined; if (mode === 'pedestrian' && !pendingSpawn) applyWalkingCamera(); }
    scheduler.setHidden(hidden); updateAnimation();
  };
  const motionChanged = (): void => {
    if (motion.matches) navigator.cancel();
    timeControls.setReduced(motion.matches); trafficControl.disabled = motion.matches; urbanControl.disabled = motion.matches; tramControl.disabled = motion.matches; urbanChanged(); traffic.select(camera, controls.target, trafficControl.value as TrafficDensity, motion.matches); updateAnimation(); requestDraw();
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
  profile.publish(() => ({ mode, position: walker?.position.toArray(), yaw: walker?.yaw, tiles: loader?.info, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length, agents: urban.counts, agentPositions: urban.positions, agentCalls: urban.drawCalls, agentBytes: urban.bytes, camera: camera.position.toArray(), target: controls.target.toArray() }));
  const request = new AbortController();
  const fetchData = async <T,>(url: string, signal: AbortSignal): Promise<T> => {
    const start = profile.enabled ? performance.now() : 0;
    const response = await fetch(url, { signal });
    profile.record('headers', url, start);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!profile.enabled) return await response.json() as T;
    const read = performance.now(), text = await response.text(); profile.record('body', url, read);
    return profile.measure('parse', url, () => JSON.parse(text) as T);
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
      geometryBuilder = new GeometryBuilder(terrainOverview, atmosphere, profile);
      const prepared = await geometryBuilder.prepare(general, 'far', request.signal, true);
      if (disposed) { prepared.dispose(); return; }
      overview = profile.measure('overview', 'municipality', () => createOverview(general, data, atmosphere, terrainOverview, prepared));
      scene.add(overview.group);
      world = new WalkingWorld(terrainOverview.bridgeLevels, data.boundary); walker = new Walker(world);
      pedestrianInput = new PedestrianInput(viewport, renderer.domElement, walker, () => mode === 'pedestrian' && !pendingSpawn && !entry && !disposed, () => {
        if (!disposed && mode === 'pedestrian' && !pendingSpawn && !entry) { applyWalkingCamera(); scheduleTiles(); }
        updateAnimation();
      }, (text) => { walkHelp.textContent = text; });
      minimap = new Minimap(viewport, data, general, terrainOverview.waterSurfaces ?? general.surfaces.filter((s) => s.kind === 'water'), travelTo);
      container.querySelector<HTMLButtonElement>('[data-mode="pedestrian"]')!.disabled = false;
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
          const model = await geometryBuilder!.prepare(tileData, choice.lod, signal);
          if (signal.aborted || disposed) { model.dispose(); throw new DOMException('Géométrie annulée', 'AbortError'); }
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
        attach: (resource, tile) => { scene.add(resource.group); if (resource.lod === 'near') world?.setTile(tile.id, resource.data, resource.surfaceElevation); selectionIndex.setTile(tile.id, resource.data, resource.lod, resource.surfaceElevation); urban.setTile(tile.id, resource.surfaceElevation, resource.lod); if (resource.lod !== 'far') traffic.setTile(tile.id, resource.data, resource.surfaceElevation, terrainOverview!.bridgeLevels); overview?.setTile(tile, true); lighting.invalidateShadows(); sceneDirty = true; },
        detach: (resource, tile) => { scene.remove(resource.group); world?.removeTile(tile.id); selectionIndex.removeTile(tile.id); traffic.removeTile(tile.id); urban.removeTile(tile.id); overview?.setTile(tile, false); lighting.invalidateShadows(); sceneDirty = true; },
        changed: () => {
          if (disposed || !loader) return;
          const info = loader.info;
          status.hidden = info.pending === 0 && tileFailures === 0;
          status.textContent = tileFailures ? `${tileFailures} tuile(s) indisponible(s) ; la vue générale reste visible.` : destination ? 'Affinage du quartier sélectionné…' : 'Chargement des quartiers visibles…';
          resolveSpawn(); selectionIndex.reconcile(); urbanChanged(); traffic.select(camera, controls.target, trafficControl.value as TrafficDensity, motion.matches); updateAnimation();
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
    request.abort(); geometryBuilder?.dispose(); profile.dispose();
    pedestrianInput?.dispose(); minimap?.dispose(); world?.dispose();
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
    trafficControl.removeEventListener('change', trafficChanged); urbanControl.removeEventListener('change', urbanChanged); tramControl.removeEventListener('change', urbanChanged); buildingCard.querySelector('button')!.removeEventListener('click', closeBuilding);
    selectionIndex.dispose(); traffic.dispose(); urban.dispose();
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
