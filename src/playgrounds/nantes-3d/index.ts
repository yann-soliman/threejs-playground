import {
  Color, GridHelper, Mesh, MeshBasicMaterial, PerspectiveCamera,
  RingGeometry, Scene, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Cleanup } from '../../shared/playground';

export function mount(container: HTMLElement): Cleanup {
  container.innerHTML = `
    <section class="experience" aria-labelledby="nantes-title">
      <a class="back-link" href="#/">← Playgrounds</a>
      <div class="experience-heading"><h1 id="nantes-title">Nantes 3D</h1><span class="badge">En préparation</span></div>
      <div class="viewport" aria-label="Scène 3D de préparation"><p class="viewport-note">Scène d’attente · Données OpenStreetMap à venir</p></div>
      <p class="controls-help">Glisser pour tourner · Molette ou pincement pour zoomer</p>
    </section>`;
  const viewport = container.querySelector<HTMLElement>('.viewport')!;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true });
  } catch {
    const help = container.querySelector<HTMLElement>('.controls-help')!;
    help.textContent = 'WebGL 2 est nécessaire pour afficher la scène.';
    return () => {};
  }

  const scene = new Scene();
  scene.background = new Color('#f0f4ef');
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(9, 9, 12);
  const grid = new GridHelper(30, 30, '#96b0a0', '#d5dfd5');
  scene.add(grid);
  const geometry = new RingGeometry(1.2, 1.24, 64);
  const material = new MeshBasicMaterial({ color: '#28634d' });
  const marker = new Mesh(geometry, material);
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.02;
  scene.add(marker);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  viewport.prepend(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 4;
  controls.maxDistance = 25;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.enablePan = false;

  // Rendu à la demande : aucune boucle d’animation pour cette scène statique.
  const draw = (): void => renderer.render(scene, camera);
  const resize = (): void => {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    draw();
  };
  controls.addEventListener('change', draw);
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  resize();

  return () => {
    observer.disconnect();
    controls.removeEventListener('change', draw);
    controls.dispose();
    grid.geometry.dispose();
    if (Array.isArray(grid.material)) grid.material.forEach((value) => value.dispose());
    else grid.material.dispose();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
