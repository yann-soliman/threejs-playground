"""Nantes entière : extrait régional PBF, limite communale et tuiles statiques.
Les téléchargements sont explicites (--download), sans requête Overpass.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import urllib.request

import osmium
from shapely import make_valid
from shapely.geometry import Polygon, LineString, Point, box, shape
from shapely.ops import transform

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://download.geofabrik.de/europe/france/pays-de-la-loire-latest.osm.pbf'
BOUNDARY_SOURCE = 'https://geo.api.gouv.fr/communes/44109?format=geojson&geometry=contour'
ORIGIN = [47.2156, -1.5524]
SCALE = 6371008.8 * math.pi / 180
TILE_SIZE = 500
KEEP = ['name', 'building', 'height', 'min_height', 'building:levels', 'roof:shape',
        'roof:height', 'building:colour', 'building:material', 'roof:colour',
        'barrier', 'highway', 'width', 'lanes', 'surface', 'landuse', 'leisure',
        'natural', 'water', 'waterway', 'historic', 'bridge', 'tunnel', 'layer',
        'oneway', 'access', 'motor_vehicle', 'vehicle', 'junction', 'maxspeed']


def project(lon, lat, z=None):
    return ((lon - ORIGIN[1]) * SCALE * math.cos(math.radians(ORIGIN[0])),
            -(lat - ORIGIN[0]) * SCALE)


def polygons(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == 'Polygon':
        return [geometry] if geometry.area > 1 else []
    return [p for part in getattr(geometry, 'geoms', []) for p in polygons(part)]


def lines(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == 'LineString':
        return [geometry] if geometry.length > .1 else []
    return [p for part in getattr(geometry, 'geoms', []) for p in lines(part)]


def points(coords):
    result = []
    for x, z in coords:
        p = [round(x, 2), round(z, 2)]
        if not result or p != result[-1]:
            result.append(p)
    return result


def rings(poly):
    return [points(poly.exterior.coords)[:-1]] + [points(h.coords)[:-1] for h in poly.interiors]


def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    return path.stat().st_size


def tile_id(x, z):
    return f'{x}_{z}'


def tile_range(bounds):
    a, b, c, d = bounds
    for x in range(math.floor(a / TILE_SIZE), math.floor(c / TILE_SIZE) + 1):
        for z in range(math.floor(b / TILE_SIZE), math.floor(d / TILE_SIZE) + 1):
            yield x, z


def kind(tags):
    if 'building' in tags and tags['building'] != 'no':
        return 'building'
    if tags.get('natural') == 'water' or tags.get('waterway') in ('riverbank', 'dock'):
        return 'water'
    if tags.get('landuse') in ('grass', 'forest', 'meadow', 'recreation_ground', 'village_green') or tags.get('leisure') in ('park', 'garden', 'pitch') or tags.get('natural') in ('wood', 'scrub', 'grassland'):
        return 'green'
    if tags.get('highway') in ('pedestrian', 'footway'):
        return 'plaza'
    return None


def extract(pbf, boundary):
    factory = osmium.geom.GeoJSONFactory()
    result = {'buildings': [], 'surfaces': [], 'roads': [], 'walls': [], 'trees': []}
    skipped = []
    consumed = set()
    for relation in osmium.FileProcessor(pbf, entities=osmium.osm.RELATION).with_filter(osmium.filter.KeyFilter(*KEEP)):
        if kind(dict(relation.tags)) and relation.tags.get('type') == 'multipolygon':
            consumed.update(m.ref for m in relation.members if m.type == 'w')
    processor = osmium.FileProcessor(pbf).with_locations().with_areas(osmium.filter.KeyFilter(*KEEP)).with_filter(osmium.filter.KeyFilter(*KEEP))
    timestamp = processor.header.get('osmosis_replication_timestamp')
    bounds = boundary.bounds
    for obj in processor:
        tags = {t.k: t.v for t in obj.tags if t.k in KEEP}
        if obj.is_node():
            if tags.get('natural') == 'tree':
                p = project(obj.location.lon, obj.location.lat)
                if boundary.covers(Point(p)):
                    result['trees'].append([round(v, 2) for v in p])
        elif obj.is_way():
            target = 'walls' if tags.get('barrier') == 'wall' or tags.get('historic') == 'citywalls' else 'roads' if tags.get('highway') and not obj.is_closed() else None
            # Les routes fermées non surfaciques restent des lignes (ronds-points).
            if not target and tags.get('highway') and obj.tags.get('area') != 'yes' and not kind(tags) == 'plaza':
                target = 'roads'
            if target:
                try:
                    coords = [project(n.lon, n.lat) for n in obj.nodes]
                    g = LineString(coords)
                    if not box(*bounds).intersects(g):
                        continue
                    for i, line in enumerate(lines(g.intersection(boundary))):
                        result[target].append({'id': f'way/{obj.id}/{i}', 'points': points(line.coords), 'tags': tags})
                except (RuntimeError, ValueError):
                    skipped.append(f'way/{obj.id}')
        elif obj.is_area():
            category = kind(tags)
            if not category:
                continue
            if obj.from_way() and obj.orig_id() in consumed:
                continue
            identifier = f"{'way' if obj.from_way() else 'relation'}/{obj.orig_id()}"
            try:
                geo = json.loads(factory.create_multipolygon(obj))
                # Un test d'emprise WGS84 évite la projection des millions de contours régionaux.
                geographic = shape(geo)
                a, b, c, d = geographic.bounds
                p0, p1 = project(a, d), project(c, b)
                if p1[0] < bounds[0] or p0[0] > bounds[2] or p1[1] < bounds[1] or p0[1] > bounds[3]:
                    continue
                g = transform(project, geographic)
                if not box(*bounds).intersects(g):
                    continue
                g = make_valid(g).intersection(boundary)
                parts = polygons(g)
                for i, poly in enumerate(parts):
                    feature = {'id': identifier + (f'/{i}' if len(parts) > 1 else ''), 'rings': rings(poly), 'tags': tags}
                    if category == 'building':
                        result['buildings'].append(feature)
                    else:
                        result['surfaces'].append({**feature, 'kind': category})
            except (RuntimeError, ValueError) as error:
                skipped.append(identifier)
    for key in ('buildings', 'surfaces', 'roads', 'walls'):
        # Une relation polygonale remplace ses membres lorsque libosmium les assemble.
        result[key].sort(key=lambda f: f['id'])
    result['trees'] = sorted(set(tuple(p) for p in result['trees']))
    if not result['buildings'] or len(result['buildings']) < 10000:
        raise ValueError('Extraction municipale incomplète : moins de 10 000 bâtiments')
    return result, timestamp, sorted(set(skipped))


def feature_polygon(feature):
    return make_valid(Polygon(feature['rings'][0], feature['rings'][1:]))


def generate(data, boundary, output, meta):
    tiles = {}
    for x, z in tile_range(boundary.bounds):
        bounds = [x * TILE_SIZE, z * TILE_SIZE, (x + 1) * TILE_SIZE, (z + 1) * TILE_SIZE]
        if boundary.intersection(box(*bounds)).area > .01:
            tiles[tile_id(x, z)] = {'x': x, 'z': z, 'bounds': bounds, 'buildings': [], 'surfaces': [], 'roads': [], 'walls': [], 'trees': []}
    for feature in data['buildings']:
        poly = feature_polygon(feature)
        anchor = poly.representative_point()
        owner = tile_id(math.floor(anchor.x / TILE_SIZE), math.floor(anchor.y / TILE_SIZE))
        if owner not in tiles:
            raise ValueError('Bâtiment sans tuile propriétaire : ' + feature['id'])
        tiles[owner]['buildings'].append(feature)
    for feature in data['surfaces']:
        poly = feature_polygon(feature)
        for x, z in tile_range(poly.bounds):
            tile = tiles.get(tile_id(x, z))
            if tile:
                for i, part in enumerate(polygons(poly.intersection(box(*tile['bounds'])))):
                    tile['surfaces'].append({**feature, 'id': feature['id'] + f'@{x}_{z}/{i}', 'rings': rings(part)})
    for key in ('roads', 'walls'):
        for feature in data[key]:
            line = LineString(feature['points'])
            for x, z in tile_range(line.bounds):
                tile = tiles.get(tile_id(x, z))
                if tile:
                    for i, part in enumerate(lines(line.intersection(box(*tile['bounds'])))):
                        tile[key].append({**feature, 'id': feature['id'] + f'@{x}_{z}/{i}', 'points': points(part.coords)})
    for p in data['trees']:
        tiles[tile_id(math.floor(p[0] / TILE_SIZE), math.floor(p[1] / TILE_SIZE))]['trees'].append(p)
    entries = []
    total_bytes = 0
    for identifier, tile in sorted(tiles.items()):
        counts = {k: len(tile[k]) for k in ('buildings', 'surfaces', 'roads', 'walls', 'trees')}
        payload = {k: tile[k] for k in counts}
        payload['meta'] = meta
        urls = {}
        sizes = {}
        for level in ('near', 'medium', 'far'):
            lod = dict(payload)
            if level != 'near':
                simplified = []
                for feature in tile['buildings']:
                    parts = polygons(feature_polygon(feature).simplify(.35 if level == 'medium' else 1.2, preserve_topology=True))
                    if not parts:
                        simplified.append(feature)
                    for i, poly in enumerate(parts):
                        simplified.append({**feature, 'rings': rings(poly)})
                lod['buildings'] = simplified
                lod['trees'] = tile['trees'][::3] if level == 'medium' else []
                if level == 'far':
                    lod['walls'] = []
                    lod['roads'] = [r for r in tile['roads'] if r['tags'].get('highway') in ('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'pedestrian')]
            filename = f'tiles/{identifier}.{level}.json'
            sizes[level] = dump(output / filename, lod)
            total_bytes += sizes[level]
            urls[level] = filename
        # Les limites réelles des objets incluent les bâtiments chevauchant la grille.
        extents = [tile['bounds']] + [feature_polygon(f).bounds for f in tile['buildings']]
        content_bounds = [min(b[0] for b in extents), min(b[1] for b in extents), max(b[2] for b in extents), max(b[3] for b in extents)]
        entries.append({'id': identifier, 'x': tile['x'], 'z': tile['z'], 'bounds': tile['bounds'], 'contentBounds': content_bounds, 'counts': counts, 'urls': urls, 'bytes': sizes})
    # Vue générale agrégée : aucun téléchargement des empreintes individuelles.
    cells = {}
    for f in data['buildings']:
        poly = feature_polygon(f)
        center = poly.representative_point()
        key = (math.floor(center.x / 100), math.floor(center.y / 100))
        area, height, count = cells.get(key, (0, 0, 0))
        try:
            h = float(f['tags'].get('height', '').replace(' m', ''))
        except ValueError:
            try:
                h = float(f['tags'].get('building:levels', '3')) * 3.15
            except ValueError:
                h = 9.45
        cells[key] = (area + poly.area, height + min(60, max(2, h)), count + 1)
    urban = []
    for (x, z), (area, height, count) in sorted(cells.items()):
        size = min(90, max(12, math.sqrt(area)))
        cx, cz = x * 100 + 50, z * 100 + 50
        for i, poly in enumerate(polygons(box(cx-size/2, cz-size/2, cx+size/2, cz+size/2).intersection(boundary))):
            urban.append({'id': f'aggregate/{x}/{z}/{i}', 'rings': rings(poly), 'tags': {}, 'visual': {'height': round(height/count, 1), 'roofShape': 'flat'}})
    overview = {'meta': meta, 'buildings': urban, 'surfaces': [], 'roads': [], 'walls': [], 'trees': []}
    for feature in data['surfaces']:
        if feature_polygon(feature).area > 2500 or feature['kind'] == 'water':
            for poly in polygons(feature_polygon(feature).simplify(2, preserve_topology=True)):
                overview['surfaces'].append({**feature, 'rings': rings(poly)})
    overview['roads'] = [r for r in data['roads'] if r['tags'].get('highway') in ('motorway', 'trunk', 'primary', 'secondary', 'tertiary')]
    overview_bytes = dump(output / 'overview.json', overview)
    manifest = {'version': 1, 'tileSize': TILE_SIZE, 'meta': meta, 'boundary': [rings(p) for p in polygons(boundary)],
                'areaSquareMetres': round(boundary.area), 'bounds': list(boundary.bounds),
                'counts': {k: len(data[k]) for k in ('buildings', 'surfaces', 'roads', 'walls', 'trees')},
                'overview': 'overview.json', 'overviewBytes': overview_bytes, 'tiles': entries,
                'tileBytes': total_bytes}
    dump(output / 'manifest.json', manifest)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--pbf', type=Path, default=Path('work/v3/region.osm.pbf'))
    parser.add_argument('--boundary', type=Path, default=ROOT / 'data/municipality.geojson')
    parser.add_argument('--output', type=Path, default=Path('public/nantes'))
    args = parser.parse_args()
    if args.download:
        args.pbf.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(SOURCE, args.pbf)
        urllib.request.urlretrieve(BOUNDARY_SOURCE, args.boundary)
    geographic = json.loads(args.boundary.read_text())
    if geographic['properties']['code'] != '44109':
        raise ValueError('La limite doit être celle de Nantes, code INSEE 44109')
    boundary = transform(project, shape(geographic['geometry']))
    if not boundary.is_valid or not 60e6 < boundary.area < 70e6:
        raise ValueError('Limite communale invalide ou superficie incohérente')
    data, timestamp, skipped = extract(args.pbf, boundary)
    # La date source rend les régénérations strictement identiques.
    meta = {'bbox': [shape(geographic['geometry']).bounds[i] for i in (1, 0, 3, 2)], 'origin': ORIGIN,
            'width': round(boundary.bounds[2]-boundary.bounds[0], 2), 'depth': round(boundary.bounds[3]-boundary.bounds[1], 2),
            'source': SOURCE, 'license': 'ODbL-1.0', 'osmTimestamp': timestamp,
            'extractedAt': timestamp, 'skippedBuildings': skipped,
            'boundarySource': BOUNDARY_SOURCE, 'boundaryCode': '44109',
            'boundarySha256': hashlib.sha256(args.boundary.read_bytes()).hexdigest(),
            'rawSha256': hashlib.file_digest(args.pbf.open('rb'), 'sha256').hexdigest(),
            'projection': 'Équirectangulaire métrique commune ; X est, Z sud ; origine 47.2156,-1.5524'}
    manifest = generate(data, boundary, args.output, meta)
    print(json.dumps({k: manifest[k] for k in ('counts', 'areaSquareMetres', 'tileBytes', 'overviewBytes')}))
    print(f"{len(manifest['tiles'])} tuiles, source {timestamp}")


if __name__ == '__main__':
    main()
