'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
        if (error) { res.writeHead(404).end(); return; }
        res.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' })[path.extname(file)] || 'text/plain');
        res.end(data);
    });
});
const currencies = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CNY'].map(iso_code => ({ iso_code, name: { EUR: 'Euro', USD: 'US Dollar', GBP: 'British Pound', JPY: 'Japanese Yen' }[iso_code] || iso_code, symbol: { EUR: '€', USD: '$', GBP: '£', JPY: '¥' }[iso_code] || null }));
const rates = { 'EUR/USD': 1.2, 'EUR/GBP': .8, 'USD/JPY': 150, 'GBP/EUR': 1.25, 'USD/EUR': .833333, 'EUR/CHF': .9, 'EUR/JPY': 180, 'EUR/CNY': 8 };
const mode = { fx: '', cbs: '', info: '', strip: '', delay: false };
const requests = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run() {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const live = process.argv.includes('--live');
        if (!live) await page.clock.setFixedTime(new Date('2026-10-07T12:00:00Z'));
        await page.route('**/*', async route => {
            const u = new URL(route.request().url());
            if (u.origin === origin) return route.continue();
            if (live && (u.hostname === 'api.frankfurter.dev' || u.hostname === 'opendata.cbs.nl')) return route.continue();
            if (!['api.frankfurter.dev', 'opendata.cbs.nl'].includes(u.hostname)) return route.abort();
            requests.push(u);
            const fx = u.hostname === 'api.frankfurter.dev';
            const behavior = fx ? mode.fx : mode.cbs;
            if (behavior === 'network') return route.abort();
            if (behavior === 'http') return route.fulfill({ status: 503, body: '{}' });
            if (behavior === 'malformed') return route.fulfill({ contentType: 'application/json', body: '{bad' });
            let data;
            if (fx) {
                if (u.pathname.endsWith('/currencies')) data = behavior === 'metadata' ? {} : currencies;
                else if (u.pathname.includes('/rate/')) {
                    const [base, quote] = u.pathname.split('/').slice(-2).map(s => s.toUpperCase());
                    if (mode.delay && base === 'EUR' && quote === 'GBP') await sleep(250);
                    data = behavior === 'missing' || (mode.strip && quote === 'CNY') ? {} : { date: behavior === 'stale' ? '2026-09-20' : '2026-10-07', base, quote, rate: rates[base + '/' + quote] || 2 };
                } else {
                    const base = u.searchParams.get('base').toUpperCase(), quote = u.searchParams.get('quotes').toUpperCase();
                    data = behavior === 'empty' ? [] : [
                        { date: u.searchParams.get('from'), base, quote, rate: 1 },
                        { date: u.searchParams.get('to'), base, quote, rate: 1.2 }
                    ];
                }
            } else if (u.pathname.endsWith('/TableInfos')) {
                data = { value: mode.info ? [] : [{ Modified: '2026-10-01T02:00:00', Source: 'CBS, Travelcard BV', Frequency: 'Perweek' }] };
            } else {
                const filter = u.searchParams.get('$filter');
                assert.ok(filter && /Perioden ge '\d{8}' and Perioden le '\d{8}'/.test(filter));
                assert.equal(u.searchParams.get('$select'), 'Perioden,BenzineEuro95_1,Diesel_2,Lpg_3');
                const from = filter.match(/ge '(\d+)'/)[1];
                data = { value: behavior === 'empty' || from >= '20260930' ? [] : [
                    { Perioden: from, BenzineEuro95_1: 2, Diesel_2: 1.5, Lpg_3: .8 },
                    { Perioden: '20260920', BenzineEuro95_1: null, Diesel_2: 1.6, Lpg_3: .85 },
                    { Perioden: '20260928', BenzineEuro95_1: 2.2, Diesel_2: 1.8, Lpg_3: .88 }
                ] };
                if (behavior === 'invalid') data = { value: [{ Perioden: 'nonsense' }] };
                if (behavior === 'lastmissing' && data.value.length) data.value.at(-1).Diesel_2 = null;
            }
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
        });
        const open = async () => { await page.goto(origin + '/apis/07-currency-intercept/index.html'); };
        const ready = async () => {
            await page.waitForFunction(() => document.getElementById('result').textContent.includes('USD'));
            await page.waitForFunction(() => document.querySelectorAll('#fuel-current article').length === 3);
            await page.waitForFunction(() => document.querySelector('#rate-chart svg') && document.querySelector('#fuel-chart svg'));
        };
        await open(); await ready();
        if (live) {
            console.log('LIVE:', await page.locator('#rate-detail').textContent());
            console.log('LIVE:', await page.locator('#fuel-current').innerText());
            console.log('LIVE:', await page.locator('#fuel-dates').textContent());
            for (const id of ['rate-periods', 'fuel-periods']) for (const label of ['7D', '30D', '90D', '1Y']) {
                await page.locator('#' + id).getByRole('button', { name: label, exact: true }).click();
                const status = id === 'rate-periods' ? 'trace-status' : 'fuel-trace-status';
                await page.waitForFunction(id => !document.getElementById(id).textContent.startsWith('Receiving'), status);
                assert.notEqual(await page.locator('#' + status).getAttribute('data-state'), 'error');
                console.log('LIVE ' + id + ' ' + label + ':', await page.locator('#' + status).textContent());
            }
        } else {
            assert.equal(await page.locator('#result').textContent(), '120.00 USD');
            assert.match(await page.locator('#rate-detail').textContent(), /Euro \(€\).*US Dollar \(\$\)/);
            await page.locator('#amount').fill('250');
            assert.equal(await page.locator('#result').textContent(), '300.00 USD');
            await page.locator('#amount').fill('-1');
            assert.match(await page.locator('#result').textContent(), /non-negative/);
            await page.locator('#amount').fill('100');
            for (const [base, quote, result] of [['EUR','GBP','80.00 GBP'],['USD','JPY','15,000.00 JPY'],['GBP','EUR','125.00 EUR'],['EUR','USD','120.00 USD']]) {
                await page.locator('#base').selectOption(base); await page.locator('#quote').selectOption(quote);
                await page.waitForFunction(result => document.getElementById('result').textContent === result, result);
            }
            await page.locator('#swap').click();
            await page.waitForFunction(() => document.getElementById('result').textContent === '83.33 EUR');
            await page.locator('#swap').click();
            await page.waitForFunction(() => document.getElementById('result').textContent === '120.00 USD');
            for (const id of ['rate-periods','fuel-periods']) for (const label of ['7D','30D','90D','1Y']) {
                await page.locator('#' + id).getByRole('button', { name: label, exact: true }).click();
                const status = id === 'rate-periods' ? 'trace-status' : 'fuel-trace-status';
                await page.waitForFunction(id => !document.getElementById(id).textContent.startsWith('Receiving'), status);
                assert.equal(await page.locator('#' + id).getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true');
                if (id === 'fuel-periods' && label === '7D') assert.match(await page.locator('#fuel-trace-status').textContent(), /No observations/);
            }
            assert.match(await page.locator('#rate-metrics').textContent(), /20.00%/);
            assert.match(await page.locator('#fuel-metrics').textContent(), /10.00%/);
            assert.match(await page.locator('#fuel-current').textContent(), /€ 2.200 \/ L.*€ 1.800 \/ L.*€ 0.880 \/ L/s);
            assert.match(await page.locator('#fuel-dates').textContent(), /28 Sept 2026.*01 Oct 2026/);
            assert.match(await page.locator('#fuel-trace-status').textContent(), /Missing values omitted/);
            const euroPath = await page.locator('#fuel-chart svg > path[stroke="#63dcff"]').getAttribute('d');
            assert.equal((euroPath.match(/M/g) || []).length, 2);
            await page.locator('#fuel-toggles').getByRole('button', { name: 'EURO95' }).click();
            assert.equal(await page.locator('#fuel-chart svg > path[stroke="#63dcff"]').count(), 0);
            await page.locator('#fuel-toggles').getByRole('button', { name: 'EURO95' }).click();
            mode.strip = 'missing';
            await page.locator('#exchange-retry').click(); await ready();
            await page.waitForFunction(() => document.querySelector('#pair-strip article:last-child small').textContent.startsWith('Unavailable'));
            assert.match(await page.locator('#pair-strip article:first-child strong').textContent(), /1.2000/);
            mode.strip = '';
            mode.fx = 'missing';
            await page.locator('#quote').selectOption('GBP');
            await page.waitForFunction(() => document.getElementById('exchange-status').dataset.state === 'error');
            assert.equal(await page.locator('#result').textContent(), '—');
            assert.equal(await page.locator('#fuel-current article').count(), 3);
            mode.fx = '';
            await page.locator('#quote').selectOption('USD');
            await ready();
            mode.fx = 'empty'; await page.locator('#trace-retry').click();
            await page.waitForFunction(() => document.getElementById('trace-status').dataset.state === 'error');
            assert.equal(await page.locator('#rate-metrics').textContent(), '');
            mode.fx = 'stale'; await page.locator('#quote').selectOption('GBP');
            await page.waitForFunction(() => document.getElementById('rate-detail').textContent.includes('17 days old'));
            mode.fx = ''; await page.locator('#quote').selectOption('USD'); await ready();
            mode.delay = true;
            await page.locator('#quote').selectOption('GBP'); await page.locator('#quote').selectOption('USD');
            await page.waitForFunction(() => document.getElementById('result').textContent === '120.00 USD');
            await sleep(350);
            assert.equal(await page.locator('#result').textContent(), '120.00 USD');
            mode.delay = false;
            mode.cbs = 'lastmissing';
            await page.locator('#fuel-retry').click(); await ready();
            assert.match(await page.locator('#fuel-current article').nth(1).textContent(), /€ 1.600 \/ L.*20 Sept/s);
            mode.cbs = ''; mode.info = 'missing';
            await page.locator('#fuel-retry').click(); await ready();
            assert.match(await page.locator('#fuel-dates').textContent(), /Dataset updated: Unavailable/);
            mode.info = '';
            for (const source of ['fx','cbs']) for (const behavior of ['http','network','malformed', ...(source === 'fx' ? ['metadata'] : ['invalid','empty'])]) {
                mode[source] = behavior; await open();
                const status = source === 'fx' ? 'exchange-status' : 'fuel-status';
                await page.waitForFunction(id => document.getElementById(id).dataset.state === 'error', status);
                if (source === 'fx') {
                    await page.waitForFunction(() => document.querySelectorAll('#fuel-current article').length === 3);
                    assert.equal(await page.locator('#result').textContent(), '—');
                } else {
                    await page.waitForFunction(() => document.getElementById('result').textContent === '120.00 USD');
                    assert.equal(await page.locator('#fuel-current').textContent(), '');
                }
                mode[source] = '';
                await page.locator(source === 'fx' ? '#exchange-retry' : '#fuel-retry').click(); await ready();
            }
            for (const u of requests.filter(u => u.hostname === 'api.frankfurter.dev')) assert.ok(u.pathname.startsWith('/v2/'));
        }
        for (const width of [1440,768,375]) {
            await page.setViewportSize({ width, height: 1000 });
            await sleep(150);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Overflow at ' + width);
            await page.screenshot({ path: path.join(os.tmpdir(), 'currency-intercept-' + (live ? 'live-' : '') + width + '.png'), fullPage: true });
        }
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await page.locator('#swap').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
        await page.locator('#swap').focus(); await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.getElementById('base').value === 'USD');
        await page.locator('#fuel-periods button').first().focus(); await page.keyboard.press('Enter');
        assert.equal(await page.locator('#fuel-periods button').first().getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('.site-nav [aria-current="location"]').textContent(), 'SIGNALSLive data');
        for (const href of ['../../index.html','../../experiments/index.html','../index.html','../../archive/index.html']) {
            assert.ok(await page.locator('.site-nav a[href="' + href + '"]').count());
            const response = await page.request.get(new URL(href, page.url()).href); assert.equal(response.status(), 200);
        }
        assert.doesNotMatch(await page.locator('main').innerText(), /LIVE PRICE|BUY|SELL/);
        assert.deepEqual(errors, []);
        const overview = await page.request.get(origin + '/apis/index.html');
        assert.match(await overview.text(), /07-currency-intercept\/index.html/);
        console.log(live ? 'Live currency and CBS browser smoke checks passed.' : 'Controlled currency, CBS, error isolation, retry, race, metrics, navigation, keyboard and responsive checks passed.');
    } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
