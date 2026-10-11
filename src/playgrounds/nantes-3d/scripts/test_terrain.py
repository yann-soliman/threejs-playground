"""Contrôles hors réseau du MNT, des raccords et des altitudes préparées."""
import json
import math
from pathlib import Path
import unittest
import numpy as np
from pyproj import Transformer
from shapely.geometry import Polygon, box
from prepare_terrain import ElevationSource, meshes, generate, ORIGIN, SCALE

ROOT = Path(__file__).resolve().parents[4]
ASSETS = ROOT/'public/nantes'

def load(path):
    return json.loads(path.read_text())

class TerrainDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.geo = load(ASSETS/'manifest.json')
        cls.manifest = load(ASSETS/'terrain/manifest.json')
        cls.tiles = {e['id']: load(ASSETS/'terrain'/e['url']) for e in cls.manifest['tiles']}
        cls.overview = load(ASSETS/'terrain/overview.json')

    def test_provenance_and_complete_coverage(self):
        m = self.manifest
        self.assertEqual(m['meta']['sourceResolution'], 5)
        self.assertEqual(m['meta']['horizontalCrs'], 'EPSG:2154')
        self.assertIn('NGF-IGN69', m['meta']['verticalCrs'])
        self.assertEqual(m['meta']['verticalScale'], 1)
        self.assertEqual(len(m['sourceFiles']), 16)
        self.assertTrue(all(len(sha) == 64 for sha in m['sourceFiles'].values()))
        self.assertEqual(set(self.tiles), {t['id'] for t in self.geo['tiles']})
        self.assertEqual(m['range'], [-.79, 63.4])
        self.assertEqual(m['tileBytes'], sum(e['bytes'] for e in m['tiles']))
        for entry in m['tiles']:
            self.assertEqual((ASSETS/'terrain'/entry['url']).stat().st_size, entry['bytes'])
        self.assertEqual((ASSETS/'terrain/overview.json').stat().st_size, m['overviewBytes'])

    def test_all_geometry_and_foundations(self):
        for entry in self.geo['tiles']:
            tile = self.tiles[entry['id']]
            self.assertEqual(len(tile['heights']), 53*53)
            self.assertNotIn(-9999900, tile['heights'])
            vertices = np.array(tile['vertices']).reshape(-1, 3)
            self.assertTrue(np.all(np.isfinite(vertices)))
            for lod, ids in tile['indices'].items():
                self.assertEqual(len(ids)%3, 0)
                if not ids: continue
                self.assertGreaterEqual(min(ids), 0); self.assertLess(max(ids), len(vertices))
                triangles = vertices.astype(np.float32)[np.array(ids).reshape(-1, 3)]
                normals = np.cross(triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0])
                self.assertTrue(np.all(normals[:, 1] > 0), (entry['id'], lod))
            buildings = load(ASSETS/entry['urls']['near'])['buildings']
            self.assertEqual(set(tile['bases']), {b['id'] for b in buildings})
            for low, high in tile['bases'].values():
                self.assertTrue(math.isfinite(low) and math.isfinite(high) and low <= high)

    def test_shared_edges_identical_in_every_lod(self):
        def edge(tile, axis, value, lod):
            v = tile['vertices']; ids = set(tile['indices'][lod])
            return {(v[i*3], v[i*3+1], v[i*3+2]) for i in ids if abs(v[i*3+axis]-value) < 1e-7}
        for tile in self.tiles.values():
            x0,z0,x1,z1 = tile['bounds']
            for axis,value in [(0,x0),(0,x1),(2,z0),(2,z1)]:
                reference = edge(tile,axis,value,'near')
                for lod in ('medium','far'):
                    self.assertEqual(reference,edge(tile,axis,value,lod),(tile['id'],lod,axis,value))
            ix,iz = map(int,tile['id'].split('_'))
            for neighbour,axis,value in [(f'{ix+1}_{iz}',0,x1),(f'{ix}_{iz+1}',2,z1)]:
                if neighbour in self.tiles:
                    self.assertEqual(edge(tile,axis,value,'near'),edge(self.tiles[neighbour],axis,value,'near'),(tile['id'],neighbour))
            # Grille avec halo : mêmes hauteurs aux mêmes coordonnées globales.
            for neighbour,axis in [(f'{ix+1}_{iz}',0),(f'{ix}_{iz+1}',1)]:
                if neighbour not in self.tiles: continue
                a=np.array(tile['heights']).reshape(53,53);b=np.array(self.tiles[neighbour]['heights']).reshape(53,53)
                self.assertTrue(np.array_equal(a[:,-3:],b[:,:3]) if axis==0 else np.array_equal(a[-3:,:],b[:3,:]))

    def test_water_levels_shared_and_bridge_clearance(self):
        levels = self.overview['waterLevels']
        waters=[]
        for tile in self.tiles.values():
            for feature in tile['waterSurfaces']:
                poly=Polygon(feature['rings'][0],feature['rings'][1:]); level=levels[feature['id'].split('@')[0]]
                waters.append((poly,level))
        # Fragments qui se touchent doivent partager un plan d'eau, sans marche de tuile.
        from shapely.strtree import STRtree
        tree=STRtree([p for p,_ in waters])
        for p,level in waters:
            for i in tree.query(p,predicate='intersects'):
                self.assertEqual(level,waters[int(i)][1])
        self.assertTrue(all(math.isfinite(h) for h in self.overview['bridgeLevels'].values()))

    def test_real_landmarks_and_projection(self):
        transformer=Transformer.from_crs('EPSG:4326','EPSG:2154',always_xy=True)
        x,y=transformer.transform(ORIGIN[1],ORIGIN[0])
        self.assertTrue(350000<x<360000 and 6685000<y<6700000)
        def altitude(lat,lon):
            x=(lon-ORIGIN[1])*SCALE*math.cos(math.radians(ORIGIN[0]));z=(ORIGIN[0]-lat)*SCALE
            tile=self.tiles[f'{math.floor(x/500)}_{math.floor(z/500)}']
            col=(x-tile['origin'][0])/10;row=(z-tile['origin'][1])/10
            a,b=int(col),int(row);dx,dz=col-a,row-b;h=tile['heights'];n=tile['size']
            return ((1-dx)*(1-dz)*h[b*n+a]+dx*(1-dz)*h[b*n+a+1]+(1-dx)*dz*h[(b+1)*n+a]+dx*dz*h[(b+1)*n+a+1])/100
        butte=altitude(47.20282,-1.57778);ile=altitude(47.2053,-1.5642)
        self.assertTrue(30<butte<35);self.assertTrue(5<ile<8);self.assertGreater(butte-ile,20)

class TerrainPreparationTests(unittest.TestCase):
    def test_mesh_area_holes_and_common_edges(self):
        class Plane:
            def sample(self, points): return np.array([round(x*.01+z*.02,2) for x,z in points])
        land=box(0,0,500,500).difference(box(130,130,170,170))
        vertices,indices=meshes(Plane(),land,[0,0,500,500]);v=np.array(vertices).reshape(-1,3)
        for lod,ids in indices.items():
            triangles=v[np.array(ids).reshape(-1,3)]
            area=np.cross(triangles[:,1]-triangles[:,0],triangles[:,2]-triangles[:,0])[:,1].sum()/2
            self.assertAlmostEqual(area,land.area,places=4)
            self.assertEqual(len({i for i in ids if v[i,0]==0}),51)

    def test_rejects_incompatible_geographic_origin(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/'manifest.json').write_text(json.dumps({'meta': {'origin': [0,0]}}))
            with self.assertRaisesRegex(ValueError,'Origine locale incompatible'):
                generate(None, root, root/'output', {})

    def test_native_bilinear_and_nodata(self):
        source=object.__new__(ElevationSource)
        from rasterio import Affine
        source.affine=Affine(5,0,-2.5,0,-5,7.5)
        source.grid=np.array([[0.,10.],[20.,30.]])
        class Identity:
            def transform(self,lon,lat):return np.array(lon)*0+2.5,np.array(lat)*0+2.5
        source.transformer=Identity()
        self.assertEqual(source.sample([[0,0]]).tolist(),[15.])
        source.grid[0,0]=-99999
        with self.assertRaisesRegex(ValueError,'NoData'):source.sample([[0,0]])
        source.grid[0,0]=np.nan
        with self.assertRaisesRegex(ValueError,'non finie'):source.sample([[0,0]])
        with self.assertRaisesRegex(ValueError,'Aucune dalle'):ElevationSource(ROOT/'work/directory-absent')
