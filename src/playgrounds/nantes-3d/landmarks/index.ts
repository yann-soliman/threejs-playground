import type { CityData, Feature, Point } from '../types';
import type { DetailLevel } from '../city';
import type { AtmosphereUniforms } from '../atmosphere';
import { castlePart, castleTowers } from './castle';
import { cathedral, cathedralPrisms, frameRing } from './cathedral';
import type { MonumentPrism } from './cathedral';
import { tourLu, luCenter } from './tour-lu';
import { titanCrane } from './titan-crane';
import { passagePommeraye } from './passage-pommeraye';
import { footprintFrame, LandmarkBuilder } from './builder';
import { landmarkForFeature, landmarkHeight } from './registry';
import craneData from '../data/titan.json';
import { inFootprint } from '../selection';
export function augmentLandmarkData(data:CityData,tileId:string):CityData {
  if(tileId!=='-3_2'||data.buildings.some(f=>f.id==='way/288905411'))return data;
  return {...data,buildings:[...data.buildings,{ ...craneData.feature, rings: craneData.feature.rings.map(r=>r.map(p=>[p[0]!,p[1]!] as Point)) }]};
}
export function landmarkPrisms(f:Feature):MonumentPrism[] {
  const landmark=landmarkForFeature(f);
  if(landmark?.id==='castle')return [{rings:f.rings,bottom:0,top:landmarkHeight(f)},...castleTowers(f).map(t=>({rings:[Array.from({length:16},(_,i)=>[t.point[0]+Math.sin(i/16*Math.PI*2)*t.radius,t.point[1]+Math.cos(i/16*Math.PI*2)*t.radius] as Point)],bottom:0,top:t.top}))];
  if(landmark?.id==='cathedral')return cathedralPrisms(f);
  if(landmark?.id==='tour-lu'){
    const ring:Point[]=Array.from({length:16},(_,i)=>[luCenter[0]+Math.sin(i/16*Math.PI*2)*4.24,luCenter[1]+Math.cos(i/16*Math.PI*2)*4.24]);return [{rings:f.rings,bottom:0,top:10},{rings:[ring],bottom:0,top:38,ground:luCenter}];
  }
  if(landmark?.id==='titan'){const frame=footprintFrame(f);return [{rings:f.rings,bottom:0,top:36},{rings:frameRing(frame,-10,0,44,3.5),bottom:40,top:43},{rings:frameRing(frame,4,0,8,5),bottom:34,top:40}];}
  return [{rings:f.rings,bottom:0,top:landmarkHeight(f)}];
}
export function landmarkCollisionFeatures(data:CityData):Feature[] {
  return data.buildings.flatMap(f=>{
    if(landmarkForFeature(f)?.id==='castle')return landmarkPrisms(f).slice(1).map((p,i)=>({id:f.id+':tower:'+i,rings:p.rings,tags:{building:'roof'}}));
    if(landmarkForFeature(f)?.id==='titan'){
      const frame=footprintFrame(f);
      return [-5.4,5.4].flatMap(u=>[-2.6,2.6].map((v,i)=>({id:f.id+':foot:'+u+':'+i,rings:frameRing(frame,u,v,1.3,1.9),tags:{building:'roof'}})));
    }
    if(landmarkForFeature(f)?.id!=='cathedral')return [];
    const frame=footprintFrame(f),length=frame.maxU-frame.minU;
    const additions=cathedralPrisms(f).filter(p=>p.bottom===0).slice(1);
    for(let n=0;n<10;n++)for(const side of [-1,1])additions.push({rings:frameRing(frame,frame.minU+23+(length-35)*n/10,side*19,1.6,2.1),bottom:0,top:24});
    return additions.map((p,i)=>({id:f.id+':solid:'+i,rings:p.rings,tags:{building:'roof'}}));
  });
}
export function createLandmarks(data:CityData,lod:DetailLevel,sample:(x:number,z:number)=>number,bases:Record<string,number[]>,atmosphere:AtmosphereUniforms):ReturnType<LandmarkBuilder['finish']> {
  const builder=new LandmarkBuilder(lod,atmosphere);
  for(const f of data.buildings){
    const landmark=landmarkForFeature(f);if(!landmark)continue;
    const levels=bases[f.id]??[Math.min(...f.rings[0]!.map(p=>sample(...p))),Math.max(...f.rings[0]!.map(p=>sample(...p)))],base=levels[1]!;
    if(landmark.id!=='titan')builder.foundation(f,levels[0]!,base,'#bdb5a3');
    if(landmark.id==='castle')castlePart(builder,f,base);
    else if(landmark.id==='cathedral')cathedral(builder,f,base);
    else if(landmark.id==='tour-lu')tourLu(builder,f,base,data.landmarks,sample);
    else if(landmark.id==='titan')titanCrane(builder,f,base,sample);
    else passagePommeraye(builder,f,base,sample,data.landmarks);
  }
  return builder.finish();
}

/** Masque uniquement les appuis ajoutés ; les parcours OSM V6 restent inchangés. */
export function landmarkSurfaceSampler(data:CityData,sample:(x:number,z:number)=>number):(x:number,z:number)=>number {
  const obstacles=landmarkCollisionFeatures(data);
  return obstacles.length ? (x,z)=>obstacles.some(f=>inFootprint(f,x,z)) ? NaN : sample(x,z) : sample;
}
