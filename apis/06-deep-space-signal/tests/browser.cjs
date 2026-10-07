'use strict';
// Deterministic browser regression tests. Fixtures are test-only, never site fallbacks.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const date = '2026-10-07';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQWQAAAAASUVORK5CYII=', 'base64');
const record = { date, title: 'Test stellar transmission', media_type: 'image', explanation: '<b>Explanation:</b> Test scientific record.', credit: '<b>NASA test credit</b>', copyright: 'Test attribution', alt: 'Test star field', permalink: 'https://science.nasa.gov/image-article/test/', url: 'https://science.nasa.gov/image-article/test/', hdurl: 'https://assets.science.nasa.gov/test.jpg' };
const object = { name: '(Test object)', neo_reference_id: '12345', is_potentially_hazardous_asteroid: false, estimated_diameter: { meters: { estimated_diameter_min: 120, estimated_diameter_max: 260 } }, close_approach_data: [{ close_approach_date: date, epoch_date_close_approach: Date.parse(date + 'T14:32:00Z'), miss_distance: { kilometers: '2400000' }, relative_velocity: { kilometers_per_second: '18.7' }, orbiting_body: 'Earth' }], nasa_jpl_url: 'http://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=12345' };
const item = { data: [{ nasa_id: 'TEST-01', title: 'Test Jupiter image', description: 'An observation for regression testing.', date_created: '2026-01-01T00:00:00Z', keywords: ['Jupiter', 'Space'], media_type: 'image', photographer: 'Test photographer', center: 'JPL' }], links: [{ rel: 'preview', render: 'image', href: 'https://images-assets.nasa.gov/image/TEST-01/test~thumb.jpg' }] };
let modes = {};
let requests = [];
const server = http.createServer((req, res) => {
    let file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (error, data) => {
        res.writeHead(error ? 404 : 200, { 'Content-Type': file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html' });
        res.end(error ? 'Not found' : data);
    });
});

(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.clock.setFixedTime(new Date(date + 'T12:00:00Z'));
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.origin === base) return route.continue();
            requests.push(url.href);
            const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
            if (url.hostname === 'science.nasa.gov') {
                if (modes.apod === 'network') return route.abort();
                if (modes.apod === 'failure') return route.fulfill({ status: 503, body: '{}' });
                if (modes.apod === 'invalid') return route.fulfill({ status: 200, body: '{invalid' });
                const payload = { ...record, date: url.pathname.endsWith('261006') ? '2026-10-06' : date };
                if (modes.apod === 'video') { payload.media_type = 'iframe'; delete payload.hdurl; payload.basic_html = '<iframe src="https://untrusted.example/"></iframe>'; }
                if (modes.apod === 'partial') return reply({ date, title: 'Partial transmission', explanation: '<script>window.injected=true</script><img src=x onerror="window.injected=true">Plain explanation', url: 'javascript:alert(1)' });
                return reply(payload);
            }
            if (url.hostname === 'api.nasa.gov') {
                assert.equal(url.searchParams.get('api_key'), 'DEMO_KEY');
                assert.equal(url.searchParams.get('start_date'), date);
                assert.equal(url.searchParams.get('end_date'), date);
                if (modes.neo === 'rate') return route.fulfill({ status: 429, body: '{}' });
                if (modes.neo === 'failure') return route.fulfill({ status: 500, body: '{}' });
                const objects = modes.neo === 'empty' ? [] : modes.neo === 'partial' ? [{ name: 'Partial object' }] : [{ ...object, is_potentially_hazardous_asteroid: modes.neo === 'hazardous' }];
                return reply({ near_earth_objects: { [date]: objects } });
            }
            if (url.hostname === 'images-api.nasa.gov') {
                if (url.pathname === '/search') {
                    assert.equal(url.searchParams.get('page_size'), '12');
                    assert.equal(url.searchParams.get('media_type'), 'image');
                    if (modes.library === 'failure') return route.fulfill({ status: 503, body: '{}' });
                    if (modes.library === 'empty') return reply({ collection: { items: [] } });
                    if (modes.library === 'partial') return reply({ collection: { items: [{ data: [{ nasa_id: 'PARTIAL' }] }] } });
                    if (modes.library === 'race' && url.searchParams.get('q') === 'Jupiter') await new Promise(resolve => setTimeout(resolve, 250));
                    const queryItem = structuredClone(item);
                    queryItem.data[0].title = 'Test ' + url.searchParams.get('q') + ' image';
                    return reply({ collection: { items: Array.from({ length: 12 }, () => queryItem) } });
                }
                if (url.pathname.startsWith('/asset/')) {
                    if (modes.asset === 'failure') return route.fulfill({ status: 500, body: '{}' });
                    return reply({ collection: { items: [{ href: 'https://images-assets.nasa.gov/image/TEST-01/test~medium.jpg' }, { href: 'https://images-assets.nasa.gov/image/TEST-01/test~orig.jpg' }] } });
                }
                if (modes.metadata === 'missing') return route.fulfill({ status: 404, body: '{}' });
                if (modes.metadata === 'unsafe') return reply({ location: 'https://untrusted.example/metadata.json' });
                return reply({ location: 'https://images-assets.nasa.gov/image/TEST-01/metadata.json' });
            }
            if (url.hostname.endsWith('nasa.gov')) {
                if (url.pathname.endsWith('metadata.json')) return reply({ 'AVAIL:Description': 'Additional observation metadata', 'AVAIL:Center': 'JPL' });
                if (modes.image === 'failure') return route.fulfill({ status: 404, body: 'Missing image' });
                return route.fulfill({ status: 200, contentType: 'image/png', body: png });
            }
            return route.abort();
        });
        const goto = async (nextModes = {}) => {
            modes = nextModes;
            requests = [];
            await page.goto(base + '/apis/06-deep-space-signal/index.html');
            await page.waitForFunction(() => document.querySelector('#apod-content').getAttribute('aria-busy') === 'false' && document.querySelector('#neo-content').getAttribute('aria-busy') === 'false');
        };
        const search = async query => {
            await page.locator('#archive-query').fill(query);
            await page.locator('#archive-query').press('Enter');
            await page.waitForFunction(() => document.querySelector('#library-results').getAttribute('aria-busy') === 'false');
        };
        const detail = async () => {
            await page.getByRole('button', { name: 'Open observation' }).first().click();
            await page.waitForFunction(() => document.querySelector('#detail-content').getAttribute('aria-busy') === 'false');
        };
        await goto();
        assert.equal(await page.locator('.transmission-image').count(), 1);
        assert.equal(await page.locator('.transmission-image').getAttribute('src'), record.hdurl);
        assert.equal(await page.locator('.track-classification.potentially-hazardous').count(), 0);
        assert.match(await page.locator('.track-metrics').innerText(), /2,400,000 km/);
        assert.match(await page.locator('.track-metrics').innerText(), /120–260 m/);
        assert.match(await page.locator('.track-metrics').innerText(), /14:32 UTC/);
        assert(await page.locator('#next-transmission').isDisabled());
        await page.locator('#previous-transmission').click();
        await page.waitForFunction(() => document.querySelector('#transmission-date').textContent.startsWith('2026-10-06') && document.querySelector('#apod-content').getAttribute('aria-busy') === 'false');
        assert(requests.some(url => url.endsWith('/261006')));
        await page.locator('#next-transmission').click();
        await page.waitForFunction(() => document.querySelector('#apod-content').getAttribute('aria-busy') === 'false');
        assert(await page.locator('#next-transmission').isDisabled());
        console.log('PASS APOD current/previous/next bounds and full NeoWs metrics');
        for (const type of ['partial', 'video', 'failure', 'network', 'invalid']) {
            await goto({ apod: type });
            assert.equal(await page.locator('.object-track').count(), 1);
            if (['failure', 'network', 'invalid'].includes(type)) { assert(await page.locator('#apod-retry').isVisible()); modes.apod = ''; await page.locator('#apod-retry').click(); await page.waitForSelector('.transmission-image'); }
            else { assert.equal(await page.locator('iframe').count(), 0); assert.equal(await page.evaluate(() => window.injected), undefined); assert.equal(await page.locator('#apod-content a[href^="javascript:"]').count(), 0); }
        }
        console.log('PASS partial APOD, non-image, HTTP/network/JSON errors, independent tracking and retries');
        for (const type of ['hazardous', 'partial', 'empty', 'rate', 'failure']) {
            await goto({ neo: type });
            assert.equal(await page.locator('.transmission-image').count(), 1);
            if (type === 'hazardous') assert.equal(await page.locator('.potentially-hazardous').count(), 1);
            if (type === 'partial') assert.match(await page.locator('.object-track').innerText(), /Not supplied/);
            if (type === 'empty') assert.match(await page.locator('#neo-status').innerText(), /No close approaches/i);
            if (['rate', 'failure'].includes(type)) { assert(await page.locator('#neo-retry').isVisible()); modes.neo = ''; await page.locator('#neo-retry').click(); await page.waitForSelector('.object-track'); }
        }
        console.log('PASS full/partial/hazardous/empty/rate-limited/failed NeoWs feeds and independent APOD');
        await goto();
        assert(!requests.some(url => url.includes('images-api')));
        for (const query of ['Jupiter', 'nebula', 'Apollo', 'James Webb']) {
            await search(query);
            assert.equal(await page.locator('.library-result').count(), 12);
            assert.match(await page.locator('.library-result h3').first().innerText(), new RegExp(query));
        }
        assert(!requests.some(url => /\/(asset|metadata)\//.test(url)));
        await detail();
        assert.match(await page.locator('.detail-description').innerText(), /Additional observation/);
        assert.equal(await page.locator('.detail-image').getAttribute('src'), 'https://images-assets.nasa.gov/image/TEST-01/test~medium.jpg');
        assert(!requests.some(url => url.includes('~orig')));
        await page.keyboard.press('Escape');
        assert(!(await page.locator('#record-dialog').evaluate(node => node.open)));
        assert(await page.getByRole('button', { name: 'Open observation' }).first().evaluate(node => node === document.activeElement));
        console.log('PASS 4 archive queries, 12-result bound, on-demand assets/metadata and dialog keyboard focus');
        for (const mode of [{ library: 'empty' }, { library: 'partial' }, { library: 'failure' }, { metadata: 'missing' }, { metadata: 'unsafe' }, { asset: 'failure' }, { image: 'failure' }]) {
            await goto(mode);
            await search('Jupiter');
            if (mode.library === 'empty') { assert.match(await page.locator('#library-status').innerText(), /No image records/i); continue; }
            if (mode.library === 'failure') { assert(await page.locator('#library-retry').isVisible()); modes.library = ''; await page.locator('#library-retry').click(); await page.waitForSelector('.library-result'); continue; }
            await detail();
            assert(await page.locator('#detail-content a').first().isVisible());
            if (mode.image === 'failure') { await page.waitForFunction(() => document.querySelector('#detail-status').dataset.state === 'error'); assert.equal(await page.locator('.detail-image').count(), 0); }
            if (mode.asset || mode.metadata) { assert(await page.locator('#detail-retry').isVisible()); modes = {}; await page.locator('#detail-retry').click(); await page.waitForFunction(() => document.querySelector('#detail-status').dataset.state === 'ready'); }
            assert(!requests.some(url => url.includes('untrusted.example')));
            await page.keyboard.press('Escape');
        }
        console.log('PASS empty/partial/failed search, missing/unsafe metadata, failed assets/images and detail retry');
        await goto({ library: 'race' });
        await page.getByRole('button', { name: 'Jupiter', exact: true }).click();
        await page.getByRole('button', { name: 'Nebula', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('#library-results').getAttribute('aria-busy') === 'false');
        assert.match(await page.locator('.library-result h3').first().innerText(), /nebula/);
        console.log('PASS superseded search cannot replace current results');
        for (const width of [1440, 768, 375]) {
            await page.setViewportSize({ width, height: 1000 });
            await goto();
            await search('Jupiter');
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            const nav = await page.locator('.site-nav-links a').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { right: box.right, height: box.height, left: box.left }; }));
            assert(nav.every(box => box.right <= width && box.left >= 0 && box.height >= 44));
            await detail();
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.keyboard.press('Escape');
            console.log('PASS responsive station, navigation, archive results and dialog at', width);
        }
        await goto();
        await page.keyboard.press('Tab');
        assert(await page.locator('.skip-link').evaluate(node => node === document.activeElement));
        await page.keyboard.press('Enter');
        assert(await page.locator('main').evaluate(node => node === document.activeElement));
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
        assert.equal(await page.locator('.station-header').evaluate(node => getComputedStyle(node).animationName), 'none');
        const hrefs = await page.locator('.site-nav a').evaluateAll(nodes => nodes.map(node => node.href));
        for (let i = 0; i < hrefs.length; i++) { await goto(); await page.locator('.site-nav a').nth(i).click(); await page.waitForURL(hrefs[i]); assert.equal((await page.request.get(hrefs[i])).status(), 200); }
        await page.goto(base + '/apis/index.html');
        assert.equal(await page.locator('.api-archive-card:not(.signal-lost)').count(), 5);
        assert.equal(await page.locator('.signal-lost').count(), 2);
        await page.getByRole('link', { name: 'Receive deep space signal' }).click();
        await page.waitForURL(base + '/apis/06-deep-space-signal/index.html');
        assert.equal(await page.locator('[aria-current="location"] > span').first().innerText(), 'SIGNALS');
        assert(requests.every(url => !/planetary\/apod|planetary\/earth|mars-photos/.test(url)));
        assert.deepEqual(errors, []);
        console.log('PASS skip navigation, reduced motion, global/overview links, active SIGNALS, endpoint exclusions and zero JavaScript errors');
    } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
