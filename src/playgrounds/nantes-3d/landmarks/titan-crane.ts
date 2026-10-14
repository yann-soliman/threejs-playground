import { Vector3 } from 'three';
import type { Feature } from '../types';
import { footprintFrame, LandmarkBuilder } from './builder';
export function titanCrane(b:LandmarkBuilder,f:Feature,base:number,sample:(x:number,z:number)=>number):void {
  const frame=footprintFrame(f),yellow='#dcae32',dark='#997b27';
  const at=(u:number,y:number,v=0):Vector3=>{const [x,z]=frame.point(u,v);return new Vector3(x,base+y,z);};
  for(const u of [-5.4,5.4])for(const v of [-2.6,2.6]){
    const bottom=at(u,0,v);bottom.y=sample(bottom.x,bottom.z)+.12;b.box(bottom.x,bottom.y+.45,bottom.z,1.2,.9,1.8,dark,frame.angle);b.beam(bottom,at(u*.55,12,v*.45),1.3,yellow);
  }
  b.beam(at(-4,10,-1.6),at(4,10,-1.6),1.1,yellow);b.beam(at(-4,10,1.6),at(4,10,1.6),1.1,yellow);
  const center=frame.point(0,0);b.cylinder(center[0],base+23,center[1],3.4,24,yellow,2.2);
  const cabin=frame.point(4,0);b.box(cabin[0],base+37,cabin[1],8,6,5,yellow,frame.angle);
  const counter=frame.point(9,0);b.box(counter[0],base+39,counter[1],5,3.8,5.5,dark,frame.angle);
  for(const side of [-1,1])for(const height of [40.5,43])b.beam(at(-32,height,side*1.5),at(12,height,side*1.5),.32,yellow);
  const step=b.lod==='near'?4:b.lod==='medium'?8:16;
  for(let u=-32;u<12;u+=step)for(const side of [-1,1]){
    b.beam(at(u,40.5,side*1.5),at(Math.min(12,u+step),43,side*1.5),.19,yellow);
    if(b.lod!=='far')b.beam(at(u,43,side*1.5),at(Math.min(12,u+step),40.5,side*1.5),.19,yellow);
    b.beam(at(u,43,-1.5),at(u,43,1.5),.2,yellow);
  }
  if(b.lod!=='far'){b.beam(at(-28,40.5),at(-28,25),.08,'#4e554e');b.box(...[at(-28,24.5).x,base+24.5,at(-28,24.5).z,.6,1,.5,dark] as const);const p=frame.point(4,2.55);b.window(p[0],base+36,p[1],3.5,2,Math.atan2(frame.v[0],frame.v[1]),f.id+':cab');}
}
