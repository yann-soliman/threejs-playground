"""MNT IGN RGE ALTI 5 m : préparation reproductible, sans réseau implicite."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import urllib.request

import numpy as np
import py7zr
from pyproj import Transformer
import rasterio
from rasterio.merge import merge
from shapely import constrained_delaunay_triangles, contains_xy, get_parts, set_precision
from shapely.geometry import Polygon, LineString, box
from shapely.ops import unary_union
from prepare_city import dump

ROOT = Path(__file__).resolve().parents[4]
EDITION = 'RGEALTI_2-0_5M_ASC_LAMB93-IGN69_D044_2022-12-20'
SOURCE = f'https://data.geopf.fr/telechargement/download/RGEALTI/{EDITION}/{EDITION}.7z'
EXPECTED_SHA = '6047d72dff5ae023727590bf3ef703f7e1da6814211fd86614122ffaf4bb3e8f'
SCALE = 6371008.8 * math.pi / 180
ORIGIN = (47.2156, -1.5524)


def polygons(geometry):
    # Les petites intersections comptent pour les raccords du terrain : ne pas
    # appliquer le seuil de 1 m² des objets OSM à ces triangles de bord.
    if geometry.is_empty:
        return []
    if geometry.geom_type == 'Polygon':
        return [geometry] if geometry.area > 0 else []
    return [poly for part in getattr(geometry, 'geoms', []) for poly in polygons(part)]


class ElevationSource:
    def __init__(self, directory):
        paths = sorted(Path(directory).rglob('*.asc'))
        if not paths:
            raise ValueError('Aucune dalle IGN ASC')
        readers = [rasterio.open(path) for path in paths]
        for reader in readers:
            if reader.res != (5, 5) or reader.nodata != -99999 or reader.crs not in (None, rasterio.crs.CRS.from_epsg(2154)):
                raise ValueError('Résolution, NoData ou projection IGN inattendue')
        # Le format ASC est sans CRS incorporé ; LAMB93-IGN69 est attesté par la livraison.
        self.grid, self.affine = merge(readers)
        self.grid = self.grid[0]
        for reader in readers:
            reader.close()
        self.transformer = Transformer.from_crs('EPSG:4326', 'EPSG:2154', always_xy=True)
        self.hashes = {p.name: hashlib.file_digest(p.open('rb'), 'sha256').hexdigest() for p in paths}

    def sample(self, points):
        points = np.asarray(points, dtype=np.float64).reshape(-1, 2)
        lon = ORIGIN[1] + points[:, 0] / (SCALE * math.cos(math.radians(ORIGIN[0])))
        lat = ORIGIN[0] - points[:, 1] / SCALE
        east, north = self.transformer.transform(lon, lat)
        col = (east - self.affine.c) / 5 - .5
        row = (self.affine.f - north) / 5 - .5
        c, r = np.floor(col).astype(int), np.floor(row).astype(int)
        if np.any(c < 0) or np.any(r < 0) or np.any(c + 1 >= self.grid.shape[1]) or np.any(r + 1 >= self.grid.shape[0]):
            raise ValueError('Emprise IGN insuffisante')
        dx, dz = col-c, row-r
        samples = [self.grid[r, c], self.grid[r, c+1], self.grid[r+1, c], self.grid[r+1, c+1]]
        weights = [(1-dx)*(1-dz), dx*(1-dz), (1-dx)*dz, dx*dz]
        if any(np.any((v == -99999) & (w > 1e-9)) for v, w in zip(samples, weights)):
            raise ValueError('Échantillon IGN NoData : aucune altitude inventée')
        result = sum(v.astype(np.float64)*w for v, w in zip(samples, weights))
        if not np.all(np.isfinite(result)):
            raise ValueError('Altitude non finie')
        return np.round(result, 2)


def feature_polygon(feature):
    return Polygon(feature['rings'][0], feature['rings'][1:])


def source_id(feature):
    return feature['id'].split('@')[0]


def ring_samples(rings, step=10):
    points = []
    for ring in rings:
        for a, b in zip(ring, ring[1:] + ring[:1]):
            n = max(1, math.ceil(math.dist(a, b)/step))
            points.extend([[a[0]+(b[0]-a[0])*i/n, a[1]+(b[1]-a[1])*i/n] for i in range(n)])
    return points


def foundation(source, feature):
    poly = feature_polygon(feature)
    points = ring_samples(feature['rings'])
    x0, z0, x1, z1 = poly.bounds
    if poly.area > 400:
        xs, zs = np.meshgrid(np.arange(math.ceil(x0/10)*10, x1, 10), np.arange(math.ceil(z0/10)*10, z1, 10))
        inside = contains_xy(poly, xs.ravel(), zs.ravel())
        points.extend(np.column_stack((xs.ravel()[inside], zs.ravel()[inside])).tolist())
    height = source.sample(points)
    return [float(height.min()), float(height.max())]


def densify_tile_edge(poly, bounds):
    x0, z0, x1, z1 = bounds
    def ring(coords):
        result = []
        coords = list(coords)
        for a, b in zip(coords, coords[1:]):
            result.append(a)
            vertical = abs(a[0]-b[0]) < 1e-7 and any(abs(a[0]-x) < 1e-7 for x in (x0, x1))
            horizontal = abs(a[1]-b[1]) < 1e-7 and any(abs(a[1]-z) < 1e-7 for z in (z0, z1))
            if vertical or horizontal:
                axis = 1 if vertical else 0
                lo, hi = sorted((a[axis], b[axis]))
                values = np.arange(math.floor(lo/10)*10+10, hi-1e-7, 10)
                if b[axis] < a[axis]:
                    values = values[::-1]
                result.extend([(a[0], float(v)) if vertical else (float(v), a[1]) for v in values])
        return result
    return Polygon(ring(poly.exterior.coords), [ring(r.coords) for r in poly.interiors])


def meshes(source, land, bounds):
    nodes, lookup, indices = [], {}, {}
    for lod, step in [('near', 20), ('medium', 50), ('far', 100)]:
        selected = []
        x0, z0, x1, z1 = bounds
        for x in range(int(x0), int(x1), step):
            for z in range(int(z0), int(z1), step):
                clipped = land.intersection(box(x, z, min(x+step, x1), min(z+step, z1)))
                for poly in polygons(clipped):
                    if poly.area <= 0:
                        continue
                    dense = densify_tile_edge(poly, bounds)
                    for triangle in get_parts(constrained_delaunay_triangles(dense)):
                        # Orientation vers le haut dans X/Y/Z, Z vers le sud.
                        coords = [tuple(round(v, 6) for v in p) for p in list(triangle.exterior.coords)[:3]]
                        area = sum(a[0]*b[1]-b[0]*a[1] for a, b in zip(coords, coords[1:]+coords[:1]))
                        if abs(area) < 1e-8:
                            continue
                        if area > 0:
                            coords.reverse()
                        for point in coords:
                            key = tuple(point)
                            if key not in lookup:
                                lookup[key] = len(nodes); nodes.append(key)
                            selected.append(lookup[key])
        indices[lod] = selected
    heights = source.sample(nodes) if nodes else []
    vertices = [v for (x, z), y in zip(nodes, heights) for v in (x, float(y), z)]
    return vertices, indices


def water_registry(source, tiles):
    waters = [f for data in tiles for f in data['surfaces'] if f['kind'] == 'water']
    union = unary_union([feature_polygon(f) for f in waters])
    components = list(polygons(union))
    levels = {}
    for poly in components:
        x0, z0, x1, z1 = poly.bounds
        xs, zs = np.meshgrid(np.arange(math.floor(x0/30)*30, x1, 30), np.arange(math.floor(z0/30)*30, z1, 30))
        inside = contains_xy(poly, xs.ravel(), zs.ravel())
        points = np.column_stack((xs.ravel()[inside], zs.ravel()[inside])).tolist()
        if not points:
            p = poly.representative_point(); points = [[p.x, p.y]]
        level = float(np.median(source.sample(points)))
        for f in waters:
            if poly.covers(feature_polygon(f).representative_point()):
                key = source_id(f)
                if key in levels and levels[key] != level:
                    # Un même objet OSM multipart reste à une altitude commune.
                    level = levels[key]
                levels[key] = level
    return union, dict(sorted(levels.items()))


def bridge_registry(source, tiles, water_levels):
    groups = {}
    for data in tiles:
        for road in data['roads']:
            if road['tags'].get('bridge', 'no') != 'no' or float(road['tags'].get('layer', 0) or 0) > 0:
                groups.setdefault(source_id(road), []).append(road)
    waters = [(feature_polygon(f), water_levels[source_id(f)]) for data in tiles for f in data['surfaces'] if f['kind'] == 'water']
    result = {}
    for key, fragments in sorted(groups.items()):
        points = [p for road in fragments for p in road['points']]
        values = source.sample(points)
        # Interprétation conservatrice : tablier horizontal au-dessus des points du MNT.
        intersections = [height for poly, height in waters if any(poly.intersects(LineString(f['points'])) for f in fragments)]
        result[key] = round(max(float(values.max())+.15, max(intersections, default=-math.inf)+2), 2)
    return result


def generate(source, assets, output, meta):
    manifest = json.loads((assets/'manifest.json').read_text())
    if tuple(manifest['meta']['origin']) != ORIGIN:
        raise ValueError('Origine locale incompatible avec la préparation du MNT')
    tiles = [json.loads((assets/t['urls']['near']).read_text()) for t in manifest['tiles']]
    boundary = unary_union([Polygon(r[0], r[1:]) for r in manifest['boundary']])
    water, water_levels = water_registry(source, tiles)
    bridges = bridge_registry(source, tiles, water_levels)
    land = set_precision(boundary.difference(water), .01)
    entries, overview_nodes, overview_indices = [], [], []
    overview_lookup = {}
    all_min, all_max = math.inf, -math.inf
    for i, (entry, data) in enumerate(zip(manifest['tiles'], tiles)):
        bounds = entry['bounds']; x0, z0, x1, z1 = bounds
        xs, zs = np.meshgrid(np.arange(x0-10, x1+11, 10), np.arange(z0-10, z1+11, 10))
        heights = source.sample(np.column_stack((xs.ravel(), zs.ravel())))
        vertices, indices = meshes(source, land, bounds)
        if vertices:
            all_min = min(all_min, min(vertices[1::3])); all_max = max(all_max, max(vertices[1::3]))
        bases = {f['id']: foundation(source, f) for f in data['buildings']}
        payload = {'id': entry['id'], 'bounds': bounds, 'origin': [x0-10, z0-10], 'size': 53, 'step': 10,
                   'heights': np.rint(heights*100).astype(int).tolist(), 'vertices': vertices, 'indices': indices,
                   'bases': bases, 'waterSurfaces': [f for f in data['surfaces'] if f['kind'] == 'water'],
                   'surfaceRings': {f['id']: [[list(p.exterior.coords)[:-1]]+[list(r.coords)[:-1] for r in p.interiors] for p in polygons(feature_polygon(f).difference(water))] for f in data['surfaces'] if f['kind'] != 'water' and feature_polygon(f).intersection(water).area > .01}}
        path = f"tiles/{entry['id']}.json"; size = dump(output/path, payload)
        entries.append({'id': entry['id'], 'url': path, 'bytes': size, 'vertices': len(vertices)//3,
                        'triangles': {lod: len(ids)//3 for lod, ids in indices.items()}})
        for vertex in indices['far']:
            point = tuple(vertices[vertex*3:vertex*3+3])
            if point not in overview_lookup:
                overview_lookup[point] = len(overview_nodes)//3; overview_nodes.extend(point)
            overview_indices.append(overview_lookup[point])
        if i % 50 == 0:
            print(f"{i}/{len(tiles)} tuiles terrain", flush=True)
    x0, z0, x1, z1 = manifest['bounds']
    ox, oz = math.floor(x0/100)*100-100, math.floor(z0/100)*100-100
    width, depth = math.ceil((x1-ox)/100)+2, math.ceil((z1-oz)/100)+2
    xs, zs = np.meshgrid(ox+np.arange(width)*100, oz+np.arange(depth)*100)
    heights = source.sample(np.column_stack((xs.ravel(), zs.ravel())))
    overview_data = json.loads((assets/'overview.json').read_text())
    surface_rings = {f['id']: [[list(p.exterior.coords)[:-1]]+[list(r.coords)[:-1] for r in p.interiors] for p in polygons(feature_polygon(f).difference(water))] for f in overview_data['surfaces'] if f['kind'] != 'water' and feature_polygon(f).intersection(water).area > .01}
    overview = {'surfaceRings': surface_rings, 'vertices': overview_nodes, 'indices': overview_indices,
                'grid': {'origin': [ox, oz], 'width': width, 'depth': depth, 'step': 100, 'heights': np.rint(heights*100).astype(int).tolist()},
                'waterLevels': water_levels, 'bridgeLevels': bridges, 'waterSurfaces': [f for data in tiles for f in data['surfaces'] if f['kind'] == 'water']}
    overview_bytes = dump(output/'overview.json', overview)
    result = {'version': 1, 'meta': meta, 'sourceFiles': source.hashes,
              'areaSquareMetres': manifest['areaSquareMetres'], 'sampleStep': 10, 'meshSteps': [20, 50, 100],
              'range': [all_min, all_max], 'overview': 'overview.json', 'overviewBytes': overview_bytes,
              'tileBytes': sum(t['bytes'] for t in entries), 'tiles': entries}
    dump(output/'manifest.json', result)
    print(json.dumps({k: result[k] for k in ('range', 'tileBytes', 'overviewBytes')}), flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--archive', type=Path, default=ROOT/'work/v4b/rgealti-44.7z')
    parser.add_argument('--source', type=Path, default=ROOT/'work/v4b/source')
    parser.add_argument('--output', type=Path, default=ROOT/'public/nantes/terrain')
    args = parser.parse_args()
    if args.download:
        args.archive.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(SOURCE, args.archive)
    if not args.archive.exists():
        raise ValueError('Archive IGN absente ; télécharger explicitement avec --download')
    sha = hashlib.file_digest(args.archive.open('rb'), 'sha256').hexdigest()
    if sha != EXPECTED_SHA:
        raise ValueError('Archive IGN différente de l’édition documentée')
    if not list(args.source.rglob('*.asc')):
        with py7zr.SevenZipFile(args.archive) as archive:
            targets = []
            for name in archive.getnames():
                match = re.search(r'FXX_(\d+)_(\d+)_MNT', name)
                if (match and 345 <= int(match[1]) <= 360 and 6685 <= int(match[2]) <= 6700) or (not name.endswith('.asc') and not match):
                    targets.append(name)
            archive.extract(path=args.source, targets=targets)
    metadata = {'source': SOURCE, 'edition': '2022-12-20', 'downloadedAt': '2026-10-11',
                'license': 'Licence ouverte Etalab 2.0', 'horizontalCrs': 'EPSG:2154', 'verticalCrs': 'EPSG:5720 (NGF-IGN69)',
                'sourceResolution': 5, 'nodata': -99999, 'archiveSha256': sha,
                'origin': list(ORIGIN), 'verticalScale': 1}
    generate(ElevationSource(args.source), ROOT/'public/nantes', args.output, metadata)


if __name__ == '__main__':
    main()
