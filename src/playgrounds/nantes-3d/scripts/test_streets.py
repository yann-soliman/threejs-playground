"""Validation des assets de rue V7, provenance et exclusions géographiques."""
import json, math, unittest
from pathlib import Path
from shapely.geometry import Point
from prepare_mobility import obstacle_index
ROOT=Path(__file__).resolve().parents[4]


class StreetAssets(unittest.TestCase):
    def test_assets_and_source(self):
        city=ROOT/'public/nantes';manifest=json.loads((city/'manifest.json').read_text());streets=json.loads((city/'streets/manifest.json').read_text())
        self.assertEqual(streets['rawSha256'],manifest['meta']['rawSha256']);self.assertEqual(streets['license'],'ODbL-1.0')
        self.assertEqual(set(streets['tiles']),{t['id'] for t in manifest['tiles']})
        total=0;ids=set();counts={}
        for key,file in streets['tiles'].items():
            path=city/'streets'/file;total+=path.stat().st_size;d=json.loads(path.read_text());x,z=map(int,key.split('_'))
            for o in d['objects']:
                self.assertNotIn(o['id'],ids);ids.add(o['id']);counts[o['kind']]=counts.get(o['kind'],0)+1
                self.assertTrue(all(math.isfinite(v) for v in o['point']));self.assertEqual([math.floor(v/500) for v in o['point']],[x,z]);self.assertIn(o['source'],{'osm','estimated'})
                if o['kind']=='crossing':self.assertEqual(o['source'],'osm');self.assertEqual(o['tags']['highway'],'crossing')
                if o['source']=='osm':self.assertTrue(o['id'].startswith('node/'))
            for t in d['tracks']:self.assertEqual(t['tags']['railway'],'tram');self.assertGreaterEqual(len(t['points']),2)
            for b in d['businesses'].values():
                for business in b:self.assertTrue(business['tags'].get('shop') or business['tags'].get('office'));self.assertRegex(business['id'],r'^(node|way)/\d+$')
        self.assertEqual(total,streets['bytes']);self.assertEqual(counts,streets['counts'])

    def test_placement_exclusions(self):
        city=ROOT/'public/nantes';tree,_=obstacle_index(city)
        for path in sorted((city/'streets/tiles').glob('*.json')):
            d=json.loads(path.read_text())
            for o in d['objects']:
                radius=.35 if o['kind']=='crossing' else .7
                self.assertEqual(len(tree.query(Point(o['point']).buffer(radius-.02),predicate='intersects')),0,o['id'])


if __name__=='__main__':unittest.main()
