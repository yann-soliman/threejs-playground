"""Extraction OSM reproductible, sans dépendance : Python 3.12+.
Ne contacte Overpass qu'avec --refresh ; le traitement local est déterministe.
"""
import argparse
import datetime
import gzip
import hashlib
import json
import math
from pathlib import Path
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BBOX = [47.2120, -1.5580, 47.2192, -1.5468]
ENDPOINT = 'https://overpass-api.de/api/interpreter'


def query(bbox):
    box = ','.join(map(str, bbox))
    selectors = ['nwr[building]', 'way[highway]', 'nwr[landuse]',
                 'nwr[leisure]', 'nwr[natural]', 'nwr[waterway]', 'way[barrier=wall]', 'way[historic=citywalls]']
    return '[out:json][timeout:60];(' + ''.join(f'{s}({box});' for s in selectors) + ');out geom;'


def area(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1])) / 2


def inside(point, ring):
    x, y = point
    result = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if (a[1] > y) != (b[1] > y) and x < (b[0]-a[0]) * (y-a[1]) / (b[1]-a[1]) + a[0]:
            result = not result
    return result


def stitch(parts):
    """Raccorde les ways d'une relation, y compris les orientations inversées."""
    parts = [p[:] for p in parts if len(p) >= 2]
    rings = []
    while parts:
        ring = parts.pop(0)
        while ring[0] != ring[-1]:
            match = next((i for i, p in enumerate(parts) if ring[-1] in (p[0], p[-1])), None)
            if match is None:
                break
            p = parts.pop(match)
            ring += (p if p[0] == ring[-1] else p[::-1])[1:]
        if ring[0] == ring[-1] and len(ring) >= 4:
            rings.append(ring[:-1])
    return rings


def clip_ring(ring, width, depth):
    # Sutherland–Hodgman ; les rares contours concaves coupés restent documentés.
    for axis, limit, sign in [(0, -width/2, 1), (0, width/2, -1), (1, -depth/2, 1), (1, depth/2, -1)]:
        result = []
        for a, b in zip(ring, ring[1:] + ring[:1]):
            ina, inb = (a[axis]-limit)*sign >= 0, (b[axis]-limit)*sign >= 0
            if ina:
                result.append(a)
            if ina != inb:
                t = (limit-a[axis]) / (b[axis]-a[axis])
                result.append([a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1])])
        ring = result
    clean = []
    for p in ring:
        p = [round(v, 2) for v in p]
        if not clean or p != clean[-1]:
            clean.append(p)
    if clean and clean[0] == clean[-1]:
        clean.pop()
    return clean if len(clean) >= 3 and abs(area(clean)) > 1 else []


def clip_line(points, width, depth):
    lines, current = [], []
    for a, b in zip(points, points[1:]):
        dx, dy = b[0]-a[0], b[1]-a[1]
        low, high = 0, 1
        valid = True
        for p, q in [(-dx, a[0]+width/2), (dx, width/2-a[0]), (-dy, a[1]+depth/2), (dy, depth/2-a[1])]:
            if p == 0:
                if q < 0:
                    valid = False
            elif p < 0:
                low = max(low, q/p)
            else:
                high = min(high, q/p)
        if valid and low < high:
            start, end = [[round(a[0]+t*dx, 2), round(a[1]+t*dy, 2)] for t in (low, high)]
            if current and current[-1] != start:
                lines.append(current)
                current = []
            if not current:
                current.append(start)
            if end != start:
                current.append(end)
        elif current:
            lines.append(current)
            current = []
    if current:
        lines.append(current)
    return [line for line in lines if len(line) > 1]


def prepare(raw, bbox, extracted_at):
    south, west, north, east = bbox
    lat, lon = (south+north)/2, (west+east)/2
    scale = 6371008.8 * math.pi / 180
    width, depth = (east-west)*scale*math.cos(math.radians(lat)), (north-south)*scale
    def project(p):
        return [(p['lon']-lon)*scale*math.cos(math.radians(lat)), -(p['lat']-lat)*scale]
    elements = raw['elements']
    if raw.get('remark'):
        raise ValueError('Réponse Overpass incomplète : ' + raw['remark'])
    buildings, surfaces, roads, trees, walls = [], [], [], [], []
    consumed = set()
    # Les ways membres d'une relation polygonale ne doivent pas être extrudés deux fois.
    for e in elements:
        if e['type'] == 'relation' and e.get('tags', {}).get('type') == 'multipolygon':
            consumed.update(m['ref'] for m in e.get('members', []) if m['type'] == 'way')
    skipped = []
    kept_tags = ['name', 'building', 'height', 'min_height', 'building:levels', 'roof:shape',
                 'roof:height', 'building:colour', 'building:material', 'roof:colour',
                 'barrier', 'highway', 'width', 'lanes', 'surface', 'landuse', 'leisure', 'natural', 'water', 'waterway', 'historic']
    for e in elements:
        tags = e.get('tags', {})
        factual = {k: tags[k] for k in kept_tags if k in tags}
        identifier = f"{e['type']}/{e['id']}"
        if e['type'] == 'node':
            if tags.get('natural') == 'tree':
                trees.append(project(e))
            continue
        if e['type'] == 'way' and e['id'] in consumed:
            continue
        geometry = e.get('geometry', [])
        if tags.get('barrier') == 'wall' or tags.get('historic') == 'citywalls':
            for line in clip_line([project(p) for p in geometry], width, depth):
                walls.append({'id': identifier, 'points': line, 'tags': factual})
            if 'building' not in tags:
                continue
        if tags.get('highway') and tags.get('area') != 'yes':
            for line in clip_line([project(p) for p in geometry], width, depth):
                roads.append({'id': identifier, 'points': line, 'tags': factual})
            continue
        if e['type'] == 'relation':
            members = e.get('members', [])
            outer = stitch([[project(p) for p in m.get('geometry', [])] for m in members if m.get('role', '') in ('outer', '') and m['type'] == 'way'])
            inner = stitch([[project(p) for p in m.get('geometry', [])] for m in members if m.get('role') == 'inner' and m['type'] == 'way'])
        elif len(geometry) >= 4 and geometry[0] == geometry[-1]:
            outer, inner = [[project(p) for p in geometry[:-1]]], []
        else:
            if 'building' in tags:
                skipped.append(identifier)
            continue
        kind = ('building' if 'building' in tags else 'water' if tags.get('natural') == 'water' or tags.get('waterway') in ('riverbank', 'dock')
                else 'green' if tags.get('landuse') in ('grass', 'forest', 'meadow', 'recreation_ground') or tags.get('leisure') in ('park', 'garden') or tags.get('natural') in ('wood', 'scrub', 'grassland')
                else 'plaza' if tags.get('highway') in ('pedestrian', 'footway') else None)
        if not kind:
            continue
        for i, ring in enumerate(outer):
            clipped = clip_ring(ring, width, depth)
            if not clipped:
                continue
            holes = [clip_ring(h, width, depth) for h in inner if inside(h[0], ring)]
            feature = {'id': identifier + (f'/{i}' if len(outer) > 1 else ''), 'rings': [clipped] + [h for h in holes if h], 'tags': factual}
            if kind == 'building':
                buildings.append(feature)
            else:
                surfaces.append({**feature, 'kind': kind})
    buildings.sort(key=lambda b: b['id'])
    result = {'meta': {'bbox': bbox, 'origin': [lat, lon], 'width': round(width, 2), 'depth': round(depth, 2),
                       'extractedAt': extracted_at, 'osmTimestamp': raw.get('osm3s', {}).get('timestamp_osm_base'),
                       'source': ENDPOINT, 'license': 'ODbL-1.0', 'query': query(bbox),
                       'rawSha256': hashlib.sha256(json.dumps(raw, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
                       'skippedBuildings': skipped, 'projection': 'Équirectangulaire locale en mètres ; X est, Z sud'},
              'buildings': buildings, 'surfaces': surfaces, 'roads': roads, 'walls': walls,
              'trees': [[round(v, 2) for v in p] for p in trees if abs(p[0]) <= width/2 and abs(p[1]) <= depth/2]}
    if not buildings:
        raise ValueError('Aucun bâtiment : extraction refusée')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--bbox', nargs=4, type=float, default=DEFAULT_BBOX, metavar=('S', 'W', 'N', 'E'))
    parser.add_argument('--snapshot', type=Path, default=ROOT / 'data/osm-snapshot.json.gz')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/city.json')
    parser.add_argument('--input', type=Path, help='Importer une réponse Overpass JSON locale')
    args = parser.parse_args()
    s, w, n, e = args.bbox
    if not (-90 <= s < n <= 90 and -180 <= w < e <= 180):
        parser.error('Emprise invalide')
    if (n-s)*111200 > 1500 or (e-w)*111200*math.cos(math.radians((s+n)/2)) > 1500:
        parser.error('Limiter chaque extraction à 1500 mètres par côté')
    if args.refresh or args.input:
        if args.input:
            raw = json.loads(args.input.read_text())
        else:
            request = urllib.request.Request(ENDPOINT, data=urllib.parse.urlencode({'data': query(args.bbox)}).encode(), headers={'User-Agent': 'Nantes3D-playground/1.0 (github.com/yann-soliman/threejs-playground)'})
            # Une requête limitée, aucun retry automatique ; respecter Retry-After / statut Overpass.
            with urllib.request.urlopen(request, timeout=90) as response:
                raw = json.load(response)
        extracted_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        prepared = prepare(raw, args.bbox, extracted_at)
        envelope = {'bbox': args.bbox, 'extractedAt': extracted_at, 'osm': raw}
        args.snapshot.parent.mkdir(parents=True, exist_ok=True)
        args.snapshot.write_bytes(gzip.compress(json.dumps(envelope, separators=(',', ':')).encode(), mtime=0))
    else:
        envelope = json.loads(gzip.decompress(args.snapshot.read_bytes()))
        if envelope['bbox'] != args.bbox:
            parser.error('Emprise différente du snapshot ; utiliser --refresh ou --input')
        prepared = prepare(envelope['osm'], args.bbox, envelope['extractedAt'])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(prepared, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps({'buildings': len(prepared['buildings']), 'roads': len(prepared['roads']), 'surfaces': len(prepared['surfaces']), 'trees': len(prepared['trees']), 'bytes': args.output.stat().st_size}))


if __name__ == '__main__':
    main()
