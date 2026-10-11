"""Tests topologiques du générateur, avec les dépendances de préparation installées."""
import json
from pathlib import Path
import tempfile
import unittest

try:
    from shapely.geometry import Polygon, box
    from shapely.ops import unary_union
    from prepare_city import generate, polygons, rings, tile_range, TILE_SIZE
    AVAILABLE = True
except ImportError:
    AVAILABLE = False


@unittest.skipUnless(AVAILABLE, 'Installer scripts/requirements.txt pour les tests topologiques')
class TilePipelineTests(unittest.TestCase):
    def test_complete_boundary_ownership_and_determinism(self):
        boundary = Polygon([(-80, -60), (1120, -60), (1120, 640), (620, 640), (620, 1040), (-80, 1040)], [[(10, 10), (10, 90), (90, 90), (90, 10)]])
        crossing = {'id': 'way/1', 'rings': [[[490, 120], [510, 120], [510, 160], [490, 160]]], 'tags': { 'height': '10' }}
        data = {'buildings': [crossing], 'surfaces': [{ 'id': 'way/2', 'rings': rings(boundary), 'tags': {}, 'kind': 'water' }], 'roads': [{ 'id': 'way/3', 'points': [[-50, 200], [1100, 200]], 'tags': {'highway': 'primary'} }], 'walls': [], 'trees': [[500, 300]]}
        meta = {'origin': [47.2156, -1.5524]}
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            manifest = generate(data, boundary, output, meta)
            expected = {f'{x}_{z}' for x,z in tile_range(boundary.bounds) if boundary.intersection(box(x*TILE_SIZE, z*TILE_SIZE, (x+1)*TILE_SIZE, (z+1)*TILE_SIZE)).area > .01}
            self.assertEqual({t['id'] for t in manifest['tiles']}, expected)
            near = [json.loads((output / t['urls']['near']).read_text()) for t in manifest['tiles']]
            self.assertEqual(sum(len(t['buildings']) for t in near), 1)
            surfaces = [Polygon(f['rings'][0], f['rings'][1:]) for t in near for f in t['surfaces']]
            self.assertLess(boundary.symmetric_difference(unary_union(surfaces)).area, .01)
            self.assertEqual(sum(len(t['trees']) for t in near), 1)
            before = {p.relative_to(output): p.read_bytes() for p in output.rglob('*.json')}
            generate(data, boundary, output, meta)
            self.assertEqual(before, {p.relative_to(output): p.read_bytes() for p in output.rglob('*.json')})


    def test_real_municipal_coverage(self):
        from prepare_city import project
        from shapely.geometry import shape
        from shapely.ops import transform
        root = Path(__file__).resolve().parents[4]
        m = json.loads((root / 'public/nantes/manifest.json').read_text())
        boundary = transform(project, shape(json.loads((root / 'src/playgrounds/nantes-3d/data/municipality.geojson').read_text())['geometry']))
        expected = {f'{x}_{z}' for x,z in tile_range(boundary.bounds) if boundary.intersection(box(x*TILE_SIZE, z*TILE_SIZE, (x+1)*TILE_SIZE, (z+1)*TILE_SIZE)).area > .01}
        self.assertEqual({t['id'] for t in m['tiles']}, expected)
        covered = unary_union([box(*t['bounds']).intersection(boundary) for t in m['tiles']])
        self.assertLess(boundary.symmetric_difference(covered).area, .1)
        tolerated = boundary.buffer(.02)
        for t in m['tiles']:
            data = json.loads((root / 'public/nantes' / t['urls']['near']).read_text())
            for f in data['buildings']:
                poly = Polygon(f['rings'][0], f['rings'][1:])
                self.assertTrue(poly.is_valid, f['id'])
                # Arrondi des sommets à 1 cm : marge topologique de 2 cm.
                self.assertLess(poly.difference(tolerated).area, .01, f['id'])
                self.assertTrue(box(*t['bounds']).intersects(poly), f['id'])


if __name__ == '__main__':
    unittest.main()
