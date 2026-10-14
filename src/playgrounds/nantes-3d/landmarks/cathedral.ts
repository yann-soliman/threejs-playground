import { Vector3 } from 'three';
import type { Feature, Point } from '../types';
import { footprintFrame, LandmarkBuilder } from './builder';
export interface MonumentPrism { rings: Point[][]; bottom:number; top:number; ground?: readonly [number,number] }
export function cathedralFrame(f:Feature):ReturnType<typeof footprintFrame> {return footprintFrame(f);}
export function frameRing(frame:ReturnType<typeof footprintFrame>,u:number,v:number,w:number,d:number):Point[][] {return [[frame.point(u-w/2,v-d/2),frame.point(u+w/2,v-d/2),frame.point(u+w/2,v+d/2),frame.point(u-w/2,v+d/2)]];}
export function cathedralPrisms(f:Feature):MonumentPrism[]{const frame=cathedralFrame(f),length=frame.maxU-frame.minU,west=frame.minU+9;return [{rings:f.rings,bottom:0,top:19},...[ -12,12 ].map(v=>({rings:frameRing(frame,west,v,17,12),bottom:0,top:63})),{rings:frameRing(frame,west,0,17,12),bottom:0,top:49},{rings:frameRing(frame,(frame.minU+frame.maxU)/2,0,length-12,22),bottom:19,top:55}];}
export function cathedral(b:LandmarkBuilder,f:Feature,base:number):void {
  const frame=cathedralFrame(f),length=frame.maxU-frame.minU,center=(frame.minU+frame.maxU)/2,west=frame.minU+9;
  b.mass(f,base,19,3,'#d9d4c4','hipped');
  const nave:Feature={...f,rings:frameRing(frame,center+2,0,length-20,23)};b.mass(nave,base,55,13,'#e4dfd1');
  // Le massif central porte réellement la baie et rejoint la nef derrière
  // les tours ; les vitrages ne flottent pas devant un volume en retrait.
  b.mass({...f,rings:frameRing(frame,west,0,17,12)},base,49,8,'#e4dfd1');
  for(const side of [-1,1]){
    const [x,z]=frame.point(west,side*12);b.box(x,base+30,z,17,60,12,'#e4decf',frame.angle);
    for(const level of b.lod==='near'?[17,36,51,59]:[36,59])b.box(x,base+level,z,17.6,.6,12.6,'#c5bfad',frame.angle);
    for(const cornerU of [-7,7])for(const cornerV of [-5,5]){const [cx,cz]=frame.point(west+cornerU,side*12+cornerV);b.box(cx,base+60.5,cz,1.2,3,1.2,'#d8d1be',frame.angle);}
    if(b.lod!=='far'){const p=frame.point(frame.minU+.35,side*12);b.window(...[p[0],base+44,p[1],5,11,Math.atan2(-frame.u[0],-frame.u[1]),f.id+':belfry:'+side] as const);}
  }
  if(b.lod==='far')return;
  const facadeAngle=Math.atan2(-frame.u[0],-frame.u[1]);
  for(const v of [-12,0,12]){const p=frame.point(frame.minU-.18,v);b.window(p[0],base+.2,p[1],v===0?6.5:4.2,v===0?13:9,facadeAngle,f.id+':portal:'+v,'#733b39');if(b.lod==='near')for(const offset of [-1,1]){const q=frame.point(frame.minU-.28,v+offset*(v===0?4:2.8));b.box(q[0],base+6,q[1],.8,12,.8,'#bfb9a8');}}
  const window=frame.point(frame.minU+.35,0);b.window(window[0],base+25,window[1],8,15,facadeAngle,f.id+':west-window');
  // Réseau et encadrement gothiques lisibles, sans reproduire les sculptures.
  for(const v of [-4.5,-2,0,2,4.5]){const p=frame.point(frame.minU+.2,v);b.box(p[0],base+31,p[1],.26,v===-4.5||v===4.5?15:11,.26,'#c4bcaa');}
  for(const h of [25,33]){const p=frame.point(frame.minU+.2,0);b.box(p[0],base+h,p[1],.3,.3,9,'#c4bcaa',frame.angle);}
  for(const side of [-1,1]){const a=frame.point(frame.minU+.2,side*6.5),c=frame.point(frame.minU+.2,0);b.beam(new Vector3(a[0],base+41,a[1]),new Vector3(c[0],base+49,c[1]),.6,'#d2cbb8');}

  const count=b.lod==='near'?10:5;
  for(let n=0;n<count;n++)for(const side of [-1,1]){
    const u=frame.minU+23+(length-35)*n/count,p=frame.point(u,side*12),q=frame.point(u,side*19);
    b.box(q[0],base+12,q[1],1.6,24,2.1,'#c8c1af',frame.angle);
    // Arcs-boutants schématisés en deux branches, sans sculpture fine.
    const a=new Vector3(q[0],base+24,q[1]),c=new Vector3(p[0],base+36,p[1]);b.beam(a,c,1.2,'#d1cab8');
    const g=frame.point(u+2,side*11.65);b.window(g[0],base+23,g[1],3.2,11,Math.atan2(frame.v[0]*side,frame.v[1]*side),f.id+':nave:'+n+':'+side);
  }
}
