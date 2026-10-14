"""Comparaison V7/V8 avec cadrages géographiques identiques, Chromium/Playwright facultatifs."""
import argparse,json,statistics,time
from pathlib import Path
from playwright.sync_api import sync_playwright
POINTS=[('castle',184,-33),('cathedral',165,-309),('tour-lu',468.04,15.88),('titan',-1310,1168),('bouffay',-63,91)]
PROBE='''window.__frames=[];const p=WebGL2RenderingContext.prototype,b=p.bindFramebuffer,c=p.clear,f=new WeakMap();p.bindFramebuffer=function(t,v){f.set(this,v);return b.call(this,t,v)};p.clear=function(m){if(!f.get(this))__frames.push(performance.now());return c.call(this,m)};'''+'''(()=>{const p=CanvasRenderingContext2D.prototype,t=p.translate,s=p.scale;let xy;p.translate=function(x,y){if(this.canvas===document.querySelector('.nantes-map canvas'))xy=[x,y];return t.call(this,x,y)};p.scale=function(x,y){if(this.canvas===document.querySelector('.nantes-map canvas')&&xy){const r=this.canvas.getBoundingClientRect();window.__map={x:(r.width/2-xy[0])/x,z:(r.height/2-xy[1])/y,span:r.width/x,width:r.width,height:r.height};}return s.call(this,x,y)};})();'''
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--label',default='mesure');p.add_argument('--url',default='http://127.0.0.1:4175/threejs-playground/');a=p.parse_args();out=Path('work/v8')/a.label;out.mkdir(parents=True,exist_ok=True);rows=[];errors=[];bad=[]
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--enable-precise-memory-info'])
  try:
   context=browser.new_context(viewport={'width':1440,'height':1100});context.add_init_script(PROBE);page=context.new_page();page.set_default_timeout(240000);page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda e:errors.append(e.text) if e.type=='error' and not e.location.get('url','').endswith('favicon.ico') else None);page.on('response',lambda r:bad.append([r.status,r.url]) if r.status>=400 and not r.url.endswith('favicon.ico') else None)
   cdp=context.new_cdp_session(page);cdp.send('Network.enable');cdp.send('Network.setCacheDisabled',{'cacheDisabled':True});start=time.monotonic();page.goto(a.url+'?profil=1#/playgrounds/nantes-3d');page.wait_for_function("!document.querySelector('[data-mode=pedestrian]').disabled");initial=time.monotonic()-start
   for label in ['Circulation','Passants et cyclistes']:page.get_by_label(label,exact=True).select_option('off')
   page.get_by_label('Tramways',exact=True).uncheck();page.get_by_label('Animer l’eau',exact=True).uncheck();page.get_by_label('Date à Nantes',exact=True).fill('2026-06-21');page.locator('.nantes-hour input').evaluate('e=>{e.value=840;e.dispatchEvent(new Event("input",{bubbles:true}))}')
   for name,x,z in POINTS:
    start=page.evaluate('performance.now()');page.get_by_role('button',name='Agrandir',exact=True).click(force=True)
    for n in range(7):page.get_by_label('Dézoomer la carte',exact=True).click(force=True)
    m=page.evaluate('__map');box=page.locator('.nantes-map canvas').last.bounding_box();px=m['width']/2+(x-m['x'])*m['width']/m['span'];py=m['height']/2+(z-m['z'])*m['width']/m['span'];page.mouse.click(box['x']+px,box['y']+py);page.get_by_role('button',name='Aller ici',exact=True).click(force=True);page.get_by_role('button',name='Réduire',exact=True).click(force=True);page.locator('.viewport').scroll_into_view_if_needed();page.wait_for_timeout(2000);page.wait_for_function('nantesProfile.snapshot().state.tiles.pending===0');page.wait_for_timeout(1000)
    if name=='bouffay':page.get_by_role('button',name='Mode piéton',exact=True).click(force=True);page.locator('.viewport').scroll_into_view_if_needed();page.wait_for_timeout(1800);page.wait_for_function('nantesProfile.snapshot().state.tiles.pending===0')
    snapshot=page.evaluate('nantesProfile.snapshot()');row={'name':name,'loadMs':page.evaluate('performance.now()')-start,'state':snapshot['state'],'workerCpuMs':sum(e['duration'] for e in snapshot['events'] if e['start']>=start and e['kind']=='worker-cpu'),'geometryRoundTripMs':sum(e['duration'] for e in snapshot['events'] if e['start']>=start and e['kind']=='geometry'),'heap':page.evaluate('performance.memory?.usedJSHeapSize ?? null')};page.screenshot(path=str(out/(name+'.png')))
    page.get_by_label('Animer l’eau',exact=True).check();page.locator('.viewport').scroll_into_view_if_needed();n=page.evaluate('__frames.length');page.wait_for_function('n=>__frames.length>=n+3',arg=n);start=page.evaluate('performance.now()');n=page.evaluate('__frames.length')
    if name=='bouffay':page.locator('.viewport').focus();page.keyboard.down('w')
    page.wait_for_function('n=>__frames.length>=n+5',arg=n)
    if name=='bouffay':page.keyboard.up('w')
    frames=page.evaluate('s=>__frames.filter(t=>t>=s).slice(0,5)',start);row['intervals']=[b-a for a,b in zip(frames,frames[1:])];row['medianMs']=statistics.median(row['intervals']);page.get_by_label('Animer l’eau',exact=True).uncheck();rows.append(row);(out/'results.json').write_text(json.dumps({'initialSeconds':initial,'rows':rows,'errors':errors,'httpErrors':bad},ensure_ascii=False,indent=2));print(json.dumps({k:row[k] for k in ['name','loadMs','workerCpuMs','medianMs']}|{'calls':row['state']['calls'],'triangles':row['state']['triangles']},ensure_ascii=False),flush=True)
   page.evaluate("location.hash='#/'");page.wait_for_timeout(500);assert not errors,errors;assert not bad,bad;assert page.locator('canvas').count()==0
  finally:browser.close()
if __name__=='__main__':main()
