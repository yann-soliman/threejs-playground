import { CylinderGeometry } from 'three';
import type { Feature } from '../types';
import type { LandmarkSupport } from './registry';
import { LandmarkBuilder } from './builder';
export const luCenter = [468.04,15.88] as const;
export function tourLu(b:LandmarkBuilder,f:Feature,base:number,support:LandmarkSupport|undefined,sample:(x:number,z:number)=>number):void {
  const hall={...f,rings:support?.visualRings ?? f.rings};
  if(support?.visualRings)b.mass(hall,base,10,0,'#c7b79f','flat');else if(b.lod==='far')b.mass(f,base,10,0,'#c7b79f','flat');
  for(const part of support?.parts??[]){
    if(['way/288814718','way/288814724','way/288814726'].includes(part.id))b.mass(part,base,Number(part.tags.height),Number(part.tags['roof:height']??'0'),'#c4baa8',part.tags['roof:shape']??'flat',10);
  }
  const [x,z]=luCenter,ground=sample(x,z),r=4.24;
  b.cylinder(x,ground+8.5,z,r,17,'#bc9877');b.cylinder(x,ground+1,z,r+.1,2,'#d8ceba');
  for(const height of [6,11,16.8])b.cylinder(x,ground+height,z,r+.16,.45,'#e6d8b2');
  b.cylinder(x,ground+20,z,3.9,6,'#e3d9bf');b.dome(x,ground+23,z,r,2,'#e4dac5');b.cylinder(x,ground+26.5,z,1.08,3,'#d5b978');
  b.cylinder(x,ground+28,z,1.52,.5,'#d7c28a');b.cylinder(x,ground+29,z,1.35,2,'#718d91');b.dome(x,ground+30,z,1.35,2,'#7cafbf');
  b.box(x,ground+33.4,z,1.75,1.8,1.75,'#a28a63',.51);b.cone(x,ground+36,z,.45,4,'#b9a679');
  if(b.lod==='far')return;
  b.facade(hall,base,2,4.5,true);
  for(let n=0;n<8;n++){const a=n/8*Math.PI*2,nx=Math.sin(a),nz=Math.cos(a);b.box(x+nx*r,ground+8.5,z+nz*r,.3,16.5,.24,'#e4dac4',a);b.window(x+nx*(r+.06),ground+4.5,z+nz*(r+.06),1,3.2,a,f.id+':lu:'+n,'#617c87',true);b.window(x+nx*3.94,ground+17.7,z+nz*3.94,2.2,4.6,a,f.id+':lantern:'+n,'#71989e',true);}
  if(b.lod==='near'){
    for(const a of [.51,.51+Math.PI/2,.51+Math.PI,.51+3*Math.PI/2]){const nx=Math.sin(a),nz=Math.cos(a),clock=new CylinderGeometry(.55,.55,.06,24);clock.rotateX(Math.PI/2);clock.rotateY(a);clock.translate(x+nx*.91,ground+33.4,z+nz*.91);b.add(clock,'#eddfbc');b.box(x+nx*.96,ground+33.65,z+nz*.96,.035,.5,.035,'#40534f',a);b.box(x+nx*.97,ground+33.4,z+nz*.97,.45,.035,.035,'#40534f',a);}
  }
}
