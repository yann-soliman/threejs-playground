import { describe, expect, it, vi } from 'vitest';
import { Mesh, InstancedMesh, Vector3 } from 'three';
import { atmosphereUniforms, streetLightMaterial } from '../src/playgrounds/nantes-3d/atmosphere';
import { createStreetDetails, decoratedBuilding, furnitureAllowed, markingEligible, storefront } from '../src/playgrounds/nantes-3d/street-details';
import { dashSegments, streetRoadGeometry } from '../src/playgrounds/nantes-3d/street-roads';
import { packGeometry, unpackGeometry } from '../src/playgrounds/nantes-3d/geometry-wire';
import { createCity } from '../src/playgrounds/nantes-3d/city';
import { Walker, WalkingWorld, movementKey } from '../src/playgrounds/nantes-3d/walking';
import type { CityData, Feature } from '../src/playgrounds/nantes-3d/types';
import city from '../src/playgrounds/nantes-3d/data/city.json';
const house:Feature={id:'way/4',rings:[[[20,20],[40,20],[40,40],[20,40]]],tags:{building:'apartments',height:'13','building:levels':'4'}};
const data:CityData={...city as unknown as CityData,buildings:[house],roads:[{id:'way/2/0',points:[[0,10],[100,10]],tags:{highway:'residential',lanes:'2'}}],surfaces:[],walls:[],trees:[],streets:{objects:[{id:'node/1',kind:'lamp',point:[50,8],source:'osm',tags:{}},{id:'node/2',kind:'bench',point:[60,8],source:'osm',tags:{}},{id:'node/3',kind:'crossing',point:[70,10],source:'osm',tags:{highway:'crossing'}}],roads:{},tracks:[],businesses:{}}};
function walker():Walker {const w=new WalkingWorld({},[[[[-100,-100],[1000,-100],[1000,1000],[-100,1000]]]]);w.setTile('0_0',{...data,buildings:[],roads:[]},()=>0);const player=new Walker(w);player.position.set(100,1.82,100);player.keys.add('forward');return player;}
function clear(group:ReturnType<typeof createStreetDetails>):void {group.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());if(o instanceof InstancedMesh)o.dispose();}});group.clear();}
describe('Détails de rue V7',()=>{
  it('est déterministe, borné, valide et absent au LOD lointain',()=>{
    const a=createStreetDetails(data,'near',(x)=>x*.03,{},atmosphereUniforms()),b=createStreetDetails(data,'near',(x)=>x*.03,{},atmosphereUniforms());
    const packet=(g:typeof a)=>packGeometry({group:g,surfaceElevation:()=>0,windows:0,estimatedHeights:0,dispose:()=>{}},0).packet;
    expect(packet(a).geometries).toEqual(packet(b).geometries);expect(packet(a).meshes).toEqual(packet(b).meshes);expect(a.children.length).toBeLessThanOrEqual(6);
    for(const o of a.children){expect(o).toBeInstanceOf(InstancedMesh);if(o instanceof InstancedMesh){expect([...o.instanceMatrix.array].every(Number.isFinite)).toBe(true);expect(o.count).toBeLessThan(300);}}
    const far=createStreetDetails(data,'far',()=>0,{},atmosphereUniforms());expect(far.children).toHaveLength(0);
    const medium=createStreetDetails(data,'medium',()=>0,{},atmosphereUniforms());expect(medium.children.length).toBe(1);clear(a);clear(b);clear(far);clear(medium);
  });
  it('respecte les types incompatibles et distingue les commerces OSM des estimations',()=>{
    expect(storefront(house,{'way/4':[{id:'node/9',tags:{shop:'bakery',name:'Nom OSM'}}]})).toBe('osm');
    for(const building of ['church','industrial','garage','ruins'])expect(decoratedBuilding({...house,tags:{building}})).toBe(false);
    expect(storefront({...house,tags:{building:'church',shop:'yes'}})).toBeUndefined();
  });
  it('exclut bâtiment, eau et abords ; réserve les marquages aux routes compatibles',()=>{
    expect(furnitureAllowed(data,[30,30])).toBe(false);expect(furnitureAllowed(data,[19.7,30])).toBe(false);expect(furnitureAllowed(data,[80,10])).toBe(true);
    expect(furnitureAllowed({...data,buildings:[],surfaces:[{...house,kind:'water'}]},[30,30])).toBe(false);
    for(const tags of ([{highway:'footway'},{highway:'primary',bridge:'yes'},{highway:'residential',surface:'gravel'},{highway:'primary',bridge:'viaduct'},{highway:'residential',layer:'-1'}] as Record<string,string>[]))expect(markingEligible(tags)).toBe(false);
    expect(markingEligible({highway:'tertiary',lanes:'2'})).toBe(true);
  });
  it('suit le terrain et ne génère pas de passage piéton inventé',()=>{
    const g=streetRoadGeometry(data,(x,z)=>x*.02+z*.03),p=g.getAttribute('position');
    expect(p.count).toBeGreaterThan(0);for(let i=0;i<p.count;i++)expect(p.getY(i)-p.getX(i)*.02-p.getZ(i)*.03).toBeGreaterThan(.079);
    const unmarked=streetRoadGeometry({...data,streets:{...data.streets!,objects:[]}},()=>0);expect(p.count).toBeGreaterThan(unmarked.getAttribute('position').count);
    const prohibited=streetRoadGeometry({...data,roads:[],streets:{...data.streets!,objects:[]}},()=>0);expect(prohibited.getAttribute('position').count).toBe(0);g.dispose();unmarked.dispose();prohibited.dispose();
  });
  it('transfère les instances et garde les uniformes nocturnes vivants ; nettoie tout',()=>{
    const a=atmosphereUniforms(),model=createCity(data,{ground:false,atmosphere:a});const {packet,transfer}=packGeometry(model,10);expect(new Set(transfer).size).toBe(transfer.length);
    const restored=unpackGeometry(structuredClone(packet),()=>0,a);expect(restored.group.children.length).toBe(packet.meshes.length);
    const lamps=packet.materials.filter(m=>m.kind==='windows');expect(lamps.length).toBeGreaterThanOrEqual(2);
    let disposals=0;restored.group.traverse(o=>{if(o instanceof Mesh)o.geometry.addEventListener('dispose',()=>disposals++);});a.night.value=1;restored.dispose();expect(disposals).toBeGreaterThan(0);expect(restored.group.children).toHaveLength(0);restored.dispose();model.dispose();
  });
});
it('conserve la phase et la longueur des marquages entre deux tuiles',()=>{
  const whole=dashSegments([490,10],[510,10]),split=[...dashSegments([490,10],[500,10]),...dashSegments([500,10],[510,10])];
  expect(whole.reduce((n,p)=>n+p[1],0)).toBeCloseTo(split.reduce((n,p)=>n+p[1],0));
  expect(whole).toEqual(split);
});
describe('Course sûre V7',()=>{
  it('atteint 6,5 m/s progressivement et revient à 1,8, à cadence indépendante',()=>{
    const a=walker(),b=walker();a.keys.add('fast');b.keys.add('fast');const start=a.position.clone();a.step(.05);expect(a.currentSpeed).toBeGreaterThan(1.8);expect(a.currentSpeed).toBeLessThan(6.5);
    for(let i=0;i<19;i++)a.step(.05);for(let i=0;i<60;i++)b.step(1/60);expect(a.position.distanceTo(b.position)).toBeLessThan(1e-8);expect(a.currentSpeed).toBeCloseTo(6.5,1);expect(a.position.distanceTo(start)).toBeGreaterThan(5.7);
    a.keys.delete('fast');a.step(.05);expect(a.currentSpeed).toBeGreaterThan(1.8);for(let i=0;i<30;i++)a.step(.05);expect(a.currentSpeed).toBeCloseTo(1.8,2);
  });
  it('normalise les diagonales, limite les gels et conserve les deux touches Maj',()=>{
    const a=walker(),b=walker();b.keys.add('right');for(const p of [a,b]){p.keys.add('fast');p.step(30);}expect(a.position.distanceTo(new Vector3(100,1.82,100))).toBeLessThan(1.625);expect(a.position.distanceTo(new Vector3(100,1.82,100))).toBeCloseTo(b.position.distanceTo(new Vector3(100,1.82,100)));
    for(const code of ['ShiftLeft','ShiftRight'])expect(movementKey({code,key:'Shift'})).toBe('fast');a.stop();expect(a.currentSpeed).toBe(1.8);
  });
  it('ne traverse ni paroi mince, ni eau, ni tuile non chargée en course',()=>{
    const w=new WalkingWorld({},[[[[-100,-100],[1000,-100],[1000,1000],[-100,1000]]]]);
    const thin={...house,rings:[[[100,98],[120,98],[120,98.05],[100,98.05]]] as Feature['rings']};
    w.setTile('0_0',{...data,buildings:[thin],roads:[]},()=>0);const p=new Walker(w);p.position.set(110,1.82,100);p.keys.add('forward');p.keys.add('fast');for(let n=0;n<20;n++)p.step(.25);expect(p.position.z).toBeGreaterThan(98.3);
    w.setTile('0_0',{...data,buildings:[],roads:[],surfaces:[{...thin,kind:'water'}]},()=>0);p.position.z=100;for(let n=0;n<20;n++)p.step(.25);expect(p.position.z).toBeGreaterThan(98.3);expect(p.blocked).toBe('water');
    p.position.set(100,1.82,.5);p.step(.25);expect(p.blocked).toBe('loading');expect(p.position.z).toBeGreaterThan(.28);w.dispose();
  });
});

it('éteint les halos en journée sans lumière supplémentaire et conserve leur uniforme après transfert',()=>{
  const a=atmosphereUniforms(),m=streetLightMaterial(a);
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'} as Parameters<typeof m.onBeforeCompile>[0];
  m.onBeforeCompile(shader,{} as Parameters<typeof m.onBeforeCompile>[1]);expect(shader.uniforms.streetNight).toBe(a.night);a.night.value=1;expect(shader.uniforms.streetNight!.value).toBe(1);a.night.value=0;expect(shader.uniforms.streetNight!.value).toBe(0);expect(m.depthWrite).toBe(false);m.dispose();
  const spy=vi.spyOn(console,'error');const city=createCity({...data,buildings:[],streets:undefined},{lod:'far',ground:false});expect(spy).not.toHaveBeenCalled();city.dispose();spy.mockRestore();
});

it('place un trottoir OSM à gauche de la direction géographique, sans bordure opposée',()=>{
  const g=streetRoadGeometry({...data,buildings:[],streets:{...data.streets!,objects:[]},roads:[{id:'way/2',points:[[0,10],[30,10]],tags:{highway:'residential',sidewalk:'left'}}]},()=>0);
  const p=g.getAttribute('position');expect(p.count).toBeGreaterThan(0);for(let i=0;i<p.count;i++)expect(p.getZ(i)).toBeLessThan(10);g.dispose();
});
