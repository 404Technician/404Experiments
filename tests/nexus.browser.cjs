'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
        if (error) { res.writeHead(404).end(); return; }
        res.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' })[path.extname(file)] || 'text/plain');
        res.end(data);
    });
});
const sourceFor = url => ({
    'api.open-meteo.com': 'weather', 'api.nasa.gov': 'neo', 'api.frankfurter.dev': 'currency',
    'hacker-news.firebaseio.com': 'hacker', 'api.github.com': 'github', 'science.nasa.gov': 'space'
})[url.hostname];
const modes = {};
const requests = [];
const held = [];
let hold = false;
function fixture(id, url) {
    switch (id) {
        case 'weather': return { current: { temperature_2m: 12.7, relative_humidity_2m: 68, time: modes.weather === 'stale' ? '2026-10-06T12:00' : '2026-10-07T12:00' }, current_units: { temperature_2m: '°C', relative_humidity_2m: '%' } };
        case 'neo': return { near_earth_objects: { '2026-10-07': [1,2,3,4].map(id => ({ id: String(id), is_potentially_hazardous_asteroid: id === 1 })) } };
        case 'currency': return modes.currency === 'empty' ? [] : [
            { base: 'EUR', quote: 'USD', date: modes.currency === 'stale' ? '2026-10-01' : '2026-10-06', rate: 1 },
            { base: 'EUR', quote: 'USD', date: modes.currency === 'stale' ? '2026-10-02' : '2026-10-07', rate: 1.0031 }
        ];
        case 'hacker': return Array.from({ length: 500 }, (_, i) => i + 1);
        case 'github': return [{ sha: 'abcdef0123456789012345678901234567890123', commit: { committer: { date: '2026-10-07T10:00:00Z' } } }];
        case 'space': return { date: modes.space === 'wrongday' ? '2026-10-06' : '2026-10-07', title: 'Across &amp; beyond <em>the stars</em>', hdurl: 'https://assets.science.nasa.gov/should-not-download.jpg', basic_html: '<img src="https://example.org/not-loaded.jpg">' };
    }
}
async function run() {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({ headless: true });
    const live = process.argv.includes('--live');
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = [], media = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', req => { if (req.resourceType() === 'image' && new URL(req.url()).origin !== origin) media.push(req.url()); });
        if (!live) await page.clock.install({ time: new Date('2026-10-07T12:00:00Z') });
        await page.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.origin === origin) return route.continue();
            const id = sourceFor(url);
            if (!id) return route.abort();
            requests.push({ id, url });
            if (live) return route.continue();
            if (modes[id] === 'timeout') return;
            if (modes[id] === 'network') return route.abort();
            if (modes[id] === 'http') return route.fulfill({ status: 503, body: '{}' });
            if (modes[id] === 'rate') return route.fulfill({ status: 429, body: '{}' });
            const response = { contentType: 'application/json', body: modes[id] === 'json' ? '{bad' : JSON.stringify(modes[id] === 'schema' ? {} : fixture(id, url)) };
            if (hold) { held.push(() => route.fulfill(response)); return; }
            return route.fulfill(response);
        });
        const value = id => page.locator('[data-signal="' + id + '"] .status-value');
        const row = id => page.locator('[data-signal="' + id + '"]');
        const settled = () => page.waitForFunction(() => document.getElementById('status-readings').getAttribute('aria-busy') === 'false');
        const refresh = async () => { await page.locator('#refresh-signals').click(); await settled(); };
        if (!live) hold = true;
        await page.goto(origin + '/index.html');
        if (!live) {
            await page.waitForFunction(() => document.querySelectorAll('[data-signal][data-state="loading"]').length === 6);
            while (held.length < 6) await new Promise(resolve => setTimeout(resolve, 10));
            const before = (await page.locator('#labs').boundingBox()).y;
            assert.equal(await page.locator('#refresh-signals').isDisabled(), true);
            await page.locator('#refresh-signals').evaluate(el => { for (let i = 0; i < 8; i++) el.dispatchEvent(new Event('click')); });
            assert.equal(requests.length, 6);
            hold = false;
            await Promise.all(held.splice(0).map(release => release()));
            await settled();
            const after = (await page.locator('#labs').boundingBox()).y;
            assert.ok(Math.abs(after - before) < 1, 'Status arrivals changed layout');
        } else await settled();
        assert.equal(requests.length, 6, 'Initial data request count');
        if (live) {
            for (const id of ['weather','neo','currency','hacker','github','space']) {
                console.log('LIVE ' + id + ': ' + await row(id).innerText());
                assert.notEqual(await row(id).getAttribute('data-state'), 'unavailable', 'Live source unavailable: ' + id);
            }
        } else {
            assert.equal(await value('weather').textContent(), '12.7°C / RH 68%');
            assert.equal(await value('neo').textContent(), '4 OBJECTS');
            assert.match(await row('neo').textContent(), /1 FLAGGED/);
            assert.equal(await value('currency').textContent(), 'EUR/USD +0.31%');
            assert.equal(await value('hacker').textContent(), '500 STORIES');
            assert.equal(await value('github').textContent(), 'UPDATED 2H AGO');
            assert.equal(await value('space').textContent(), 'SIGNAL ACQUIRED');
            assert.match(await row('space').textContent(), /Across & beyond the stars/);
            assert.match(await page.locator('#nexus-last-sync').textContent(), /12:00:\d{2} UTC/);
            assert.ok(await page.locator('#nexus-last-sync').getAttribute('datetime'));
            for (const id of ['weather','neo','currency','hacker','github','space']) {
                modes[id] = 'http'; await refresh();
                assert.equal(await row(id).getAttribute('data-state'), 'unavailable');
                assert.equal(await value(id).textContent(), 'UNAVAILABLE');
                for (const other of ['weather','neo','currency','hacker','github','space'].filter(other => other !== id)) assert.equal(await row(other).getAttribute('data-state'), 'active');
                assert.equal(await page.locator('[data-node="' + id + '"]').getAttribute('data-state'), 'unavailable');
                modes[id] = ''; await refresh();
                assert.equal(await row(id).getAttribute('data-state'), 'active');
            }
            for (const behavior of ['network','json','schema','rate']) {
                modes.hacker = behavior; await refresh();
                assert.equal(await row('hacker').getAttribute('data-state'), 'unavailable');
                modes.hacker = '';
            }
            modes.currency = 'empty'; modes.space = 'wrongday'; await refresh();
            assert.equal(await row('currency').getAttribute('data-state'), 'unavailable');
            assert.equal(await row('space').getAttribute('data-state'), 'unavailable');
            modes.currency = 'stale'; modes.weather = 'stale'; modes.space = ''; await refresh();
            assert.equal(await row('currency').getAttribute('data-state'), 'stale');
            assert.equal(await row('weather').getAttribute('data-state'), 'stale');
            modes.currency = ''; modes.weather = ''; await refresh();
            modes.neo = 'timeout';
            await page.locator('#refresh-signals').click();
            await page.waitForFunction(() => document.querySelector('[data-signal="hacker"]').dataset.state === 'active');
            assert.equal(await row('neo').getAttribute('data-state'), 'loading');
            await page.clock.runFor(12050); await settled();
            assert.match(await row('neo').textContent(), /timed out after 12 seconds/);
            assert.equal(await row('hacker').getAttribute('data-state'), 'active');
            modes.neo = ''; await refresh();
            // Conservative auto refresh, then pause while hidden and catch up on return.
            let count = requests.length;
            await page.clock.runFor(300050); await settled();
            assert.equal(requests.length, count + 6);
            await page.evaluate(() => { window.__hidden = true; Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden }); document.dispatchEvent(new Event('visibilitychange')); });
            count = requests.length;
            await page.clock.runFor(600000);
            assert.equal(requests.length, count);
            assert.equal(await page.locator('body').getAttribute('data-paused'), 'true');
            await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
            await settled();
            assert.equal(requests.length, count + 6);
            assert.equal(await page.locator('body').getAttribute('data-paused'), 'false');
            // All source requests are narrowly scoped; no story detail, forecast, media or CBS work.
            for (const { id, url } of requests) {
                if (id === 'weather') { assert.equal(url.searchParams.get('current'), 'temperature_2m,relative_humidity_2m'); assert.equal(url.searchParams.get('daily'), null); assert.equal(url.searchParams.get('hourly'), null); }
                if (id === 'neo') { assert.equal(url.searchParams.get('start_date'), url.searchParams.get('end_date')); assert.equal(url.searchParams.get('api_key'), 'DEMO_KEY'); }
                if (id === 'currency') { assert.equal(url.pathname, '/v2/rates'); assert.equal((Date.parse(url.searchParams.get('to')) - Date.parse(url.searchParams.get('from'))) / 86400000, 7); }
                if (id === 'hacker') assert.equal(url.pathname, '/v0/topstories.json');
                if (id === 'github') assert.equal(url.searchParams.get('per_page'), '1');
                if (id === 'space') assert.match(url.pathname, /^\/wp-json\/wp\/v2\/apod-basic\/\d{6}$/);
            }
        }
        const destinations = { weather:'apis/02-weather/index.html', neo:'apis/06-deep-space-signal/index.html', currency:'apis/07-currency-intercept/index.html', hacker:'apis/03-hacker-news/index.html', github:'apis/01-github/index.html', space:'apis/06-deep-space-signal/index.html' };
        for (const [id, href] of Object.entries(destinations)) {
            assert.equal(await row(id).getAttribute('href'), href);
            assert.equal((await page.request.get(origin + '/' + href)).status(), 200);
            await row(id).focus(); assert.equal(await row(id).evaluate(el => el === document.activeElement), true);
        }
        for (const width of [1440,768,375]) {
            await page.setViewportSize({ width, height: 1000 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Overflow at ' + width);
            await page.screenshot({ path: path.join(os.tmpdir(), 'live-nexus-' + (live ? 'live-' : '') + width + '.png'), fullPage: true });
        }
        await page.emulateMedia({ reducedMotion:'reduce' });
        assert.equal(await page.locator('.network-transit').evaluate(el => getComputedStyle(el).animationName), 'none');
        assert.equal(await page.locator('.nexus-network').getAttribute('aria-hidden'), 'true');
        assert.equal(await page.locator('.nexus-network').evaluate(el => getComputedStyle(el).display !== 'none'), true);
        await page.locator('#refresh-signals').focus();
        const count = requests.length;
        await page.keyboard.press('Enter'); await settled();
        assert.equal(requests.length, count + 6);
        assert.deepEqual(errors, []);
        assert.deepEqual(media, []);
        assert.equal(await page.locator('.signal-strip .signal-entry').count(), 3);
        assert.equal(await page.locator('.site-nav [aria-current="page"]').textContent(), 'NEXUSHome');
        console.log(live ? 'All six live source checks passed; six initial requests; no status media downloads.' : 'NEXUS controlled failure isolation, timeout, polling, refresh, metrics, layout, keyboard, links and reduced-motion checks passed.');
    } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
