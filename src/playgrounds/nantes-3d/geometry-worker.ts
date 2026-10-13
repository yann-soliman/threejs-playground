import { prepareGeometry } from './geometry-preparation';
import type { GeometryJob, GeometryReply } from './geometry-preparation';
import type { CityModel } from './city';
import type { TerrainOverview } from './terrain';
import { packGeometry } from './geometry-wire';
const scope = self as unknown as { postMessage: (value: GeometryReply, transfer: ArrayBuffer[]) => void; onmessage: ((event: MessageEvent) => void) | null };
let terrain: TerrainOverview | undefined;
// Ce module n'est chargé que par le worker ; aucun contexte WebGL n'y est créé.
scope.onmessage = (event: MessageEvent<{ terrain?: TerrainOverview } & Partial<GeometryJob>>) => {
  if (event.data.terrain) { terrain = event.data.terrain; return; }
  const job = event.data as GeometryJob;
  let model: CityModel | undefined;
  try {
    if (!terrain) throw new Error('Relief du worker absent');
    const start = performance.now(); model = prepareGeometry(job.data, job.lod, terrain, job.overview);
    const packed = packGeometry(model, 0); packed.packet.cpuMs = performance.now() - start; scope.postMessage({ id: job.id, packet: packed.packet }, packed.transfer);
  } catch (error) { scope.postMessage({ id: job.id, error: error instanceof Error ? error.message : String(error) }, []); }
  finally {
    model?.dispose();
  }
};
