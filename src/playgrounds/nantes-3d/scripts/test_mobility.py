"""Topologie réelle, restrictions et assets complémentaires V6."""
import json
import unittest
from pathlib import Path
from shapely.geometry import LineString, box
from shapely.strtree import STRtree
from prepare_mobility import connected_tracks, eligible, safe_parts

ROOT = Path(__file__).resolve().parents[4]


class MobilityTests(unittest.TestCase):
    def test_access(self):
        self.assertFalse(eligible({'highway': 'motorway'}, 'pedestrian'))
        self.assertFalse(eligible({'highway': 'footway', 'bicycle': 'no'}, 'cyclist'))
        self.assertFalse(eligible({'highway': 'pedestrian'}, 'cyclist'))
        self.assertTrue(eligible({'highway': 'pedestrian', 'bicycle': 'yes', 'access': 'no'}, 'cyclist'))
        self.assertFalse(eligible({'highway': 'residential', 'access': 'private'}, 'pedestrian'))
        self.assertFalse(eligible({'highway': 'cycleway', 'tunnel': 'yes'}, 'cyclist'))

    def test_topology(self):
        def segment(identifier, nodes, coords, layer='0'):
            return {'id': identifier, 'nodes': nodes, 'points': coords, 'tags': {'railway': 'tram', 'layer': layer}}
        segments = [segment('a', [1, 2], [[0, 0], [10, 0]]), segment('b', [3, 2], [[20, 0], [10, 0]]),
                    segment('c', [4, 5], [[20.01, 0], [30, 0]]), segment('d', [3, 6], [[20, 0], [20, 10]], '1')]
        routes = connected_tracks(segments)
        self.assertEqual(len(routes), 3)
        self.assertEqual(routes[0]['nodes'], [1, 2, 3])
        self.assertEqual(routes[0]['points'], [[0, 0], [10, 0], [20, 0]])
        # Proximité de 1 cm et croisement à autre niveau ne créent pas de connexion.
        self.assertEqual(sorted(sum((r['osmIds'] for r in routes), [])), ['a', 'b', 'c', 'd'])

    def test_track_direction(self):
        segments = [{'id': str(i), 'nodes': nodes, 'points': coords, 'tags': {'railway': 'tram', 'oneway': 'yes'}} for i, (nodes, coords) in enumerate([([1, 2], [[0, 0], [10, 0]]), ([3, 2], [[20, 0], [10, 0]])])]
        routes = connected_tracks(segments)
        self.assertEqual(len(routes), 2)
        self.assertEqual(routes[0]['nodes'], [1, 2])
        self.assertEqual(routes[1]['nodes'], [3, 2])

    def test_branch_loop(self):
        segments = [{'id': str(i), 'nodes': [a, b], 'points': [p, q], 'tags': {'railway': 'tram'}} for i, (a, b, p, q) in enumerate([(1, 2, [0, 0], [10, 0]), (2, 3, [10, 0], [10, 10]), (3, 1, [10, 10], [0, 0])])]
        self.assertTrue(connected_tracks(segments)[0]['closed'])
        segments.append({'id': 'branch', 'nodes': [2, 4], 'points': [[10, 0], [20, 0]], 'tags': {'railway': 'tram'}})
        self.assertGreater(len(connected_tracks(segments)), 1)

    def test_obstacles(self):
        line = LineString([(0, 0), (100, 0)]);tree = STRtree([box(45, -2, 55, 2)])
        parts = safe_parts(line, tree)
        self.assertEqual(len(parts), 2)
        self.assertTrue(all(not p.intersects(box(46, -1, 54, 1)) for p in parts))
        self.assertEqual(len(safe_parts(line, tree, True, {0})), 1)
        self.assertEqual(len(safe_parts(line, tree, True)), 2)

    def test_static_assets(self):
        root = ROOT / 'public/nantes/mobility';manifest = json.loads((root / 'manifest.json').read_text())
        self.assertEqual(manifest['meta']['license'], 'ODbL-1.0')
        city = json.loads((ROOT / 'public/nantes/manifest.json').read_text())
        self.assertEqual(manifest['meta']['rawSha256'], city['meta']['rawSha256'])
        tram = json.loads((root / manifest['trams']).read_text());segments = {s['id']: s for s in tram['segments']}
        self.assertGreater(len(segments), 100)
        self.assertTrue(all(s['tags'].get('railway') == 'tram_stop' or s['tags'].get('tram') == 'yes' for s in tram['stops']))
        for route in tram['routes']:
            self.assertEqual(len(route['nodes']), len(route['points']))
            edges = {frozenset((a, b)) for identifier in route['osmIds'] for a, b in zip(segments[identifier]['nodes'], segments[identifier]['nodes'][1:])}
            self.assertTrue(all(frozenset((a, b)) in edges for a, b in zip(route['nodes'], route['nodes'][1:])))
            for identifier in route['osmIds']:
                part = segments[identifier]
                if part['tags'].get('oneway') == 'yes':
                    allowed = set(zip(part['nodes'], part['nodes'][1:]))
                    actual = set(zip(route['nodes'], route['nodes'][1:]))
                    self.assertTrue(allowed.issubset(actual))
            self.assertTrue(all(0 <= s['distance'] <= route['length'] + .02 for s in route['stops']))
        for tile, url in manifest['tiles'].items():
            self.assertIn(tile, {t['id'] for t in city['tiles']})
            data = json.loads((root / url).read_text())
            self.assertEqual(len({r['id'] for r in data['routes']}), len(data['routes']))
            self.assertTrue(all(r.get('deck') is not None for r in data['routes'] if r['tags'].get('bridge', 'no') != 'no'))
            self.assertTrue(all(eligible(r['tags'], r['kind']) and len(r['points']) >= 2 for r in data['routes']))


if __name__ == '__main__':
    unittest.main()
