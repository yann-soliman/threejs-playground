import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { roadWidth } from './city';
import type { CityData, Point } from './types';
import { streetExclusion, markingEligible } from './street-details';
import { sampleLine } from './terrain';

/** Phase mondiale : le découpage d'un segment entre deux tuiles ne redémarre pas les tirets. */
export function dashSegments(a: Point, b: Point): [Point, number][] {
  const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.01)return [];
  const ux=dx/length,uz=dz/length,start=a[0]*ux+a[1]*uz,end=start+length,result:[Point,number][]=[];
  for(let station=Math.floor((start-1)/6)*6;station<end+1;station+=6) {
    const lo=Math.max(start,station-1),hi=Math.min(end,station+1);if(hi<=lo)continue;
    const t=(lo+hi)/2-start;result.push([[a[0]+ux*t,a[1]+uz*t],hi-lo]);
  }
  return result;
}
/** Plans légers regroupés, tous échantillonnés sur les mêmes triangles IGN que la chaussée. */
export function streetRoadGeometry(data:CityData,sample:(x:number,z:number)=>number):BufferGeometry {
  const positions:number[]=[],colors:number[]=[],allowed=streetExclusion(data);
  const quad=(p:Point,ux:number,uz:number,w:number,h:number,color:string,offset=.145):void=> {
    const c=new Color(color),nx=-uz,nz=ux;
    if([[-w/2,-h/2],[-w/2,h/2],[w/2,-h/2],[w/2,h/2]].some(([a,b])=>!allowed([p[0]+ux*a!+nx*b!,p[1]+uz*a!+nz*b!],0)))return;
    const corners=[[-w/2,-h/2],[-w/2,h/2],[w/2,-h/2],[w/2,-h/2],[-w/2,h/2],[w/2,h/2]];
    for(const [a,b] of corners){const x=p[0]+ux*a!+nx*b!,z=p[1]+uz*a!+nz*b!;positions.push(x,sample(x,z)+offset,z);colors.push(c.r,c.g,c.b);}
  };
  const eligible=data.roads.map(r=>({...r,tags:{...r.tags,...data.streets?.roads[r.id.split('/').slice(0,2).join('/')]}})).filter(r=>markingEligible(r.tags));
  for(const r of eligible){
    const width=roadWidth(r.tags),sidewalk=r.tags.sidewalk;
    const sampled=sampleLine(r.points,5);
    for(let i=1;i<sampled.length;i++){
      const a=sampled[i-1]!,b=sampled[i]!,dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(l<.1)continue;
      const ux=dx/l,uz=dz/l,p:Point=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      for(const side of [-1,1]){
        const hasSidewalk=sidewalk!=='no' && sidewalk!=='none' && (sidewalk!=='left'||side===-1) && (sidewalk!=='right'||side===1);
        if(!hasSidewalk)continue;
        const edge:Point=[p[0]-uz*side*(width/2+.3),p[1]+ux*side*(width/2+.3)];
        if(allowed(edge,.25)) {
          quad(edge,ux,uz,l,.16,'#dcd5c5',.21);
          const ends:Point[]=[[edge[0]-ux*l/2,edge[1]-uz*l/2],[edge[0]+ux*l/2,edge[1]+uz*l/2]];
          if(ends.every(p=>allowed(p,0))) {
            const color=new Color('#b9b5a9');for(const [index,height] of [[0,.08],[1,.21],[1,.08],[0,.08],[0,.21],[1,.21]]) {const p=ends[index!]!;positions.push(p[0],sample(...p)+height!,p[1]);colors.push(color.r,color.g,color.b);}
          }
        }
      }
      // Un axe ponctué seulement si OSM donne au moins deux voies et pas de sens unique.
      if(Number(r.tags.lanes)>=2 && Number(r.tags.lanes)<=4 && !['yes','1','true','-1'].includes(r.tags.oneway??'')) for(const [dash,size] of dashSegments(a,b)) if(allowed(dash,.3))quad(dash,ux,uz,size,.1,'#e4ddc9');
    }
  }
  for(const obj of data.streets?.objects??[]){
    if(obj.kind!=='crossing' || obj.source!=='osm' || obj.tags.crossing==='unmarked' || obj.tags['crossing:markings']==='no')continue;
    let best=12,match:{ux:number;uz:number;width:number}|undefined;
    for(const r of eligible)for(let i=1;i<r.points.length;i++){
      const a=r.points[i-1]!,b=r.points[i]!,dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(!l)continue;
      const t=Math.max(0,Math.min(1,((obj.point[0]-a[0])*dx+(obj.point[1]-a[1])*dz)/(l*l))),dist=Math.hypot(a[0]+t*dx-obj.point[0],a[1]+t*dz-obj.point[1]);
      if(dist<best){best=dist;match={ux:dx/l,uz:dz/l,width:roadWidth(r.tags)};}
    }
    if(match)for(let n=-Math.floor(match.width/1.2);n<=Math.floor(match.width/1.2);n++){
      const p:Point=[obj.point[0]-match.uz*n*.6,obj.point[1]+match.ux*n*.6];if(allowed(p,.4))quad(p,match.ux,match.uz,2.2,.32,'#eee6d0',.155);
    }
  }
  // Lit et fil de contact : exclusivement les segments ferroviaires réels V6, pas de nouvelle ligne.
  for(const track of data.streets?.tracks??[]) {
  const points=sampleLine(track.points,5);
  for(let i=1;i<points.length;i++){
    const a=points[i-1]!,b=points[i]!,l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l<.1)continue;
    const ux=(b[0]-a[0])/l,uz=(b[1]-a[1])/l,p:Point=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    if(allowed(p,.4)) {quad(p,ux,uz,l,1.9,'#aaa99c',.135);
      const gauge=Number(track.tags.gauge)/1000 || 1.435;
      for(const side of [-1,1])quad([p[0]-uz*side*gauge/2,p[1]+ux*side*gauge/2],ux,uz,l,.065,'#72817c',.17);
      if(track.tags.electrified!=='no')quad(p,ux,uz,l,.035,'#627069',5.65);}
  }
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('color',new Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}
