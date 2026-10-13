"""Coût incrémental d'activité sur un build V5C ou V6 ; Playwright facultatif.
Les mesures détaillées et captures restent sous work/v6/, ignoré par Git.
"""
import argparse
import json
import statistics
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:4175/threejs-playground/')
    parser.add_argument('--label', default='activity')
    parser.add_argument('--chromium', default='/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
    parser.add_argument('--frames', type=int, default=8)
    args = parser.parse_args()
    output = Path('work/v6') / args.label
    output.mkdir(parents=True, exist_ok=True)
    probe = '''(() => {
      window.__activityFrames=[];const p=WebGL2RenderingContext.prototype, bound=new WeakMap();
      const bind=p.bindFramebuffer,clear=p.clear;
      p.bindFramebuffer=function(target,value){bound.set(this,value);return bind.call(this,target,value)};
      p.clear=function(mask){if(!bound.get(this))__activityFrames.push(performance.now());return clear.call(this,mask)};
    })();'''
    rows, errors = [], []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=args.chromium, headless=True, args=['--enable-precise-memory-info'])
        try:
            context = browser.new_context(viewport={'width': 1440, 'height': 1100})
            context.add_init_script(probe)
            page = context.new_page()
            page.set_default_timeout(240000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(args.url + '?profil=1#/playgrounds/nantes-3d')
            page.wait_for_function("document.querySelector('[data-mode=pedestrian]')?.disabled===false")
            activity = page.get_by_label('Passants et cyclistes', exact=True)
            trams = page.get_by_label('Tramways', exact=True)
            if activity.count():
                activity.select_option('off')
                trams.uncheck()
            page.get_by_label('Circulation', exact=True).select_option('off')
            page.get_by_label('Animer l’eau', exact=True).uncheck()
            page.get_by_label('Date à Nantes', exact=True).fill('2026-06-21')
            page.locator('.nantes-hour input').evaluate('e=>{e.value=840;e.dispatchEvent(new Event("input",{bubbles:true}))}')
            for poi in ['bouffay', 'centre']:
                page.get_by_role('combobox', name='Choisir un point d’intérêt').select_option(poi)
                page.wait_for_timeout(2000)
                page.wait_for_function('nantesProfile.snapshot().state.tiles.pending===0')
                page.get_by_label('Animer l’eau', exact=True).check()
                cases = [('off', False)] if not activity.count() else [('off', False), ('low', False), ('normal', False), ('normal', True)]
                for density, tram in cases:
                    if activity.count():
                        activity.select_option(density)
                        trams.set_checked(tram)
                    page.locator('.viewport').scroll_into_view_if_needed()
                    # Six pas plafonnés à 250 ms permettent la transition d'apparition de 1,5 s.
                    initial = page.evaluate('__activityFrames.length')
                    page.wait_for_function('(n)=>__activityFrames.length>=n+7', arg=initial)
                    start = page.evaluate('performance.now()')
                    initial = page.evaluate('__activityFrames.length')
                    page.wait_for_function('([n,count])=>__activityFrames.length>=n+count', arg=[initial, max(3, args.frames)])
                    data = page.evaluate('nantesProfile.snapshot()')
                    frames = page.evaluate('(start)=>__activityFrames.filter(t=>t>=start)', start)
                    frames = frames[:max(3, args.frames)]
                    intervals = [b - a for a, b in zip(frames, frames[1:])]
                    events = [event for event in data['events'] if event['start'] >= start]
                    row = {'poi': poi, 'density': density, 'trams': tram, 'state': data['state'],
                           'intervals': intervals, 'medianMs': statistics.median(intervals),
                           'updateMs': [event['duration'] for event in events if event['kind'] == 'agents-update'],
                           'renderMs': [event['duration'] for event in events if event['kind'] == 'render'],
                           'heapUsed': page.evaluate('performance.memory?.usedJSHeapSize ?? null')}
                    rows.append(row)
                    (output / 'results.json').write_text(json.dumps({'rows': rows, 'errors': errors}, ensure_ascii=False, indent=2))
                    page.screenshot(path=str(output / f'{poi}-{density}-{tram}.png'), full_page=True)
                    print(json.dumps({key: row[key] for key in ('poi', 'density', 'trams', 'medianMs', 'updateMs')} | {'agents': row['state'].get('agents'), 'calls': row['state']['calls'], 'triangles': row['state']['triangles']}, ensure_ascii=False), flush=True)
                page.get_by_label('Animer l’eau', exact=True).uncheck()
            assert not errors, errors
        finally:
            browser.close()


if __name__ == '__main__':
    main()
