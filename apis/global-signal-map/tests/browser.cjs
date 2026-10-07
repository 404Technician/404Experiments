'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const prefix = '/404Experiments';
const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!pathname.startsWith(prefix + '/')) { res.writeHead(404).end(); return; }
    const file = path.join(root, decodeURIComponent(pathname.slice(prefix.length)));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
        if (error) { res.writeHead(404).end(); return; }
        res.setHeader('Content-Type', ({ '.html':'text/html', '.js':'application/javascript', '.css':'text/css' })[path.extname(file)] || 'text/plain');
        res.end(data);
    });
});
const modes = {};
const requests = [];
const source = url => ({ 'earthquake.usgs.gov':'seismic', 'api.wheretheiss.at':'orbital', 'api.open-meteo.com':'atmospheric' })[url.hostname];
const lat = [51.51,40.7128,-23.5505,-33.9249,35.6762,-33.8688], lon = [5.39,-74.006,-46.6333,18.4241,139.6503,151.2093];
function fixture(key) {
    const now = new Date('2026-10-07T12:00:00Z').getTime();
    if (key === 'seismic') return { type:'FeatureCollection', metadata:{ generated:now }, features: modes.seismic === 'empty' ? [] : [
        { type:'Feature', id:'one', geometry:{ type:'Point', coordinates:[72.2,-6.6,12.3] }, properties:{ mag:4.7, place:'Test region <script>bad()</script>', time:now - 60000, url:'https://earthquake.usgs.gov/earthquakes/eventpage/one', type:'earthquake' } },
        { type:'Feature', id:'two', geometry:{ type:'Point', coordinates:[-65.4,19.0,39.6] }, properties:{ mag:3.4, place:'Puerto Rico region', time:now - 120000, type:'earthquake' } }
    ] };
    if (key === 'orbital') return { id:25544, latitude: modes.orbital === 'moved' ? 32 : 20, longitude:30, timestamp:now / 1000 };
    return lat.map((latitude, i) => ({ latitude, longitude:lon[i], location_id:i, current_units:{ temperature_2m:'°C', wind_speed_10m:'km/h' },
        current:{ time:'2026-10-07T12:00', temperature_2m:modes.atmospheric === 'partial' && i === 4 ? null : 21.4 + i, wind_speed_10m:13 + i } }));
}
async function asset(name, expected) {
    const file = path.join(os.tmpdir(), '404-leaflet-1.9.4', name);
    let data;
    if (fs.existsSync(file)) data = fs.readFileSync(file);
    else {
        const response = await fetch('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/' + name);
        assert.equal(response.status, 200);
        data = Buffer.from(await response.arrayBuffer());
        fs.mkdirSync(path.dirname(file), { recursive:true }); fs.writeFileSync(file, data);
    }
    assert.equal(crypto.createHash('sha256').update(data).digest('base64'), expected);
    return data;
}
async function run() {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const home = origin + prefix;
    const [js, css] = await Promise.all([
        asset('leaflet.js','20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='),
        asset('leaflet.css','p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=')
    ]);
    const browser = await chromium.launch({ headless:true });
    const live = process.argv.includes('--live');
    try {
        const page = await browser.newPage({ viewport:{ width:1440,height:1000 }, hasTouch:true });
        const errors = [];
        const consoleErrors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
        if (!live) await page.clock.install({ time:new Date('2026-10-07T12:00:00Z') });
        await page.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.origin === origin) return route.continue();
            if (url.hostname === 'cdn.jsdelivr.net') {
                if (live) return route.continue();
                if (modes.library === 'missing') return route.abort();
                return route.fulfill({ contentType:url.pathname.endsWith('.js') ? 'application/javascript' : 'text/css', body:url.pathname.endsWith('.js') ? js : css, headers:{ 'Access-Control-Allow-Origin':'*' } });
            }
            if (url.hostname === 'tile.openstreetmap.org') {
                if (live) return route.continue();
                if (modes.tiles === 'missing') return route.abort();
                return route.fulfill({ contentType:'image/png', body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6CwAAAABJRU5ErkJggg==','base64') });
            }
            const key = source(url);
            if (live && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.continue();
            if (!key) return route.abort();
            requests.push({ key,url });
            if (live) return route.continue();
            if (modes[key] === 'timeout') return;
            if (modes[key] === 'http') return route.fulfill({ status:503,body:'{}' });
            if (modes[key] === 'network') return route.abort();
            if (modes[key] === 'json') return route.fulfill({ contentType:'application/json',body:'bad' });
            return route.fulfill({ contentType:'application/json',body:JSON.stringify(modes[key] === 'schema' ? {} : fixture(key)) });
        });
        const markers = key => page.locator('.leaflet-marker-icon[data-feed="' + key + '"]');
        const ready = () => page.waitForFunction(() => !document.getElementById('refresh-map').disabled);
        const refresh = async () => { await page.locator('#refresh-map').click(); await ready(); };
        await page.goto(home + '/apis/index.html');
        assert.equal(await page.locator('.global-map-entry h2').textContent(),'GLOBAL SIGNAL MAP');
        assert.equal(await page.locator('.api-archive-card').count(),5);
        await page.locator('.global-map-entry a').click();
        assert.equal(page.url(),home + '/apis/global-signal-map/index.html');
        await ready();
        assert.equal(requests.length,3);
        assert.equal(await page.evaluate(() => L.version),'1.9.4');
        assert.equal(await page.locator('#global-map').getAttribute('tabindex'),'0');
        if (live) {
            for (const key of ['seismic','orbital','atmospheric']) {
                console.log('LIVE ' + key + ': ' + await page.locator('#' + key + '-value').textContent() + ' / ' + await page.locator('#' + key + '-status').textContent());
                assert.notEqual(await page.locator('#' + key + '-status').getAttribute('data-state'),'error');
                assert.ok(await markers(key).count() > 0);
            }
            await page.waitForFunction(() => [...document.querySelectorAll('.leaflet-tile')].some(img => img.complete && img.naturalWidth === 256));
            assert.match(await page.locator('#basemap-status').textContent(), /received/);
        } else {
            assert.equal(await markers('seismic').count(),2);
            assert.equal(await markers('orbital').count(),1);
            assert.equal(await markers('atmospheric').count(),6);
            // These DOM marker positions use Leaflet's actual geographic projection.
            const position = await markers('seismic').first().getAttribute('style');
            assert.ok(position.includes('translate3d'));
            await markers('seismic').first().click();
            assert.match(await page.locator('.leaflet-popup-content').textContent(),/M 4.7.*Test region <script>bad\(\)<\/script>.*12.3 km/s);
            assert.equal(await page.locator('.leaflet-popup-content script').count(),0);
            assert.equal(await page.locator('.leaflet-popup-content a').getAttribute('href'),'https://earthquake.usgs.gov/earthquakes/eventpage/one');
            await page.locator('.leaflet-popup-close-button').click();
            await markers('orbital').first().focus(); await page.keyboard.press('Enter');
            assert.match(await page.locator('.leaflet-popup-content').textContent(),/Latitude: 20.0000°.*Longitude: 30.0000°/s);
            await page.locator('.leaflet-popup-close-button').click();
            await markers('atmospheric').filter({ has:page.locator('span') }).nth(4).click();
            assert.match(await page.locator('.leaflet-popup-content').textContent(),/Tokyo.*25.4 °C.*Wind: 17.0 km\/h/s);
            await page.locator('.leaflet-popup-close-button').click();
        }
        for (const key of ['seismic','orbital','atmospheric']) {
            const count = await markers(key).count();
            await page.locator('#show-' + key).uncheck(); assert.equal(await markers(key).count(),0);
            await page.locator('#show-' + key).check(); assert.equal(await markers(key).count(),count);
        }
        assert.equal(requests.length,3,'Toggles must use fresh cached layers');
        if (!live) {
            await page.locator('#refresh-map').evaluate(node => { for (let i=0;i<10;i++) node.dispatchEvent(new Event('click')); });
            await ready(); assert.equal(requests.length,6);
            assert.ok(await page.locator('#last-sync').getAttribute('datetime'));
            for (const key of ['seismic','orbital','atmospheric']) {
                modes[key] = 'http'; await refresh();
                assert.equal(await page.locator('#' + key + '-status').getAttribute('data-state'),'error');
                assert.equal(await markers(key).count(),0);
                for (const other of ['seismic','orbital','atmospheric'].filter(other => other!==key)) assert.ok(await markers(other).count()>0);
                modes[key]=''; await refresh();
            }
            for (const behavior of ['network','json','schema']) {
                modes.seismic=behavior; await refresh();
                assert.equal(await page.locator('#seismic-status').getAttribute('data-state'),'error');
            }
            modes.seismic='empty'; await refresh();
            assert.equal(await page.locator('#seismic-value').textContent(),'0');
            assert.equal(await page.locator('#seismic-status').getAttribute('data-state'),'online');
            modes.seismic=''; modes.atmospheric='partial'; await refresh();
            assert.equal(await markers('atmospheric').count(),5);
            assert.equal(await page.locator('#atmospheric-status').getAttribute('data-state'),'partial');
            modes.atmospheric=''; modes.orbital='timeout';
            await page.locator('#refresh-map').click();
            await page.waitForFunction(() => document.getElementById('seismic-status').dataset.state==='online');
            assert.equal(await page.locator('#refresh-map').isDisabled(),true);
            await page.clock.runFor(12050); await ready();
            assert.match(await page.locator('#orbital-status').textContent(),/12-second timeout/);
            modes.orbital=''; await refresh();
            const old = await markers('orbital').getAttribute('style');
            let count = requests.length;
            modes.orbital='moved'; await page.clock.runFor(20050);
            await page.waitForFunction(() => document.getElementById('orbital-status').dataset.state==='online');
            assert.equal(requests.length,count+1);
            assert.equal(await markers('orbital').count(),1);
            assert.notEqual(await markers('orbital').getAttribute('style'),old);
            await page.evaluate(() => { window.__hidden=true; Object.defineProperty(document,'hidden',{ configurable:true,get:()=>window.__hidden }); document.dispatchEvent(new Event('visibilitychange')); });
            count=requests.length; await page.clock.runFor(60000); assert.equal(requests.length,count);
            await page.evaluate(() => { window.__hidden=false; document.dispatchEvent(new Event('visibilitychange')); });
            await page.waitForFunction(() => document.getElementById('orbital-status').dataset.state==='online');
            assert.equal(requests.length,count+1);
            modes.orbital='';
            const meteo=requests.find(req=>req.key==='atmospheric').url;
            assert.equal(meteo.searchParams.get('latitude').split(',').length,6);
            assert.equal(meteo.searchParams.get('current'),'temperature_2m,wind_speed_10m');
            assert.equal(meteo.searchParams.has('daily'),false);
        }
        // Zoom, drag and keyboard panning are genuine Leaflet interactions.
        const before = await markers('atmospheric').first().getAttribute('style');
        await page.locator('.leaflet-control-zoom-in').click();
        if (!live) await page.clock.runFor(350);
        await page.waitForFunction(old => document.querySelector('.leaflet-marker-icon[data-feed="atmospheric"]').getAttribute('style') !== old, before);
        assert.notEqual(await markers('atmospheric').first().getAttribute('style'),before);
        await page.locator('#global-map').focus(); await page.keyboard.press('ArrowRight');
        await page.locator('#world-view').click();
        const mapBox=await page.locator('#global-map').boundingBox();
        await page.mouse.move(mapBox.x+mapBox.width*.6,mapBox.y+mapBox.height*.5);
        await page.mouse.down(); await page.mouse.move(mapBox.x+mapBox.width*.6+60,mapBox.y+mapBox.height*.5+10,{ steps:5 }); await page.mouse.up();
        await page.locator('#world-view').click();
        for (const width of [1440,768,390]) {
            await page.setViewportSize({ width,height:1000 });
            await page.locator('#world-view').click();
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Overflow '+width);
            if (width === 390) await markers('orbital').first().tap();
            else await markers('orbital').first().click();
            const popupBox=await page.locator('.leaflet-popup-content-wrapper').boundingBox();
            assert.ok(popupBox.width<=width-32);
            await page.locator('.leaflet-popup-close-button').click();
            await page.screenshot({ path:path.join(os.tmpdir(),'global-signal-map-'+(live?'live-':'')+width+'.png'),fullPage:true });
        }
        assert.match(await page.locator('.leaflet-control-attribution').textContent(),/OpenStreetMap/);
        for (const href of ['../../index.html','../index.html','../../experiments/index.html','../../archive/index.html']) {
            assert.equal((await page.request.get(new URL(href,page.url()).href)).status(),200);
        }
        assert.deepEqual(errors,[]);
        if (live) assert.deepEqual(consoleErrors,[],'Console errors during live operation');
        if (!live) {
            modes.library='missing'; await page.reload(); await ready();
            assert.match(await page.locator('#global-map').textContent(),/library unavailable/);
            await page.locator('.received-signals summary').click();
            assert.match(await page.locator('#observations').textContent(),/USGS|Depth:.*km/);
            assert.equal(await page.locator('#atmospheric-value').textContent(),'6 NODES');
        }
        console.log(live ? 'Live tiles and all three geographic feeds passed, including mobile popups and GitHub Pages paths.' : 'Controlled Leaflet, feed isolation, popups, toggles, polling, timeout, accessible markers, CDN failure and responsive checks passed.');
    } finally { await browser.close(); }
}
run().catch(error=>{ console.error(error);process.exitCode=1; }).finally(()=>server.close());
