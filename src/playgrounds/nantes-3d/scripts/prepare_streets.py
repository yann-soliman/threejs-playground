"""Détails V7 hors réseau, même PBF que la ville ; positions OSM séparées du décor."""
import argparse, hashlib, json, math
from pathlib import Path
from datetime import date
from collections import defaultdict
import osmium
from shapely.geometry import Point, LineString, shape, box
from shapely.ops import transform
from prepare_city import ROOT, project, dump, points, lines
from prepare_mobility import obstacle_index

KEEP = {'highway','amenity','barrier','railway','public_transport','tram','name','shop','office','building','sidewalk','sidewalk:left','sidewalk:right','crossing','footway','crossing:markings','lanes','oneway','surface','cycleway','parking:lane:both','parking:both','access','foot','bridge','tunnel','layer'}
KINDS = {'bench':'bench','waste_basket':'bin','bicycle_parking':'bicycle','bollard':'bollard','street_lamp':'lamp','bus_stop':'bus','tram_stop':'tram-stop'}


def prepare(pbf, city, output, boundary_path, prepared_at):
    manifest=json.loads((city/'manifest.json').read_text());raw_hash=hashlib.file_digest(pbf.open('rb'),'sha256').hexdigest()
    if raw_hash!=manifest['meta']['rawSha256']: raise ValueError('Snapshot différent de celui de Nantes')
    boundary=transform(project,shape(json.loads(boundary_path.read_text())['geometry']));tree,_=obstacle_index(city)
    tiles={t['id']:{'objects':[],'roads':{},'tracks':[]} for t in manifest['tiles']};counts=defaultdict(int)
    def safe(p,radius=.7):
        g=Point(p).buffer(radius)
        return boundary.covers(g) and len(tree.query(g,predicate='intersects'))==0
    def add(obj):
        x,z=obj['point'];key=f'{math.floor(x/500)}_{math.floor(z/500)}'
        if key in tiles: tiles[key]['objects'].append(obj);counts[obj['kind']]+=1
    road_tags={};shops=[]
    processor=osmium.FileProcessor(pbf).with_locations().with_filter(osmium.filter.KeyFilter('highway','amenity','barrier','railway','shop','office','building'))
    for obj in processor:
        tags={t.k:t.v for t in obj.tags if t.k in KEEP}
        if obj.is_node():
            p=project(obj.location.lon,obj.location.lat)
            if not boundary.covers(Point(p)):continue
            kind=KINDS.get(tags.get('amenity')) or KINDS.get(tags.get('barrier')) or KINDS.get(tags.get('highway')) or KINDS.get(tags.get('railway'))
            if tags.get('highway')=='crossing' or tags.get('footway')=='crossing':kind='crossing'
            if kind and safe(p,.35 if kind=='crossing' else .7) and tags.get('access') not in {'no','private'}:
                add({'id':f'node/{obj.id}','kind':kind,'point':[round(v,2) for v in p],'tags':tags,'source':'osm'})
            if tags.get('shop') or tags.get('office'):shops.append((p,tags,f'node/{obj.id}'))
        elif obj.is_way():
            if tags.get('highway'):road_tags[f'way/{obj.id}']=tags
            if tags.get('shop') or tags.get('office'):
                try:
                    coords=[project(n.lon,n.lat) for n in obj.nodes];p=LineString(coords).centroid
                    if boundary.covers(p):shops.append(((p.x,p.y),tags,f'way/{obj.id}'))
                except (RuntimeError,ValueError):pass
    # Association commerciale conservative : seulement une position contenue dans l'empreinte.
    from shapely.geometry import Polygon
    from shapely.strtree import STRtree
    shop_tree=STRtree([Point(p) for p,_,_ in shops])
    for tile in manifest['tiles']:
        data=json.loads((city/tile['urls']['near']).read_text());item=tiles[tile['id']]
        for r in data['roads']:
            key='/'.join(r['id'].split('/')[:2]);tags=road_tags.get(key,{})
            if tags:item['roads'][key]=tags
        item['businesses']={}
        for b in data['buildings']:
            g=Polygon(b['rings'][0],b['rings'][1:]); found=[{'id':shops[i][2],'tags':shops[i][1]} for i in shop_tree.query(g,predicate='covers')]
            if found:item['businesses'][b['id']]=found
    # Tracés V6 réutilisés ; poteaux estimés ancrés tous les 45 m sur chaque segment original.
    tracks=json.loads((city/'mobility/trams.json').read_text())
    for segment in tracks['segments']:
        if segment['tags'].get('bridge','no')!='no':continue
        line=LineString(segment['points'])
        for t in manifest['tiles']:
            if line.intersects(box(*t['bounds'])):
                for part in lines(line.intersection(box(*t['bounds']))):
                    tiles[t['id']]['tracks'].append({'id':segment['id'],'points':points(part.coords),'tags':segment['tags'],'source':'osm'})
        for n in range(1,int(line.length/45)+1):
            p=line.interpolate(n*45);q=line.interpolate(max(0,n*45-.5));dx=p.x-q.x;dz=p.y-q.y;length=math.hypot(dx,dz) or 1
            position=[round(p.x-dz/length*2.4,2),round(p.y+dx/length*2.4,2)]
            if safe(position,1):add({'id':f"{segment['id']}:pole:{n}",'kind':'tram-pole','point':position,'angle':math.atan2(dx,dz),'source':'estimated','tags':{}})
    # Quelques lampes estimées, uniquement le long des véritables chemins ouverts ; pas sur chaussée.
    for t in manifest['tiles']:
        data=json.loads((city/t['urls']['near']).read_text())
        for road in data['roads']:
            if road['tags'].get('highway') not in {'footway','pedestrian','living_street'} or road['tags'].get('access') in {'no','private'} or road['tags'].get('bridge','no')!='no':continue
            line=LineString(road['points'])
            if line.length<55:continue
            p=line.interpolate(line.length/2);q=line.interpolate(line.length/2-.5);dx=p.x-q.x;dz=p.y-q.y;l=math.hypot(dx,dz) or 1
            point=[round(p.x-dz/l*2.9,2),round(p.y+dx/l*2.9,2)]
            if safe(point,1) and not any(math.dist(o['point'],point)<18 for o in tiles[t['id']]['objects']):
                add({'id':road['id']+':lamp','kind':'lamp','point':point,'tags':{},'source':'estimated'})
    files={};total=0
    for key,item in sorted(tiles.items()):
        item['objects'].sort(key=lambda o:o['id']);file=f'tiles/{key}.json';total+=dump(output/file,item);files[key]=file
    dump(output/'manifest.json',{'version':1,'source':manifest['meta']['source'],'osmTimestamp':processor.header.get('osmosis_replication_timestamp'),'rawSha256':raw_hash,'preparedAt':prepared_at,'license':'ODbL-1.0','counts':dict(counts),'tiles':files,'bytes':total})
    print(json.dumps({'counts':dict(counts),'bytes':total,'tiles':len(files)}))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pbf',type=Path,required=True);p.add_argument('--city',type=Path,default=Path('public/nantes'));p.add_argument('--output',type=Path,default=Path('public/nantes/streets'));p.add_argument('--boundary',type=Path,default=ROOT/'data/municipality.geojson');p.add_argument('--prepared-at',default=date.today().isoformat());a=p.parse_args();prepare(a.pbf,a.city,a.output,a.boundary,a.prepared_at)
