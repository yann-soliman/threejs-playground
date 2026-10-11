"""Tests ciblés du traitement, exécutables sans serveur ni accès réseau."""
import unittest
from prepare import clip_line, clip_ring, inside, prepare, stitch


class PrepareTests(unittest.TestCase):
    def test_reverse_relation_and_hole(self):
        self.assertEqual(len(stitch([[[0, 0], [10, 0]], [[10, 10], [10, 0]], [[10, 10], [0, 0]]])), 1)
        self.assertTrue(inside([2, 2], [[0, 0], [10, 0], [10, 10], [0, 10]]))

    def test_clipping(self):
        ring = clip_ring([[-20, -20], [20, -20], [20, 20], [-20, 20]], 10, 10)
        self.assertEqual(len(ring), 4)
        self.assertTrue(all(abs(x) <= 5 and abs(y) <= 5 for x, y in ring))
        self.assertEqual(clip_line([[-20, 0], [20, 0]], 10, 10), [[[-5.0, 0.0], [5.0, 0.0]]])
        self.assertEqual(clip_line([[-20, 20], [20, 20]], 10, 10), [])

    def test_incomplete_response_refused(self):
        with self.assertRaises(ValueError):
            prepare({'remark': 'timeout', 'elements': []}, [47.21, -1.561, 47.2172, -1.5498], 'today')

    def test_relation_not_duplicated(self):
        points = [{'lat': 47.212, 'lon': -1.558}, {'lat': 47.212, 'lon': -1.557}, {'lat': 47.213, 'lon': -1.557}, {'lat': 47.212, 'lon': -1.558}]
        raw = {'elements': [{'type': 'way', 'id': 1, 'tags': {'building': 'yes'}, 'geometry': points}, {'type': 'relation', 'id': 2, 'tags': {'building': 'yes', 'type': 'multipolygon'}, 'members': [{'type': 'way', 'ref': 1, 'role': 'outer', 'geometry': points}]}]}
        result = prepare(raw, [47.21, -1.561, 47.2172, -1.5498], 'today')
        self.assertEqual(len(result['buildings']), 1)
        self.assertEqual(result['buildings'][0]['id'], 'relation/2')


if __name__ == '__main__':
    unittest.main()
