import type { Feature, Point } from '../types';
import { signedArea } from '../buildings';
import { castleRoles } from './registry';
import { footprintFrame, LandmarkBuilder } from './builder';
/** Centres interprétés dans les lobes OSM ; communs au rendu et aux obstacles. */
export function castleTowers(f:Feature):{point:Point;radius:number;top:number}[] {
  const role=castleRoles[f.id];
  if(role==='government')return [{point:[181.4,-87.3],radius:6.2,top:32},{point:[176.1,-68.4],radius:6.2,top:32}];
  if(role==='logis')return [{point:[172.3,-29.2],radius:6.2,top:32},{point:[194.5,-51],radius:2.25,top:33}];
  if(role==='gate'){const frame=footprintFrame(f);return [{point:frame.point(frame.minU+7,0),radius:6.3,top:30}];}
  return [];
}
export function castlePart(b:LandmarkBuilder,f:Feature,base:number):void {
  const role=castleRoles[f.id],frame=footprintFrame(f);
  if(role==='ruin'){b.mass(f,base,Math.max(.5,Number.parseFloat(f.tags.height??'1')),0,'#b6aa95','flat');return;}
  const wall=role==='wall',tower=role==='tower',gate=role==='gate';
  const height=wall?9:tower?18:gate?20:role==='hall'?18:28,roof=wall||tower?0:gate?10:role==='hall'?5:8;
  b.mass(f,base,height,roof,role==='government'?'#d4ccba':'#ded6c5',tower||wall?'flat':'gabled');
  const ring=f.rings[0]!;
  if((wall||tower)&&b.lod!=='far'){
    const stride=b.lod==='near'?2.6:5.2;
    for(let i=0;i<ring.length;i++){
      const a=ring[i]!,c=ring[(i+1)%ring.length]!,dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz),count=Math.floor(length/stride);if(!count)continue;
      for(let n=0;n<count;n++){const t=(n+.5)/count;b.box(a[0]+dx*t,base+height+.75,a[1]+dz*t,1.2,1.4,.85,'#d4c9b4',Math.atan2(-dz,dx));}
    }
  } else {
    b.facade(f,base,role==='hall'?3:4,role==='hall'?3.8:4.8);
    if(b.lod==='near'){
      // Lucarnes et cheminées : rythme stylisé, sur les volumes des véritables logis.
      const sign=Math.sign(signedArea(ring));
      for(let i=0;i<ring.length;i++){
        const a=ring[i]!,c=ring[(i+1)%ring.length]!,dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);if(length<12)continue;
        for(let n=0;n<Math.min(5,Math.floor(length/8));n++){const t=(n+1)/(Math.floor(length/8)+1),x=a[0]+dx*t-dz/length*sign*.8,z=a[1]+dz*t+dx/length*sign*.8;
          b.box(x,base+height-roof+2,z,1.6,3,1.2,'#e2d8c2',Math.atan2(-dz,dx));b.cone(x,base+height-roof+4,z,1.1,1.5,'#525c65');}
      }
    }
  }
  if(gate){const [x,z]=frame.point(frame.minU+7,0);b.cylinder(x,base+10,z,6.3,20,'#d9cdb7');b.cone(x,base+25,z,6.9,10,'#535e69');}
  if(role==='government'||role==='logis') {
    // Tours engagées : centres estimés dans les lobes réellement cartographiés.
    const centers=castleTowers(f).filter(t=>t.radius===6.2).map(t=>t.point);
    for(const [x,z] of centers){
      b.cylinder(x!,base+9.5,z!,6.2,19,'#cfc5af');b.cylinder(x!,base+18.6,z!,6.6,.6,'#d9cfb7');
      b.cylinder(x!,base+20,z!,6.5,2,'#e7dfca');b.cylinder(x!,base+22.75,z!,7,3.5,'#56616d',5.5);
      const roofFeature={...f,rings:[[[x!-5.5,z!-6],[x!+5.5,z!-6],[x!+5.5,z!+6],[x!-5.5,z!+6]]] as Feature['rings']};b.mass(roofFeature,base+24.5,7.5,7.5,'#e2d8c3');
      if(b.lod!=='far')for(let n=0;n<8;n++){const a=n/8*Math.PI*2;b.window(x!+Math.sin(a)*6.56,base+19.4,z!+Math.cos(a)*6.56,.6,.9,a,f.id+':upper-tower:'+x+':'+n);}
      if(b.lod==='near')for(let n=0;n<16;n++){const a=n/16*Math.PI*2;b.box(x!+Math.sin(a)*6.6,base+17.7,z!+Math.cos(a)*6.6,.55,1,.8,'#b8ad96',a);}
    }
    if(role==='logis'){b.cylinder(194.5,base+13,-51,2.25,26,'#e1d8c3');b.cone(194.5,base+29.5,-51,2.8,7,'#53616c');}
  }
}
