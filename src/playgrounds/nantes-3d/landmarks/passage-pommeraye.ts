import type { Feature } from '../types';
import type { LandmarkSupport } from './registry';
import { signedArea } from '../buildings';
import { footprintFrame, LandmarkBuilder } from './builder';
export function passagePommeraye(b:LandmarkBuilder,f:Feature,base:number,sample:(x:number,z:number)=>number,support?:LandmarkSupport):void {
  b.mass(f,base,22,4,'#d8d0bb','hipped');if(b.lod==='far')return;
  b.facade(f,base,3,4.6,true);const ring=f.rings[0]!,sign=Math.sign(signedArea(ring));
  // Ancrages issus des extrémités OSM des trois voies couvertes ; projection sur
  // la façade la plus proche, sans ouvrir ni modifier la collision du bâtiment.
  for(const entrance of support?.entrances??[]){
    const edges=ring.map((a,i)=>{
      const c=ring[(i+1)%ring.length]!,dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);
      const t=Math.max(0,Math.min(1,((entrance.point[0]-a[0])*dx+(entrance.point[1]-a[1])*dz)/(length*length)));
      const x=a[0]+dx*t,z=a[1]+dz*t;return {a,c,length,x,z,distance:Math.hypot(x-entrance.point[0],z-entrance.point[1])};
    }).filter(e=>e.length>1).sort((a,c)=>a.distance-c.distance);
    const {a,c,length,x,z}=edges[0]!,nx=(c[1]-a[1])/length*sign,nz=-(c[0]-a[0])/length*sign,angle=Math.atan2(nx,nz),ground=sample(x+nx,z+nz);
    b.window(x+nx*.2,ground+.15,z+nz*.2,4.4,6.5,angle,f.id+':entrance:'+x);
    for(const side of [-1,1]){const dx=(c[0]-a[0])/length*side*2.7,dz=(c[1]-a[1])/length*side*2.7;b.box(x+dx+nx*.4,ground+3.5,z+dz+nz*.4,.55,7,.6,'#e8dfc8',angle);b.box(x+dx+nx*.45,ground+7.1,z+dz+nz*.45,.9,.3,.9,'#c2b69e',angle);}
    b.box(x+nx*.5,ground+7.5,z+nz*.5,6.4,.5,1,'#d8ccb1',angle);
    if(b.lod==='near')for(const side of [-1,1]){const dx=(c[0]-a[0])/length*side*1.6,dz=(c[1]-a[1])/length*side*1.6;b.cylinder(x+dx+nx*.5,ground+9.1,z+dz+nz*.5,.23,1.5,'#c7bfae');b.dome(x+dx+nx*.5,ground+9.9,z+dz+nz*.5,.23,.3,'#c7bfae');}
  }
  // Verrière extérieure interprétée ; aucune galerie ou circulation nouvelle.
  const frame=footprintFrame(f),length=Math.min(55,frame.maxU-frame.minU-10),[x,z]=frame.point(0,0);
  b.box(x,base+22.25,z,length,.22,5.5,'#8da2a2',frame.angle);
  for(let u=-length/2;u<length/2;u+=b.lod==='near'?3.5:7){const p=frame.point(u,0);b.box(p[0],base+22.4,p[1],.12,.3,5.8,'#485c5b',frame.angle);}
}
