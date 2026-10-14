"""Compléments V8 : même source, découpe LU, accès du passage et reproduction."""
import json
import math
import tempfile
import unittest
from pathlib import Path
from shapely.geometry import Polygon, Point
from prepare_landmarks import write_assets

ROOT = Path(__file__).resolve().parents[4]


class LandmarkAssets(unittest.TestCase):
    def setUp(self):
        self.city = ROOT / 'public/nantes'
        self.lu = json.loads((self.city / 'landmarks/1_0.json').read_text())
        self.passage = json.loads((self.city / 'landmarks/-2_0.json').read_text())
        self.crane_path = ROOT / 'src/playgrounds/nantes-3d/data/titan.json'
        self.crane = json.loads(self.crane_path.read_text())
        self.parent = next(f for f in json.loads((self.city / 'tiles/1_0.near.json').read_text())['buildings'] if f['id'] == 'way/32428111')

    def test_provenance_and_real_identifiers(self):
        manifest = json.loads((self.city / 'manifest.json').read_text())
        for asset in [self.lu, self.passage, self.crane]:
            self.assertEqual(asset['meta']['rawSha256'], manifest['meta']['rawSha256'])
            self.assertEqual(asset['meta']['osmTimestamp'], manifest['meta']['osmTimestamp'])
            self.assertEqual(asset['meta']['license'], 'ODbL-1.0')
        self.assertEqual(len(self.lu['parts']), 10)
        self.assertEqual(self.crane['feature']['id'], 'way/288905411')
        self.assertEqual(self.crane['feature']['tags']['height'], '43')
        for f in self.lu['parts'] + [self.crane['feature']]:
            self.assertTrue(all(math.isfinite(v) for ring in f['rings'] for p in ring for v in p))
            self.assertTrue(Polygon(f['rings'][0], f['rings'][1:]).is_valid)

    def test_lu_replacement_has_no_duplicate_tower(self):
        tower = next(f for f in self.lu['parts'] if f['id'] == 'way/288814717')
        parent = Polygon(self.parent['rings'][0], self.parent['rings'][1:])
        shape = Polygon(self.lu['visualRings'][0], self.lu['visualRings'][1:])
        tower_shape = Polygon(tower['rings'][0])
        self.assertTrue(shape.is_valid)
        self.assertLess(shape.intersection(tower_shape).area, .01)
        self.assertLess(shape.symmetric_difference(parent.difference(tower_shape)).area, .01)
        self.assertGreater(shape.area, 2000)

    def test_passage_entrances_follow_real_osm_routes(self):
        self.assertEqual({e['source'] for e in self.passage['entrances']}, {'way/162056135', 'way/756402752', 'way/756402751'})
        passage = next(f for f in json.loads((self.city / 'tiles/-2_0.near.json').read_text())['buildings'] if f['id'] == 'relation/4016610')
        outline = Polygon(passage['rings'][0]).boundary
        for entrance in self.passage['entrances']:
            self.assertLess(outline.distance(Point(entrance['point'])), 2)

    def test_reproduction_is_byte_identical(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            write_assets([self.parent] + self.lu['parts'] + [self.crane['feature']], self.lu['meta'], output, output / 'titan.json', self.passage['entrances'])
            for filename in ['1_0.json', '-2_0.json']:
                self.assertEqual((output / filename).read_bytes(), (self.city / 'landmarks' / filename).read_bytes())
            self.assertEqual((output / 'titan.json').read_bytes(), self.crane_path.read_bytes())


if __name__ == '__main__':
    unittest.main()
