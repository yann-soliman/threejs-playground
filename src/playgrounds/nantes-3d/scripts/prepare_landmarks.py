"""Complément OSM V8 : parties LU et grue, même snapshot et projection que Nantes."""
import argparse,hashlib,json
from pathlib import Path
from datetime import date
import osmium
from shapely.geometry import Polygon
from shapely import make_valid
from prepare_city import ROOT,project,dump,rings,polygons
IDS={32428111,288814717,288814718,288814724,288814726,288874905,288874906,288874907,288874908,288874909,288874912,288905411}
ENTRANCES={162056135:0,756402752:-1,756402751:-1}
KEEP={'building','building:part','building:shape','height','min_height','roof:height','roof:shape','roof:colour','roof:material','building:material','name','man_made','area','wikidata','wikipedia'}

def write_assets(features,meta,output,crane_output,entrances):
 parent=next(f for f in features if f['id']=='way/32428111');tower=next(f for f in features if f['id']=='way/288814717');crane=next(f for f in features if f['id']=='way/288905411')
 cut=make_valid(Polygon(parent['rings'][0])).difference(make_valid(Polygon(tower['rings'][0])))
 shape=polygons(cut)
 if len(shape)!=1:raise ValueError('Découpe du Lieu Unique non connexe : revoir le modèle')
 dump(output/'1_0.json',{'meta':meta,'parts':[f for f in features if f['id'] not in {'way/32428111','way/288905411'}],'visualRings':rings(shape[0])})
 dump(crane_output,{'meta':meta,'feature':crane})
 dump(output/'-2_0.json',{'meta':meta,'entrances':entrances})

def prepare(pbf,city,output,crane_output,prepared_at):
 m=json.loads((city/'manifest.json').read_text());digest=hashlib.file_digest(pbf.open('rb'),'sha256').hexdigest()
 if digest!=m['meta']['rawSha256']:raise ValueError('Le PBF ne correspond pas à Nantes')
 features=[];entrances=[];processor=osmium.FileProcessor(pbf).with_locations().with_filter(osmium.filter.KeyFilter('building','building:part','man_made','highway'))
 for o in processor:
  if not o.is_way():continue
  if o.id in ENTRANCES:
   n=o.nodes[ENTRANCES[o.id]];entrances.append({'source':f'way/{o.id}','point':[round(v,2) for v in project(n.lon,n.lat)]});continue
  if o.id not in IDS:continue
  points=[[round(v,2) for v in project(n.lon,n.lat)] for n in o.nodes][:-1]
  features.append({'id':f'way/{o.id}','rings':[points],'tags':{t.k:t.v for t in o.tags if t.k in KEEP}})
 if {int(f['id'].split('/')[1]) for f in features}!=IDS:raise ValueError('Objet OSM requis absent')
 if len(entrances)!=3:raise ValueError('Accès OSM du passage manquant')
 entrances.sort(key=lambda e:e['source']);features.sort(key=lambda f:f['id']);meta={'rawSha256':digest,'osmTimestamp':processor.header.get('osmosis_replication_timestamp'),'preparedAt':prepared_at,'license':'ODbL-1.0'};write_assets(features,meta,output,crane_output,entrances);print(f'{len(features)+len(entrances)} objets OSM ; complément LU et grue préparés')
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pbf',type=Path,required=True);p.add_argument('--city',type=Path,default=Path('public/nantes'));p.add_argument('--output',type=Path,default=Path('public/nantes/landmarks'));p.add_argument('--crane-output',type=Path,default=ROOT/'data/titan.json');p.add_argument('--prepared-at',default=date.today().isoformat());a=p.parse_args();prepare(a.pbf,a.city,a.output,a.crane_output,a.prepared_at)
