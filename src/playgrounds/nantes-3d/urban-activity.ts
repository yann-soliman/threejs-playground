import { Color, DynamicDrawUsage, Frustum, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import { agentModel, animatedAgentMaterial } from './agent-models';
import { tramRails } from './tram-rails';
import { agentBudget, agentRoute, agentStyle, pathPose } from './mobility-paths';
import type { AgentKind, AgentRoute, MobilityManifest, MobilityPath, TramData, UrbanDensity } from './mobility-paths';
import type { DetailLevel } from './city';
import type { PerformanceLog } from './performance';

interface Area { sample: (x: number, z: number) => number; lod: DetailLevel }
interface Agent { id: string; route: AgentRoute; kind: AgentKind | 'tram'; distance: number; direction: number; angle: number; fade: number; speed: number; phase: number; height: number; wait: number; stopped: Set<string>; finished: boolean }
/** Borné, paresseux, sans renderer ni boucle indépendante ; trois lots d'instances. */
export class UrbanActivity {
  readonly group = new Group();
  private readonly areas = new Map<string, Area>();
  private readonly paths = new Map<string, AgentRoute[]>();
  private readonly pending = new Map<string, AbortController>();
  private readonly request = new AbortController();
  private manifest: MobilityManifest | undefined;
  private tramRoutes: AgentRoute[] = [];
  private loading: Promise<void> | undefined;
  private disposed = false;
  private density: UrbanDensity = 'off';
  private trams = false;
  private reduced = false;
  private hour = 14;
  private rails: Mesh | undefined;
  private railsDirty = true;
  private meshes = new Map<AgentKind | 'tram', InstancedMesh>();
  private agents: Agent[] = [];
  private readonly time = { value: 0 };
  private readonly dummy = new Object3D();
  private readonly point = new Vector3();
  private readonly frustum = new Frustum();
  private readonly projection = new Matrix4();
  private camera: PerspectiveCamera | undefined;
  private target = new Vector3();
  private lastSelection = -Infinity;
  private readonly colors = ['#bd705b', '#658a9d', '#dfbb6d', '#88a78c', '#a48db0', '#e5ddd0'].map((c) => new Color(c));
  private failure = false;
  private readonly white = new Color('#ffffff');
  constructor(private readonly base: string, private readonly mobile: boolean, private readonly changed: () => void, private readonly profile: PerformanceLog) {}
  setTile(id: string, sample: Area['sample'], lod: DetailLevel): void { this.areas.set(id, { sample, lod }); this.railsDirty = true; this.pump(); }
  removeTile(id: string): void { this.areas.delete(id); this.railsDirty = true; this.paths.delete(id); this.pending.get(id)?.abort(); this.pending.delete(id); this.lastSelection = -Infinity; }
  configure(density: UrbanDensity, trams: boolean, reduced: boolean, hour: number): void {
    this.density = density; this.trams = trams; this.reduced = reduced; this.hour = hour;
    if (density === 'off') {
      this.agents = this.agents.filter((a) => a.kind === 'tram');
      for (const kind of ['pedestrian', 'cyclist'] as const) { const mesh = this.meshes.get(kind);if (mesh) { mesh.count = 0;mesh.visible = false; } }
    }
    if (!trams) { this.agents = this.agents.filter((a) => a.kind !== 'tram');this.tramCount = 0;const mesh = this.meshes.get('tram');if (mesh) { mesh.count = 0;mesh.visible = false; } }
    if (this.rails) this.rails.visible = trams && !reduced && !!this.camera && this.camera.position.distanceTo(this.target) < 4000;
    if (reduced || density === 'off' && !trams) {
      this.agents = []; this.tramCount = 0; this.meshes.forEach((mesh) => { mesh.count = 0; mesh.visible = false; });
      this.pending.forEach((controller) => controller.abort()); this.pending.clear();this.lastSelection = -Infinity;return;
    }
    if (this.camera && this.camera.position.distanceTo(this.target) < 4000 && !this.loading && !this.manifest && !this.failure) this.loading = this.load();
    this.lastSelection = -Infinity; this.pump();
  }
  private async json<T>(url: string, signal: AbortSignal): Promise<T> {
    const response = await fetch(this.base + url, { signal }); if (!response.ok) throw new Error(`HTTP ${response.status}`);return await response.json() as T;
  }
  private async load(): Promise<void> {
    try {
      this.manifest = await this.json<MobilityManifest>('manifest.json', this.request.signal);
      if (this.trams) await this.loadTrams();
      this.pump();
    } catch (error) { if (!this.disposed && !(error instanceof DOMException && error.name === 'AbortError')) this.failure = true; }
    finally { this.loading = undefined; if (!this.disposed) this.changed(); }
  }
  private async loadTrams(): Promise<void> {
    if (!this.manifest || this.tramRoutes.length || this.pending.has('trams')) return;
    const controller = new AbortController();this.pending.set('trams', controller);
    try { const data = await this.json<TramData>(this.manifest.trams, controller.signal); if (!this.disposed) this.tramRoutes = data.routes.map(agentRoute).filter((r): r is AgentRoute => !!r); }
    catch (error) { if (!this.disposed && !(error instanceof DOMException && error.name === 'AbortError')) this.failure = true; }
    finally { if (this.pending.get('trams') === controller) this.pending.delete('trams');this.railsDirty = true;this.lastSelection = -Infinity;if (!this.disposed) this.changed(); }
  }
  private pump(): void {
    if (!this.manifest || this.disposed || this.reduced) return;
    if (this.trams && !this.tramRoutes.length && !this.failure) void this.loadTrams();
    if (this.density === 'off' || !this.camera || this.camera.position.distanceTo(this.target) > 1600) return;
    for (const [id, area] of this.areas) {
      if (this.pending.size >= 2) break;
      if (area.lod !== 'near' || this.paths.has(id) || this.pending.has(id) || !this.manifest.tiles[id]) continue;
      const controller = new AbortController();this.pending.set(id, controller);
      void this.json<{ routes: MobilityPath[] }>(this.manifest.tiles[id]!, controller.signal).then((data) => {
        if (!this.disposed && this.areas.get(id) === area && this.pending.get(id) === controller) this.paths.set(id, data.routes.map(agentRoute).filter((r): r is AgentRoute => !!r));
      }).catch((error: unknown) => { if (!this.disposed && !(error instanceof DOMException && error.name === 'AbortError')) { this.paths.set(id, []);this.failure = true; } }).finally(() => {
        if (this.pending.get(id) === controller) this.pending.delete(id);
        this.lastSelection = -Infinity;this.pump();if (!this.disposed) this.changed();
      });
    }
  }
  select(camera: PerspectiveCamera, target: Vector3): void {
    this.camera = camera;this.target.copy(target);
    this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    if (!this.reduced && (this.density !== 'off' || this.trams) && camera.position.distanceTo(target) < 4000 && !this.loading && !this.manifest && !this.failure) this.loading = this.load();
    this.pump();this.refreshRails();this.choose();
  }
  private refreshRails(): void {
    if (this.rails) this.rails.visible = this.trams && !this.reduced && !!this.camera && this.camera.position.distanceTo(this.target) < 4000;
    if (!this.trams || this.reduced || !this.railsDirty || !this.tramRoutes.length) return;
    const geometry = tramRails(this.tramRoutes, (x, z, route) => {
      const area = this.areaAt(x, z);if (!area) return undefined;
      return route.tags.bridge && route.tags.bridge !== 'no' ? Math.max(this.heightAt(route.points[0]!), this.heightAt(route.points.at(-1)!)) : area.sample(x, z);
    });
    if (!this.rails) { this.rails = new Mesh(geometry, new MeshStandardMaterial({ color: '#78827c', roughness: .7 }));this.group.add(this.rails); }
    else { this.rails.geometry.dispose();this.rails.geometry = geometry; }
    this.railsDirty = false;
  }
  private choose(): void {
    if (!this.camera || this.reduced || this.density === 'off' && !this.trams) return;
    this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    const candidates = new Map<string, { route: AgentRoute; distance: number; score: number; kind: Agent['kind'] }>();
    const range = this.camera.position.distanceTo(this.target), near = range < 1600;
    const previous = new Map(this.agents.map((a) => [a.id, a]));
    const add = (route: AgentRoute, kind: Agent['kind']): void => {
      const seeds = kind === 'tram' ? 1 : Math.min(6, Math.max(1, Math.floor(route.length / (kind === 'pedestrian' ? 18 : 50))));
      for (let i = 0; i < seeds; i++) {
        const id = `${route.id}#${i}`, existing = previous.get(id);
        // Espacement régulier avec décalage déterministe ; jamais tous au même point.
        const margin = kind === 'tram' ? 13 : 1;
        let distance = existing?.distance ?? margin + (route.length - margin * 2) * ((i + .35) / seeds);
        if (!existing && kind === 'tram') {
          let best = Infinity;
          for (let j = 1; j < route.points.length; j++) {
            const a = route.points[j - 1]!, b = route.points[j]!, dx = b[0] - a[0], dz = b[1] - a[1];
            const t = Math.max(0, Math.min(1, ((this.target.x - a[0]) * dx + (this.target.z - a[1]) * dz) / (dx * dx + dz * dz)));
            const score = Math.hypot(this.target.x - a[0] - t * dx, this.target.z - a[1] - t * dz);
            if (score < best) { best = score;distance = Math.max(margin, Math.min(route.length - margin, route.distances[j - 1]! + t * (route.distances[j]! - route.distances[j - 1]!))); }
          }
        }
        const pose = pathPose(route, distance), area = this.areaAt(pose.x, pose.z);
        if (!area || kind !== 'tram' && area.lod !== 'near') continue;
        const bridge = route.tags.bridge && route.tags.bridge !== 'no';
        const level = route.deck ?? (kind === 'tram' && bridge ? Math.max(this.heightAt(route.points[0]!), this.heightAt(route.points.at(-1)!)) : area.sample(pose.x, pose.z));
        if (!Number.isFinite(level)) continue;
        this.point.set(pose.x, level + 1, pose.z);
        if (!existing && kind !== 'tram' && this.point.distanceTo(this.camera!.position) < 8) continue;
        const score = this.point.distanceTo(this.target);
        if (score > (kind === 'tram' ? 1800 : range < 50 ? 180 : 550) || !this.frustum.containsPoint(this.point)) continue;
        candidates.set(id, { route, distance, score: score + (existing ? -30 : 0), kind });
      }
    };
    if (near && this.density !== 'off') for (const routes of this.paths.values()) for (const route of routes) add(route, route.kind!);
    if (range < 4000 && this.trams) for (const route of this.tramRoutes) add(route, 'tram');
    const ordered = [...candidates.entries()].sort((a, b) => a[1].score - b[1].score || a[0].localeCompare(b[0]));
    const keep = new Set<string>();
    for (const kind of ['pedestrian', 'cyclist', 'tram'] as const) {
      const limit = agentBudget(kind, kind === 'tram' ? this.trams ? 'normal' : 'off' : this.density, this.mobile, this.hour);
      for (const [id, candidate] of ordered.filter(([, c]) => c.kind === kind).slice(0, limit)) {
        keep.add(id);
        if (previous.has(id)) continue;
        const style = agentStyle(id, kind === 'tram' ? 'cyclist' : kind);
        this.agents.push({ id, route: candidate.route, kind, distance: candidate.distance, direction: 1, angle: pathPose(candidate.route, candidate.distance).angle, fade: 0, speed: kind === 'tram' ? 5 : style.speed, phase: style.phase, height: kind === 'tram' ? 1 : style.height, wait: 0, stopped: new Set(), finished: false });
      }
    }
    // Une seule réserve bornée ; la disparition se fait en douceur avant remplacement.
    this.agents = this.agents.filter((a) => keep.has(a.id) || a.fade > .01);
    const capacities = { pedestrian: this.density === 'low' ? this.mobile ? 12 : 30 : this.mobile ? 40 : 100, cyclist: this.density === 'low' ? this.mobile ? 4 : 8 : this.mobile ? 10 : 25, tram: this.mobile ? 2 : 4 };
    this.agents = this.agents.filter((a) => { if (capacities[a.kind] <= 0) return false;capacities[a.kind]--;return true; });
    this.wanted = keep;
  }
  private wanted = new Set<string>();
  private areaAt(x: number, z: number): Area | undefined { return this.areas.get(`${Math.floor(x / 500)}_${Math.floor(z / 500)}`); }
  private mesh(kind: Agent['kind']): InstancedMesh {
    let mesh = this.meshes.get(kind);if (mesh) return mesh;
    const capacity = kind === 'tram' ? (this.mobile ? 2 : 4) * 3 : kind === 'pedestrian' ? this.mobile ? 40 : 100 : this.mobile ? 10 : 25;
    const geometry = agentModel(kind), material = animatedAgentMaterial(geometry, capacity, this.time);
    mesh = new InstancedMesh(geometry, material, capacity);mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.frustumCulled = false;mesh.castShadow = false;mesh.receiveShadow = true;this.meshes.set(kind, mesh);this.group.add(mesh);return mesh;
  }
  update(seconds: number): void {
    if (this.disposed || this.reduced || this.density === 'off' && !this.trams) return;
    this.profile.measure('agents-update', 'urban', () => this.advance(seconds));
  }
  private advance(seconds: number): void {
    const dt = Math.min(.25, Math.max(0, seconds));this.time.value += dt;
    if (this.time.value - this.lastSelection > 1) { this.choose();this.lastSelection = this.time.value; }
    const counts = { pedestrian: 0, cyclist: 0, tram: 0 };
    this.tramCount = 0;
    for (const agent of this.agents) {
      const margin = agent.kind === 'tram' ? 13 : 1;
      let next = agent.distance;
      if (agent.wait > 0) agent.wait -= dt;
      else if (!agent.finished) next += dt * agent.speed * agent.direction;
      if (agent.route.closed) next = (next + agent.route.length) % agent.route.length;
      else if (next > agent.route.length - margin || next < margin) {
        next = Math.max(margin, Math.min(agent.route.length - margin, next));
        if (agent.kind === 'tram' || agent.route.oneWay) agent.finished = true;
        else { agent.direction *= -1;agent.wait = 1; }
      }
      if (agent.kind === 'tram' && !agent.finished && agent.wait <= 0) for (const stop of agent.route.stops ?? []) {
        if (!agent.stopped.has(stop.id) && agent.distance <= stop.distance && next >= stop.distance && stop.distance >= margin && stop.distance <= agent.route.length - margin) { next = stop.distance;agent.wait = 3;for (const nearby of agent.route.stops ?? []) if (Math.abs(nearby.distance - stop.distance) < 12) agent.stopped.add(nearby.id);break; }
      }
      const pose = pathPose(agent.route, next, agent.direction), area = this.areaAt(pose.x, pose.z);
      const available = !!area && (agent.kind === 'tram' ? [-8.2, 0, 8.2].every((offset) => { const p = pathPose(agent.route, next + offset); return !!this.areaAt(p.x, p.z); }) : area.lod === 'near');
      if (available) agent.distance = next;
      const turn = Math.atan2(Math.sin(pose.angle - agent.angle), Math.cos(pose.angle - agent.angle));
      agent.angle += Math.max(-dt * 3.5, Math.min(dt * 3.5, turn));
      const wanted = !!available && this.wanted.has(agent.id) && (agent.kind === 'tram' ? this.trams : this.density !== 'off');
      agent.fade = Math.max(0, Math.min(1, agent.fade + (wanted ? dt : -dt) / 1.5));
      if (agent.fade <= .001) continue;
      const current = pathPose(agent.route, agent.distance);
      if (!this.areaAt(current.x, current.z)) continue;
      const mesh = this.mesh(agent.kind), sections = agent.kind === 'tram' ? 3 : 1;
      let visible = false;
      for (let section = 0; section < sections; section++) {
        const at = pathPose(agent.route, agent.distance + (section - 1) * (agent.kind === 'tram' ? 8.2 : 0), agent.direction), support = this.areaAt(at.x, at.z);
        if (!support) continue;
        const bridge = agent.route.tags.bridge && agent.route.tags.bridge !== 'no';
        const level = agent.route.deck ?? (bridge && agent.kind === 'tram' ? Math.max(this.heightAt(agent.route.points[0]!), this.heightAt(agent.route.points.at(-1)!)) : support.sample(at.x, at.z));
        if (!Number.isFinite(level)) continue;
        this.dummy.position.set(at.x, level + (agent.kind === 'tram' ? .05 : .1), at.z);this.dummy.rotation.set(0, agent.kind === 'tram' ? at.angle : agent.angle, 0);
        this.dummy.scale.set(agent.fade * (agent.kind === 'pedestrian' ? .94 + agent.phase % .13 : 1), agent.fade * agent.height, agent.fade);this.dummy.updateMatrix();
        visible = true;const i = counts[agent.kind]++;mesh.setMatrixAt(i, this.dummy.matrix);mesh.setColorAt(i, agent.kind === 'tram' ? this.white : this.colors[Math.floor(agent.phase * 100) % this.colors.length]!);
        const motion = mesh.geometry.getAttribute('agentMotion');motion.setXY(i, agent.phase, agent.wait > 0 || agent.finished ? 0 : agent.speed * (agent.kind === 'pedestrian' ? 4.2 : 3));
      }
      if (visible && agent.kind === 'tram') this.tramCount++;
    }
    this.meshes.forEach((mesh, kind) => { mesh.count = counts[kind];mesh.visible = mesh.count > 0;mesh.instanceMatrix.needsUpdate = true;if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;mesh.geometry.getAttribute('agentMotion').needsUpdate = true; });
  }
  private heightAt(p: [number, number]): number { return this.areaAt(p[0], p[1])?.sample(p[0], p[1]) ?? NaN; }
  private tramCount = 0;
  get counts(): { pedestrian: number; cyclist: number; tram: number } { return { pedestrian: this.meshes.get('pedestrian')?.count ?? 0, cyclist: this.meshes.get('cyclist')?.count ?? 0, tram: this.tramCount }; }
  get active(): boolean { return !this.reduced && this.agents.some((a) => this.wanted.has(a.id) ? !a.finished || a.fade < 1 : a.fade > .001); }
  get drawCalls(): number { return (this.rails?.visible && this.rails.geometry.getAttribute('position').count ? 1 : 0) + [...this.meshes.values()].filter((m) => m.visible && m.count).length; }
  get bytes(): number { let bytes = 0;if (this.rails) Object.values(this.rails.geometry.attributes).forEach((a) => { bytes += a.array.byteLength; });this.meshes.forEach((m) => { bytes += m.instanceMatrix.array.byteLength + (m.instanceColor?.array.byteLength ?? 0);Object.values(m.geometry.attributes).forEach((a) => { bytes += a.array.byteLength; });bytes += m.geometry.index?.array.byteLength ?? 0; });return bytes; }
  get positions(): { id: string; kind: Agent['kind']; x: number; z: number; distance: number; direction: number }[] {
    return this.agents.filter((a) => a.fade > .01).map((a) => { const p = pathPose(a.route, a.distance, a.direction);return { id: a.id, kind: a.kind, x: p.x, z: p.z, distance: a.distance, direction: a.direction }; });
  }
  get status(): string { return this.failure ? 'Certaines données d’activité sont indisponibles.' : this.pending.size || this.loading ? 'Chargement des chemins OSM…' : 'Densités et déplacements estimés, sans horaires réels.'; }
  dispose(): void { this.disposed = true;this.request.abort();this.pending.forEach((c) => c.abort());this.pending.clear();this.areas.clear();this.paths.clear();this.tramRoutes = [];this.agents = [];this.meshes.forEach((m) => { m.dispose();m.geometry.dispose();(m.material as MeshStandardMaterial).dispose(); });this.meshes.clear();this.rails?.geometry.dispose();(this.rails?.material as MeshStandardMaterial | undefined)?.dispose();this.rails = undefined;this.tramCount = 0;this.group.clear(); }
}
