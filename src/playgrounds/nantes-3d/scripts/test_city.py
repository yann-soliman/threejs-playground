"""Validation sans réseau des assets municipaux ; bibliothèque standard uniquement."""
import hashlib
import json
import math
from pathlib import Path
import unittest
from prepare import inside, area

ROOT = Path(__file__).resolve().parents[4]
ASSETS = ROOT / 'public/nantes'


def load(path):
    return json.loads(path.read_text())


class MunicipalDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = load(ASSETS / 'manifest.json')
        cls.tiles = [load(ASSETS / tile['urls']['near']) for tile in cls.manifest['tiles']]

    def test_traffic_tags_survive_offline_extraction(self):
        from prepare_city import KEEP
        for key in ('oneway', 'lanes', 'access', 'motor_vehicle', 'vehicle', 'bridge', 'tunnel', 'layer'):
            self.assertIn(key, KEEP)
        roads=[road for tile in self.tiles for road in tile['roads']]
        self.assertTrue(any(road['tags'].get('oneway') == '-1' for road in roads))
        self.assertTrue(any(road['tags'].get('motor_vehicle') == 'no' for road in roads))
        self.assertTrue(any(road['tags'].get('access') == 'private' for road in roads))
        # Les restrictions restent identiques lors de la simplification des tracés.
        for entry,near in zip(self.manifest['tiles'],self.tiles):
            tags={road['id']:road['tags'] for road in near['roads']}
            for lod in ('medium','far'):
                for road in load(ASSETS/entry['urls'][lod])['roads']:
                    self.assertEqual(road['tags'],tags[road['id']])

    def test_complete_municipality(self):
        m = self.manifest
        self.assertEqual(m['meta']['boundaryCode'], '44109')
        self.assertTrue(60e6 < m['areaSquareMetres'] < 70e6)
        self.assertEqual(m['tileSize'], 500)
        self.assertGreater(m['counts']['buildings'], 10000)
        self.assertGreater(len(m['tiles']), 250)
        self.assertEqual(sum(len(t['buildings']) for t in self.tiles), m['counts']['buildings'])
        self.assertEqual(len({t['id'] for t in m['tiles']}), len(m['tiles']))
        # Tous les sommets de la limite disposent d'une tuile adjacente.
        ids = {(t['x'], t['z']) for t in m['tiles']}
        for rings in m['boundary']:
            for x, z in rings[0]:
                tx, tz = math.floor(x / 500), math.floor(z / 500)
                self.assertTrue(any((tx+dx, tz+dz) in ids for dx in (-1, 0, 1) for dz in (-1, 0, 1)))

    def test_ownership_coordinates_and_finite_geometry(self):
        ids = set()
        for entry, data in zip(self.manifest['tiles'], self.tiles):
            self.assertEqual(data['meta']['origin'], [47.2156, -1.5524])
            for feature in data['buildings']:
                self.assertNotIn(feature['id'], ids)
                ids.add(feature['id'])
                for ring in feature['rings']:
                    self.assertGreaterEqual(len(ring), 3)
                    self.assertGreater(abs(area(ring)), .001)
                    self.assertTrue(all(math.isfinite(v) for p in ring for v in p))
            x0, z0, x1, z1 = entry['bounds']
            for feature in data['surfaces']:
                for ring in feature['rings']:
                    for x, z in ring:
                        self.assertTrue(x0-.011 <= x <= x1+.011 and z0-.011 <= z <= z1+.011)
            for key in ('roads', 'walls'):
                for feature in data[key]:
                    self.assertGreaterEqual(len(feature['points']), 2)
                    for x, z in feature['points']:
                        self.assertTrue(x0-.011 <= x <= x1+.011 and z0-.011 <= z <= z1+.011)

    def test_runtime_assets_exist_and_bytes_match(self):
        total = 0
        self.assertEqual((ASSETS / self.manifest['overview']).stat().st_size, self.manifest['overviewBytes'])
        for entry in self.manifest['tiles']:
            for lod, url in entry['urls'].items():
                self.assertNotIn('..', url)
                size = (ASSETS / url).stat().st_size
                self.assertEqual(size, entry['bytes'][lod])
                total += size
                data = load(ASSETS / url)
                self.assertEqual({f['id'] for f in data['buildings']}, {f['id'] for f in load(ASSETS / entry['urls']['near'])['buildings']})
        self.assertEqual(total, self.manifest['tileBytes'])

    def test_geographic_source_hash_and_projection(self):
        m = self.manifest
        boundary = ROOT / 'src/playgrounds/nantes-3d/data/municipality.geojson'
        self.assertEqual(hashlib.sha256(boundary.read_bytes()).hexdigest(), m['meta']['boundarySha256'])
        self.assertEqual(m['meta']['license'], 'ODbL-1.0')
        self.assertTrue(m['meta']['osmTimestamp'])
        self.assertIn('geofabrik', m['meta']['source'])
        self.assertIn('geo.api.gouv.fr', m['meta']['boundarySource'])
        geographic = load(boundary)['geometry']['coordinates'][0]
        origin = m['meta']['origin']; scale = 6371008.8 * math.pi / 180
        projected = [[round((lon-origin[1])*scale*math.cos(math.radians(origin[0])), 2), round(-(lat-origin[0])*scale, 2)] for lon, lat in geographic[:-1]]
        self.assertEqual(projected, m['boundary'][0][0])


if __name__ == '__main__':
    unittest.main()
