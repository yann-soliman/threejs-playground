import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Group, InstancedMesh, LatheGeometry, Mesh, MeshStandardMaterial, Object3D, Shape, ShapeGeometry, Vector2, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildingBody, buildingFoundation, buildingRoof, buildingStyle, paint, signedArea } from '../buildings';
import { windowIllumination, windowMaterial } from '../atmosphere';
import type { AtmosphereUniforms } from '../atmosphere';
import type { Feature, Point } from '../types';
import type { DetailLevel } from '../city';
interface Instance { matrix: Float32Array; color: string; light?: number[] }
export function archShape(round = false): Shape {
  const shape = new Shape(); shape.moveTo(-.5, 0); shape.lineTo(.5, 0); shape.lineTo(.5, .62);
  shape.quadraticCurveTo(.5, round ? 1 : .86, 0, 1); shape.quadraticCurveTo(-.5, round ? 1 : .86, -.5, .62); shape.closePath(); return shape;
}
/** Un constructeur par tuile : volumes fusionnés et motifs répétés instanciés, sans renderer. */
export class LandmarkBuilder {
  readonly parts: BufferGeometry[] = [];
  private readonly cubes: Instance[] = [];
  private readonly windows: Instance[] = [];
  private readonly roundWindows: Instance[] = [];
  private readonly dummy = new Object3D();
  constructor(readonly lod: DetailLevel, readonly atmosphere: AtmosphereUniforms) {}
  add(geometry: BufferGeometry, color: string): void {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose(); this.parts.push(paint(flat, new Color(color)));
  }
  box(x:number,y:number,z:number,w:number,h:number,d:number,color:string,angle=0): void {
    this.dummy.position.set(x,y,z); this.dummy.rotation.set(0,angle,0); this.dummy.scale.set(w,h,d); this.dummy.updateMatrix();
    this.cubes.push({matrix:new Float32Array(this.dummy.matrix.elements),color});
  }
  beam(a:Vector3,b:Vector3,width:number,color:string): void {
    const direction=b.clone().sub(a); if(direction.length()<.01)return;
    this.dummy.position.copy(a).add(b).multiplyScalar(.5);this.dummy.quaternion.setFromUnitVectors(new Vector3(0,1,0),direction.clone().normalize());this.dummy.scale.set(width,direction.length(),width);this.dummy.updateMatrix();this.cubes.push({matrix:new Float32Array(this.dummy.matrix.elements),color});
  }
  cylinder(x:number,y:number,z:number,r:number,h:number,color:string,top=r): void { this.add(new CylinderGeometry(top,r,h,this.lod==='near'?24:12).translate(x,y,z),color); }
  cone(x:number,y:number,z:number,r:number,h:number,color:string): void { this.add(new ConeGeometry(r,h,this.lod==='near'?24:12).translate(x,y,z),color); }
  dome(x:number,y:number,z:number,r:number,h:number,color:string): void {
    const count=this.lod==='near'?12:6,points=Array.from({length:count+1},(_,i)=>new Vector2(r*Math.cos(i/count*Math.PI/2),h*Math.sin(i/count*Math.PI/2)));
    this.add(new LatheGeometry(points,this.lod==='near'?24:12).translate(x,y,z),color);
  }
  window(x:number,y:number,z:number,w:number,h:number,angle:number,id:string,color = '#405763',round = false): void {
    this.dummy.position.set(x,y,z);this.dummy.rotation.set(0,angle,0);this.dummy.scale.set(w,h,1);this.dummy.updateMatrix();(round ? this.roundWindows : this.windows).push({matrix:new Float32Array(this.dummy.matrix.elements),color,light:windowIllumination(id)});
  }
  mass(feature:Feature,base:number,height:number,roofHeight:number,color:string,roofShape='gabled',bottom=0): void {
    const style={...buildingStyle(feature),height,roofHeight,roofShape,base:bottom};
    // Même orientation que les empreintes préparées : extérieur horaire,
    // trous antihoraires. Les rectangles procéduraux arrivent dans l'autre sens.
    const normalized={...feature,rings:feature.rings.map((r,i)=>signedArea(r)*(i===0?1:-1)>0?[...r].reverse():r)};
    const facade=new Color(color),roof=buildingRoof(normalized,{...style,roof:new Color('#59616b')});
    // Les pignons verticaux sont maçonnés ; seuls les pans portent l'ardoise.
    const normals=roof.getAttribute('normal'),colors=roof.getAttribute('color');
    for(let i=0;i<normals.count;i++)if(Math.abs(normals.getY(i))<.01)colors.setXYZ(i,facade.r,facade.g,facade.b);
    this.parts.push(buildingBody(normalized,{...style,facade},true).translate(0,base,0));this.parts.push(roof.translate(0,base,0));
  }
  foundation(feature:Feature,minimum:number,base:number,color:string):void {this.parts.push(buildingFoundation(feature,minimum,base,new Color(color),true));}
  facade(feature:Feature,base:number,levels:number,floorHeight:number,round=false):void {
    if(this.lod==='far')return;
    const ring=feature.rings[0]!,sign=Math.sign(signedArea(ring));
    for(let i=0;i<ring.length;i++){
      const a=ring[i]!,b=ring[(i+1)%ring.length]!,dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(l<5)continue;
      const nx=dz/l*sign,nz=-dx/l*sign,angle=Math.atan2(nx,nz),columns=Math.min(12,Math.floor(l/(this.lod==='near'?3.7:7)));
      for(let c=0;c<columns;c++)for(let level=0;level<levels;level++){
        const t=(c+.5)/columns,x=a[0]+dx*t+nx*.18,z=a[1]+dz*t+nz*.18;
        this.window(x,base+(level+.2)*floorHeight,z,1.25,2.1,angle,feature.id+':'+i+':'+c+':'+level,'#405763',round);
        if(this.lod==='near')this.box(x,base+(level+.2)*floorHeight-.08,z,1.55,.14,.34,'#d7d0bd',angle);
      }
    }
  }
  finish():Group {
    const group=new Group();
    if(this.parts.length){const g=mergeGeometries(this.parts,false);this.parts.forEach(p=>p.dispose());if(!g)throw new Error('Assemblage des monuments impossible');const mesh=new Mesh(g,new MeshStandardMaterial({vertexColors:true,roughness:.82}));mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
    const instances=(geometry:BufferGeometry,list:Instance[],glass=false):void=>{
      if(!list.length){geometry.dispose();return;}
      const material=glass?windowMaterial(geometry,list.flatMap(p=>p.light??[0,0,0]),this.atmosphere):new MeshStandardMaterial({roughness:.8});
      const mesh=new InstancedMesh(geometry,material,list.length);mesh.castShadow=!glass;mesh.receiveShadow=!glass;
      list.forEach((p,i)=>{this.dummy.matrix.fromArray(p.matrix);mesh.setMatrixAt(i,this.dummy.matrix);mesh.setColorAt(i,new Color(p.color));});mesh.computeBoundingSphere();group.add(mesh);
    };
    instances(new BoxGeometry(1,1,1),this.cubes);instances(new ShapeGeometry(archShape()),this.windows,true);instances(new ShapeGeometry(archShape(true)),this.roundWindows,true);group.userData.windows = this.windows.length + this.roundWindows.length;return group;
  }
}
export function footprintFrame(feature:Feature):{center:Point;u:Point;v:Point;minU:number;maxU:number;minV:number;maxV:number;point:(u:number,v:number)=>Point;angle:number} {
  const ring=feature.rings[0]!,center:Point=[ring.reduce((n,p)=>n+p[0],0)/ring.length,ring.reduce((n,p)=>n+p[1],0)/ring.length];
  let ux=1,uz=0,longest=0;
  for(let i=0;i<ring.length;i++){const a=ring[i]!,b=ring[(i+1)%ring.length]!,l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l>longest){longest=l;ux=(b[0]-a[0])/l;uz=(b[1]-a[1])/l;}}
  if(ux<0){ux=-ux;uz=-uz;}const u:Point=[ux,uz],v:Point=[-uz,ux],us=ring.map(p=>(p[0]-center[0])*ux+(p[1]-center[1])*uz),vs=ring.map(p=>-(p[0]-center[0])*uz+(p[1]-center[1])*ux);
  return {center,u,v,minU:Math.min(...us),maxU:Math.max(...us),minV:Math.min(...vs),maxV:Math.max(...vs),point:(a,b)=>[center[0]+ux*a-uz*b,center[1]+uz*a+ux*b],angle:Math.atan2(-uz,ux)};
}
