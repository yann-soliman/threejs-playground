import { BoxGeometry, Color, CylinderGeometry, IcosahedronGeometry, Group, InstancedMesh, MeshStandardMaterial, Object3D, PlaneGeometry } from 'three';
import type { BufferGeometry } from 'three';
import { landmarkForFeature } from './landmarks/registry';
import { buildingStyle, seedOf, signedArea } from './buildings';
import { streetLightMaterial, windowMaterial } from './atmosphere';
import type { AtmosphereUniforms } from './atmosphere';
import type { CityData, Feature, Point } from './types';
import type { DetailLevel } from './city';
import { inFootprint } from './selection';

export interface StreetObject { id: string; kind: string; point: Point; tags: Record<string, string>; source: 'osm' | 'estimated'; angle?: number }
export interface StreetData {
  objects: StreetObject[];
  roads: Record<string, Record<string, string>>;
  tracks: { id: string; points: Point[]; tags: Record<string, string>; source: 'osm' }[];
  businesses: Record<string, { id: string; tags: Record<string, string> }[]>;
}
interface Part { x: number; y: number; z: number; w: number; h: number; d: number; angle: number; color: string }
export function decoratedBuilding(feature: Feature): boolean {
  return !landmarkForFeature(feature) && !['industrial', 'warehouse', 'shed', 'garage', 'garages', 'roof', 'ruins', 'cathedral', 'church', 'construction', 'service'].includes(feature.tags.building ?? '') && !feature.tags.historic;
}
export function storefront(feature: Feature, businesses: StreetData['businesses'] = {}): 'osm' | 'estimated' | undefined {
  if (!decoratedBuilding(feature)) return undefined;
  if (businesses[feature.id]?.length || feature.tags.shop || feature.tags.building === 'retail') return 'osm';
  return ['apartments', 'residential', 'terrace', 'yes'].includes(feature.tags.building ?? '') && seedOf(feature.id) % 7 === 0 ? 'estimated' : undefined;
}
/** Test conservateur supplémentaire au filtrage hors ligne : aucun meuble dans une empreinte/eau. */
export function streetExclusion(data: CityData): (point: Point, radius?: number, ignore?: string) => boolean {
  const bins = new Map<string, Feature[]>();
  for (const f of [...data.buildings, ...data.surfaces.filter(f=>f.kind==='water' || ['no','private'].includes(f.tags.access??''))]) {
    const points=f.rings.flat(),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
    for(let x=Math.floor(Math.min(...xs)/32);x<=Math.floor(Math.max(...xs)/32);x++) for(let z=Math.floor(Math.min(...zs)/32);z<=Math.floor(Math.max(...zs)/32);z++) {
      const key=`${x}_${z}`,list=bins.get(key)??[];list.push(f);bins.set(key,list);
    }
  }
  return (point,radius=.7,ignore)=> {
    const probes:Point[]=[point,[point[0]-radius,point[1]],[point[0]+radius,point[1]],[point[0],point[1]-radius],[point[0],point[1]+radius]];
    return probes.every(([x,z])=>!(bins.get(`${Math.floor(x/32)}_${Math.floor(z/32)}`)??[]).some(f=>f.id!==ignore && inFootprint(f,x,z)));
  };
}
export function furnitureAllowed(data: CityData, point: Point, radius = .7): boolean {
  return streetExclusion(data)(point,radius);
}
export function markingEligible(tags: Record<string,string>): boolean {
  return ['residential', 'tertiary', 'secondary', 'primary', 'unclassified'].includes(tags.highway ?? '') && (!tags.tunnel || tags.tunnel === 'no') && Number(tags.layer ?? '0') === 0 && (!tags.bridge || tags.bridge === 'no') && !['unpaved','gravel','ground'].includes(tags.surface ?? '');
}
/** Petits lots instanciés, préparés dans le worker et transférés comme le reste de la ville. */
export function createStreetDetails(data: CityData, lod: DetailLevel, sample: (x:number,z:number)=>number, bases: Record<string, number[]>, atmosphere: AtmosphereUniforms): Group {
  const group = new Group(); if (lod === 'far') return group;
  const allowed = streetExclusion(data);
  const boxes: Part[] = [], planes: Part[] = [], poles: Part[] = [], bulbs: Part[] = [], shrubs: Part[] = [];
  const add = (list:Part[], x:number,y:number,z:number,w:number,h:number,d:number,color:string,angle=0):void => { if ([x,y,z,w,h,d,angle].every(Number.isFinite)) list.push({x,y,z,w,h,d,color,angle}); };
  for (const f of data.buildings) {
    if (!decoratedBuilding(f)) continue;
    const s=buildingStyle(f), seed=seedOf(f.id), base=bases[f.id]?.[1] ?? Math.max(...f.rings[0]!.map(([x,z])=>sample(x,z)));
    if (s.base>0 || s.height<4) continue;
    const ring=f.rings[0]!, sign=Math.sign(signedArea(ring));
    const edges=ring.map((a,i)=>{const b=ring[(i+1)%ring.length]!;return {a,b,length:Math.hypot(b[0]-a[0],b[1]-a[1])};}).sort((a,b)=>b.length-a.length).slice(0,2);
    for (let edge=0;edge<edges.length;edge++) {
      const {a,b,length}=edges[edge]!;if(length<4) continue;
      const dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length,nx=dz*sign,nz=-dx*sign,angle=Math.atan2(nx,nz);
      const outside:Point=[(a[0]+b[0])/2+nx,(a[1]+b[1])/2+nz];
      if(!allowed(outside,0,f.id))continue;
      const at=(list:Part[], t:number,y:number,w:number,h:number,depth:number,color:string,offset=.16):void=>add(list,a[0]+dx*length*t+nx*offset,base+y,a[1]+dz*length*t+nz*offset,w,h,depth,color,angle);
      const floor=(s.height-s.roofHeight)/s.levels;
      if(lod==='medium') { at(planes,.5,Math.min(2.2,s.height/2),Math.min(length*.7,6),1.1,.01,'#6e7b7e');continue; }
      if(edge<2) {
        at(boxes,.5,1.25,1.36,2.5,.2,'#cbbfa7');at(planes,.5,1.17,1.08,2.28,.01,seed%2?'#485e57':'#775a43',.28);
        at(boxes,.5,2.62,1.65,.14,.38,'#e7ddc8');
        if(storefront(f,data.streets?.businesses) && length>8 && floor>2.4) {
          const t=.23;at(planes,t,1.25,2.25,2.1,.01,'#314f59');at(boxes,t,2.6,2.6,.35,.12,seed%2?'#556c61':'#79534b');
          at(boxes,t,2.9,2.7,.14,1.05,seed%2?'#748773':'#9a7160',.5);
          at(boxes,t,2.65,2.7,.4,.12,seed%2?'#748773':'#9a7160',1.02);
          at(planes,t,1.7,2.05,.1,.01,'#d1b98b',.19); // Aucune identité commerciale inventée.
        }
      }
      const columns=Math.floor(length/3.2);
      for(let c=0;c<Math.min(columns,3);c++) for(let level=1;level<Math.min(s.levels,4);level++) {
        const t=(c+.5)/columns,y=(level+.52)*floor+.16;
        at(boxes,t,y-.88,1.3,.1,.28,'#e2dac8');
        if((seed+c+level)%4===0) {for(const side of [-1,1]) at(planes,t+side*.76/length,y,.38,1.65,.01,seed%3?'#758579':'#8b9aab',.14);}
        if(level===1 && c===1 && seed%3===0 && floor>2.6) {
          at(boxes,t,y-1,1.95,.12,.8,'#b9b4a7',.46);at(boxes,t,y-.45,1.95,.06,.06,'#46534e',.85);
          for(const shift of [-.85,-.42,0,.42,.85]) at(boxes,t+shift/length,y-.7,.045,.6,.045,'#46534e',.85);
        }
      }
    }
    if(seed%3===0 && s.roofHeight>0) {
      // Position sur une vraie empreinte (hors cour), pied sur le toit, hauteur stylisée.
      const p=ring[0]!,q=ring[1]!;const x=p[0]*.7+q[0]*.3,z=p[1]*.7+q[1]*.3;
      add(boxes,x,base+s.height-s.roofHeight+1,z,.55,2.1,.55,'#9a8170');add(boxes,x,base+s.height-s.roofHeight+2.08,z,.7,.12,.7,'#c4b8a0');
    }
  }
  if(lod==='near') for(const object of data.streets?.objects ?? []) {
    if(object.kind==='crossing' || !allowed(object.point,object.kind==='bench'?1:.7)) continue;
    const [x,z]=object.point,y=sample(x,z)+.14,angle=object.angle ?? seedOf(object.id)%628/100;
    const b=(ox:number,oy:number,oz:number,w:number,h:number,d:number,color:string):void=>add(boxes,x+Math.cos(angle)*ox+Math.sin(angle)*oz,y+oy,z-Math.sin(angle)*ox+Math.cos(angle)*oz,w,h,d,color,angle);
    if(object.kind==='lamp' || object.kind==='tram-pole') {
      add(poles,x,y+2.7,z,.13,5.4,.13,'#53615c');b(.55,5.2,0,1.2,.12,.12,'#53615c');
      if(object.kind==='lamp') {add(bulbs,x+.9*Math.cos(angle),y+5.1,z-.9*Math.sin(angle),.48,.16,.28,'#fff0bd',angle);}
      else {b(1.15,5.5,0,2.4,.07,.07,'#53615c');}
    } else if(object.kind==='bench') {
      for(const dz of [-.2,0,.2]) b(0,.48,dz,1.8,.1,.16,'#96765a');b(0,.86,.28,1.8,.35,.09,'#96765a');for(const dx of [-.65,.65]) b(dx,.22,0,.12,.44,.5,'#53615c');
    } else if(object.kind==='bin') {add(poles,x,y+.44,z,.55,.88,.55,'#65776b');b(0,.88,0,.62,.08,.62,'#465851');}
    else if(object.kind==='bicycle') {for(const dx of [-.65,0,.65]) {b(dx,.4,-.28,.055,.8,.055,'#697575');b(dx,.4,.28,.055,.8,.055,'#697575');b(dx,.8,0,.055,.055,.56,'#697575');}}
    else if(object.kind==='bollard') {add(poles,x,y+.4,z,.16,.8,.16,'#5b6562');b(0,.72,0,.18,.12,.18,'#cfbba0');}
    else if(object.kind==='bus'||object.kind==='tram-stop') {b(0,1.3,0,.09,2.6,.09,'#5a6860');b(0,2.5,0,.6,.4,.09,object.kind==='bus'?'#82935e':'#428966');}
  }
  if(lod==='near') {
    let count=0;
    for(const surface of data.surfaces.filter(s=>s.kind==='green' && !['no','private'].includes(s.tags.access ?? ''))) {
      const points=surface.rings.flat(),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
      for(let x=Math.ceil(Math.min(...xs)/35)*35;x<Math.max(...xs) && count<24;x+=35) for(let z=Math.ceil(Math.min(...zs)/35)*35;z<Math.max(...zs) && count<24;z+=35) {
        if(!inFootprint(surface,x,z) || !allowed([x,z],1.5))continue;
        const nearRoad=data.roads.some(r=>r.points.slice(1).some((b,i)=>{const a=r.points[i]!,dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz,t=length?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/length)):0;return Math.hypot(a[0]+t*dx-x,a[1]+t*dz-z)<12;}));if(nearRoad)continue;
        const seed=seedOf(`${x}:${z}:shrub`);add(shrubs,x,sample(x,z)+.6,z,1.4,.9,1.2,['#8ba477','#769564','#a2b58b'][seed%3]!);count++;
      }
    }
  }
  const dummy=new Object3D();
  const build=(parts:Part[],geometry:BufferGeometry,glowing=false):void=> {
    if(!parts.length){geometry.dispose();return;}
    const material=glowing?windowMaterial(geometry,parts.flatMap(()=>[1.5,.92,.4]),atmosphere):new MeshStandardMaterial({roughness:.84});
    const mesh=new InstancedMesh(geometry,material,parts.length);mesh.receiveShadow=!glowing;
    parts.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.angle,0);dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new Color(p.color));});mesh.computeBoundingSphere();group.add(mesh);
  };
  build(boxes,new BoxGeometry(1,1,1));build(planes,new PlaneGeometry(1,1));build(poles,new CylinderGeometry(.5,.5,1,6));build(bulbs,new BoxGeometry(1,1,1),true);build(shrubs,new IcosahedronGeometry(1,0));
  if(bulbs.length) {
    const geometry=new PlaneGeometry(1,1), material=streetLightMaterial(atmosphere), mesh=new InstancedMesh(geometry,material,bulbs.length);
    bulbs.forEach((p,i)=>{dummy.position.set(p.x,sample(p.x,p.z)+.23,p.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(5,5,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.computeBoundingSphere();group.add(mesh);
  }
  return group;
}
