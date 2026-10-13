"""Comparaison V6/V7 : quatre quartiers, vues aériennes/piétonnes, jour/nuit.
Playwright facultatif ; captures et mesures ignorées dans work/v7.
"""
import argparse, json, statistics, time
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--label', default='mesure')
    p.add_argument('--url', default='http://127.0.0.1:4175/threejs-playground/')
    p.add_argument('--chromium', default='/usr/bin/chromium')
    a = p.parse_args(); out = Path('work/v7') / a.label; out.mkdir(parents=True, exist_ok=True)
    rows, errors, bad = [], [], []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=a.chromium, args=['--enable-precise-memory-info'])
        try:
            context = browser.new_context(viewport={'width': 1440, 'height': 1100})
            context.add_init_script('''window.__frames=[];const p=WebGL2RenderingContext.prototype,b=p.bindFramebuffer,c=p.clear,f=new WeakMap();p.bindFramebuffer=function(t,v){f.set(this,v);return b.call(this,t,v)};p.clear=function(m){if(!f.get(this))__frames.push(performance.now());return c.call(this,m)};''')
            page = context.new_page(); page.set_default_timeout(240000)
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda e: errors.append(e.text) if e.type == 'error' and not e.location.get('url','').endswith('favicon.ico') else None)
            page.on('response', lambda r: bad.append([r.status, r.url]) if r.status >= 400 and not r.url.endswith('favicon.ico') else None)
            start = time.monotonic(); page.goto(a.url+'?profil=1#/playgrounds/nantes-3d')
            page.wait_for_function("!document.querySelector('[data-mode=pedestrian]')?.disabled")
            initial = time.monotonic()-start
            page.get_by_label('Animer l’eau', exact=True).uncheck()
            page.get_by_label('Passants et cyclistes', exact=True).select_option('off')
            page.get_by_label('Tramways', exact=True).uncheck()
            page.get_by_label('Circulation', exact=True).select_option('off')
            page.get_by_label('Date à Nantes', exact=True).fill('2026-06-21')
            def hour(value):
                page.locator('.nantes-hour input').evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}))}', value)
            def settle():
                page.wait_for_timeout(1600)
                page.wait_for_function('nantesProfile.snapshot().state.tiles.pending===0')
                page.wait_for_timeout(1000)
            gpu = page.evaluate('''()=>{const g=document.querySelector('.viewport > canvas').getContext('webgl2'),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)}''')
            for poi in ['bouffay', 'centre', 'chantenay', 'ile']:
                hour(840); start = page.evaluate('performance.now()')
                page.get_by_role('combobox', name='Choisir un point d’intérêt').select_option(poi); settle()
                page.screenshot(path=str(out/f'{poi}-aerial-day.png'))
                data = page.evaluate('nantesProfile.snapshot()')
                row = {'poi':poi,'aerial':data['state'],'loadingMs':page.evaluate('performance.now()')-start,'preparationMs':sum(e['duration'] for e in data['events'] if e['start']>=start and e['kind']=='geometry'),'workerCpuMs':sum(e['duration'] for e in data['events'] if e['start']>=start and e['kind']=='worker-cpu'),'heapUsed':page.evaluate('performance.memory?.usedJSHeapSize ?? null')}
                hour(60);settle();page.screenshot(path=str(out/f'{poi}-aerial-night.png'));hour(840)
                page.get_by_role('button', name='Mode piéton',exact=True).click();page.locator('.viewport').scroll_into_view_if_needed();settle()
                page.screenshot(path=str(out/f'{poi}-walk-day.png'))
                row['walk']=page.evaluate('nantesProfile.snapshot().state')
                hour(60);settle();page.screenshot(path=str(out/f'{poi}-walk-night.png'));hour(840)
                page.get_by_label('Passants et cyclistes',exact=True).select_option('normal');page.get_by_label('Tramways',exact=True).check();page.get_by_label('Animer l’eau',exact=True).check()
                n=page.evaluate('__frames.length');page.wait_for_function('n=>__frames.length>=n+7',arg=n)
                start=page.evaluate('performance.now()');n=page.evaluate('__frames.length')
                page.locator('.viewport').focus();page.keyboard.down('w');page.wait_for_function('n=>__frames.length>=n+5',arg=n);page.keyboard.up('w')
                frames=page.evaluate('s=>__frames.filter(t=>t>=s).slice(0,5)',start);row['movementIntervals']=[b-a for a,b in zip(frames,frames[1:])];row['movementMedianMs']=statistics.median(row['movementIntervals']);row['agents']=page.evaluate('nantesProfile.snapshot().state.agents')
                page.get_by_label('Animer l’eau',exact=True).uncheck();page.get_by_label('Passants et cyclistes',exact=True).select_option('off');page.get_by_label('Tramways',exact=True).uncheck();page.get_by_role('button',name='Vue aérienne',exact=True).click();settle()
                rows.append(row);(out/'results.json').write_text(json.dumps({'initialSeconds':initial,'gpu':gpu,'rows':rows,'errors':errors,'httpErrors':bad},ensure_ascii=False,indent=2));print(json.dumps({'poi':poi,'loadingMs':row['loadingMs'],'movementMedianMs':row['movementMedianMs'],'calls':row['walk']['calls'],'triangles':row['walk']['triangles']},ensure_ascii=False),flush=True)
            page.evaluate("location.hash='#/'");page.wait_for_timeout(500);assert page.locator('canvas').count()==0;assert page.evaluate('!window.nantesProfile');assert not errors, errors;assert not bad,bad
        finally:
            browser.close()


if __name__ == '__main__':
    main()
