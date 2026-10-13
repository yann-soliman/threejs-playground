"""Chemins d'activité et voies de tram OSM, assets statiques complémentaires V6.
Même PBF Geofabrik et projection que prepare_city.py ; aucun téléchargement implicite.
"""
import argparse
import hashlib
import json
from datetime import date
from collections import defaultdict
from pathlib import Path

import osmium
from shapely import make_valid
from shapely.geometry import LineString, Point, Polygon, box, shape
from shapely.ops import transform
from shapely.strtree import STRtree
from prepare_city import SOURCE, ROOT, project, points, lines, dump, tile_range, tile_id

KEEP = ['highway', 'railway', 'public_transport', 'name', 'ref', 'foot', 'bicycle',
        'access', 'vehicle', 'motor_vehicle', 'cycleway', 'cycleway:left', 'cycleway:right',
        'sidewalk', 'sidewalk:left', 'sidewalk:right', 'oneway', 'oneway:bicycle',
        'bridge', 'tunnel', 'layer', 'width', 'lanes', 'surface', 'service', 'tram', 'area', 'gauge', 'electrified', 'railway:preferred_direction', 'ele']
DENIED = {'no', 'private', 'customers', 'use_sidepath', 'dismount'}


def eligible(tags, mode):
    access = tags.get('foot' if mode == 'pedestrian' else 'bicycle', tags.get('vehicle', tags.get('access', '')) if mode == 'cyclist' else tags.get('access', ''))
    if access in DENIED or tags.get('tunnel', 'no') != 'no' or float(tags.get('layer', '0')) < 0:
        return False
    if float(tags.get('layer', '0')) > 0 and tags.get('bridge', 'no') == 'no':
        return False
    h = tags.get('highway')
    if mode == 'pedestrian':
        return h in {'footway', 'pedestrian', 'path', 'living_street', 'residential'} or h == 'cycleway' and access in {'yes', 'designated', 'permissive'}
    return h in {'cycleway', 'living_street', 'residential', 'unclassified', 'tertiary', 'secondary'} or h in {'path', 'footway', 'pedestrian'} and access in {'yes', 'designated', 'permissive'}


def connected_tracks(segments):
    """Chaînes maximales de degré 2 : jonctions par identifiant de nœud OSM, jamais par proximité."""
    adjacent = defaultdict(list)
    for i, s in enumerate(segments):
        for n in (s['nodes'][0], s['nodes'][-1]):
            adjacent[(n, s['tags'].get('layer', '0'))].append(i)
    visited, routes = set(), []
    for first, original in enumerate(segments):
        if first in visited:
            continue
        s = original
        layer = s['tags'].get('layer', '0')
        # Commencer à un bout de degré différent de 2 lorsque possible.
        reverse = len(adjacent[(s['nodes'][-1], layer)]) != 2 and len(adjacent[(s['nodes'][0], layer)]) == 2
        if s['tags'].get('oneway') in {'yes', '1', 'true'}:
            reverse = False
        elif s['tags'].get('oneway') == '-1':
            reverse = True
        coords = list(reversed(s['points'])) if reverse else list(s['points'])
        nodes = list(reversed(s['nodes'])) if reverse else list(s['nodes'])
        ids = [s['id']]
        visited.add(first)
        for prepend in (False, True):
            while len(adjacent[(nodes[0] if prepend else nodes[-1], layer)]) == 2:
                end = nodes[0] if prepend else nodes[-1]
                choices = [i for i in adjacent[(end, layer)] if i not in visited]
                if not choices:
                    break
                i = choices[0]; part = segments[i]
                # Conserver les tabliers séparés des sections au sol.
                if (part['tags'].get('bridge', 'no') != 'no') != (s['tags'].get('bridge', 'no') != 'no'):
                    break
                forward = part['nodes'][0] == end
                travels_forward = forward != prepend
                if part['tags'].get('oneway') in {'yes', '1', 'true'} and not travels_forward or part['tags'].get('oneway') == '-1' and travels_forward:
                    break
                p = part['points'] if forward else list(reversed(part['points']))
                n = part['nodes'] if forward else list(reversed(part['nodes']))
                if prepend:
                    coords = list(reversed(p[1:])) + coords; nodes = list(reversed(n[1:])) + nodes; ids.insert(0, part['id'])
                else:
                    coords += p[1:]; nodes += n[1:]; ids.append(part['id'])
                visited.add(i)
        routes.append({'id': '|'.join(ids), 'osmIds': ids, 'nodes': nodes, 'points': coords,
                       'tags': s['tags'], 'closed': nodes[0] == nodes[-1]})
    return routes


def obstacle_index(city):
    obstacles, water, seen = [], set(), set()
    for path in sorted((city / 'tiles').glob('*.near.json')):
        data = json.loads(path.read_text())
        for f in data['buildings'] + [f for f in data['surfaces'] if f['kind'] == 'water' or f['tags'].get('access') in DENIED or f['tags'].get('foot') in DENIED]:
            if f['id'] in seen:
                continue
            seen.add(f['id']);g = make_valid(Polygon(f['rings'][0], f['rings'][1:])).buffer(.38)
            if not g.is_empty:
                if f.get('kind') == 'water':
                    water.add(len(obstacles))
                obstacles.append(g)
        for wall in data['walls']:
            if wall['id'] not in seen:
                seen.add(wall['id']);obstacles.append(LineString(wall['points']).buffer(.5))
    return STRtree(obstacles), water


def safe_parts(line, tree, bridge=False, water=frozenset(), padding=0):
    # Les ponts sont admis seulement si leur tablier V4B existe ; pas de fond de fleuve.
    for index in tree.query(line.buffer(padding) if padding else line):
        if not bridge or index not in water:
            line = line.difference(tree.geometries[index].buffer(padding) if padding else tree.geometries[index])
    return [part for part in lines(line) if part.length >= 12]


def prepare(pbf, city, output, boundary_path, prepared_at=None):
    boundary = transform(project, shape(json.loads(boundary_path.read_text())['geometry']))
    manifest = json.loads((city / 'manifest.json').read_text())
    raw_hash = hashlib.file_digest(pbf.open('rb'), 'sha256').hexdigest()
    if raw_hash != manifest['meta']['rawSha256']:
        raise ValueError('Le PBF doit correspondre au snapshot des bâtiments et du relief ; régénérer Nantes avant la mobilité')
    terrain = json.loads((city / 'terrain/overview.json').read_text())
    decks = terrain['bridgeLevels'];tree, water = obstacle_index(city)
    paths = defaultdict(list);tracks = [];stops = []
    processor = osmium.FileProcessor(pbf).with_locations().with_filter(osmium.filter.KeyFilter('highway', 'railway', 'public_transport'))
    timestamp = processor.header.get('osmosis_replication_timestamp')
    for obj in processor:
        tags = {t.k: t.v for t in obj.tags if t.k in KEEP}
        if obj.is_node():
            if tags.get('railway') == 'tram_stop' or tags.get('tram') == 'yes' and tags.get('public_transport') == 'stop_position':
                p = project(obj.location.lon, obj.location.lat)
                if boundary.covers(Point(p)):
                    stops.append({'id': f'node/{obj.id}', 'point': [round(v, 2) for v in p], 'tags': tags})
            continue
        if not obj.is_way():
            continue
        try:
            coords = [project(n.lon, n.lat) for n in obj.nodes]
            if len(coords) < 2:
                continue
            line = LineString(coords)
            if not boundary.intersects(line):
                continue
            identifier = f'way/{obj.id}'
            if tags.get('railway') == 'tram' and tags.get('tunnel', 'no') == 'no' and float(tags.get('layer', '0')) >= 0:
                # Aucun nœud créé au contour : on conserve seulement les vrais segments internes.
                run_points, run_nodes = [], []
                for node, coord in zip(obj.nodes, coords):
                    if boundary.covers(Point(coord)):
                        run_points.append([round(v, 2) for v in coord]);run_nodes.append(node.ref)
                    else:
                        if len(run_points) > 1:
                            tracks.append({'id': identifier + f'/{len(tracks)}', 'points': run_points, 'nodes': run_nodes, 'tags': tags})
                        run_points, run_nodes = [], []
                if len(run_points) > 1:
                    tracks.append({'id': identifier, 'points': run_points, 'nodes': run_nodes, 'tags': tags})
            if tags.get('area') == 'yes':
                continue
            for mode in ('pedestrian', 'cyclist'):
                if not eligible(tags, mode):
                    continue
                bridge = tags.get('bridge', 'no') != 'no'
                deck = next((value for key, value in decks.items() if key.startswith(identifier + '/')), None) if bridge else None
                if bridge and deck is None:
                    continue
                # Sur rue partagée, placer les passants au bord de chaussée ; géométrie estimée.
                offset = 0
                if mode == 'pedestrian' and tags.get('highway') in {'residential', 'living_street'}:
                    offset = 2.2 if tags.get('highway') == 'residential' else 1.3
                source = line.offset_curve(offset, join_style=2) if offset else line
                for i, part in enumerate(safe_parts(source.intersection(boundary), tree, bridge, water, .45 if mode == 'cyclist' else 0)):
                    route = {'id': f'{identifier}/{mode}/{i}', 'osmIds': [identifier], 'points': points(part.coords), 'tags': tags, 'offsetEstimated': offset != 0}
                    if deck is not None:
                        route['deck'] = deck
                    for x, z in tile_range(part.bounds):
                        tile = tile_id(x, z)
                        if any(t['id'] == tile for t in manifest['tiles']) and part.intersects(box(x*500, z*500, (x+1)*500, (z+1)*500)):
                            paths[tile].append({**route, 'kind': mode})
        except (RuntimeError, ValueError):
            continue
    tram_routes = connected_tracks(sorted(tracks, key=lambda s: s['id']))
    # Les arrêts sont rattachés seulement aux voies proches ; aucune correspondance distante.
    for route in tram_routes:
        line = LineString(route['points'])
        route['stops'] = [{**s, 'distance': round(line.project(Point(s['point'])), 2)} for s in stops if line.distance(Point(s['point'])) <= 12]
        route['length'] = round(line.length, 2)
    meta = {'source': SOURCE, 'osmTimestamp': timestamp, 'extractedAt': timestamp, 'preparedAt': prepared_at or date.today().isoformat(),
            'rawSha256': raw_hash, 'license': 'ODbL-1.0',
            'origin': manifest['meta']['origin'], 'boundarySha256': manifest['meta']['boundarySha256']}
    total = 0
    entries = {}
    for tile, routes in sorted(paths.items()):
        url = f'tiles/{tile}.json';total += dump(output / url, {'routes': sorted(routes, key=lambda r: r['id'])});entries[tile] = url
    total += dump(output / 'trams.json', {'meta': meta, 'segments': tracks, 'routes': tram_routes, 'stops': stops})
    unique = {r['id']: r for rs in paths.values() for r in rs}
    stats = {'pedestrian': sum(r['kind'] == 'pedestrian' for r in unique.values()), 'cyclist': sum(r['kind'] == 'cyclist' for r in unique.values()), 'trackSegments': len(tracks), 'tramRoutes': len(tram_routes), 'stops': len(stops), 'bytes': total}
    dump(output / 'manifest.json', {'version': 1, 'meta': meta, 'tiles': entries, 'trams': 'trams.json', 'counts': stats})
    print(json.dumps(stats, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pbf', type=Path, default=Path('work/v3/region.osm.pbf'))
    parser.add_argument('--city', type=Path, default=Path('public/nantes'))
    parser.add_argument('--output', type=Path, default=Path('public/nantes/mobility'))
    parser.add_argument('--boundary', type=Path, default=ROOT / 'data/municipality.geojson')
    parser.add_argument('--prepared-at', help='Date de préparation à conserver pour reproduction octet par octet')
    args = parser.parse_args();prepare(args.pbf, args.city, args.output, args.boundary, args.prepared_at)


if __name__ == '__main__':
    main()
