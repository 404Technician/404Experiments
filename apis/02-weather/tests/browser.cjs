'use strict';
// Controlled browser fixtures exercise failures without adding fallback data to the site.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const locations = [
    { name: 'Best', latitude: 51.5075, longitude: 5.39028, country: 'The Netherlands', country_code: 'NL', admin1: 'North Brabant', timezone: 'Europe/Amsterdam' },
    { name: 'Eindhoven', latitude: 51.44083, longitude: 5.47778, country: 'The Netherlands', country_code: 'NL', admin1: 'North Brabant', timezone: 'Europe/Amsterdam' },
    { name: 'Amsterdam', latitude: 52.37403, longitude: 4.88969, country: 'The Netherlands', country_code: 'NL', admin1: 'North Holland', timezone: 'Europe/Amsterdam' },
    { name: 'Berlin', latitude: 52.52437, longitude: 13.41053, country: 'Germany', country_code: 'DE', admin1: 'State of Berlin', timezone: 'Europe/Berlin' },
    { name: 'Tokyo', latitude: 35.6895, longitude: 139.69171, country: 'Japan', country_code: 'JP', admin1: 'Tokyo', timezone: 'Asia/Tokyo' },
    { name: 'New York', latitude: 40.71427, longitude: -74.00597, country: 'United States', country_code: 'US', admin1: 'New York', timezone: 'America/New_York' },
    { name: 'Beverly Hills', latitude: 34.07362, longitude: -118.40036, country: 'United States', country_code: 'US', admin1: 'California', timezone: 'America/Los_Angeles' },
];
const now = new Date('2026-10-07T18:30:00Z');
const isoToday = timezone => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const dayAfter = (day, offset) => { const date = new Date(day + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
let mode = {};
let requests = [];
function forecast(params) {
    const location = locations.find(item => item.latitude === Number(params.get('latitude'))) || locations[0];
    const timezone = location.timezone;
    const dates = Array.from({ length: mode.short ? 10 : 14 }, (_, index) => dayAfter(isoToday(timezone), index));
    const daily = { time: dates };
    for (const field of params.get('daily').split(',')) daily[field] = dates.map((date, index) => {
        if (field === 'weather_code') return index === 1 ? 95 : 0;
        if (field === 'sunrise') return date + 'T07:15';
        if (field === 'sunset') return date + 'T18:25';
        if (field === 'precipitation_probability_max') return 75;
        if (field === 'precipitation_sum') return 3;
        if (field === 'wind_gusts_10m_max') return 30;
        if (field === 'wind_speed_10m_max') return 15;
        return field.endsWith('_max') ? 20 : 10;
    });
    const hourly = { time: [], relative_humidity_2m: [] };
    dates.forEach((date, index) => {
        const samples = index === 0 ? [40, 80, null, -1, 101, '60', 60] : [10, 30];
        samples.forEach((sample, hour) => { hourly.time.push(date + 'T' + String(hour).padStart(2, '0') + ':00'); hourly.relative_humidity_2m.push(sample); });
    });
    const current = { time: dates[0] + 'T10:15', temperature_2m: 18.4, weather_code: 2, relative_humidity_2m: 68, wind_speed_10m: 12 };
    if (mode.humidity === 'missing') delete hourly.relative_humidity_2m;
    if (mode.current === 'missing') delete current.relative_humidity_2m;
    return { timezone, daily, hourly, current };
}
const server = http.createServer((req, res) => {
    let file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (error, data) => { res.writeHead(error ? 404 : 200, { 'Content-Type': file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html' }); res.end(error ? 'Not found' : data); });
});
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch();
    try {
        const context = await browser.newContext({ timezoneId: 'Pacific/Honolulu' });
        const page = await context.newPage();
        await page.clock.setFixedTime(now);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await context.addInitScript(() => { navigator.geolocation.getCurrentPosition = () => { throw new Error('Geolocation must not be requested'); }; navigator.geolocation.watchPosition = () => { throw new Error('Geolocation must not be requested'); }; });
        await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.origin === base) return route.continue();
            requests.push(url.href);
            const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
            if (url.hostname === 'geocoding-api.open-meteo.com') {
                assert.equal(url.searchParams.get('count'), '5');
                assert.equal(url.searchParams.get('language'), 'en');
                assert.equal(url.searchParams.get('format'), 'json');
                if (mode.geo === 'network') return route.abort();
                if (mode.geo === 'failure') return route.fulfill({ status: 500, body: '{}' });
                if (mode.geo === 'malformed') return reply({ results: [{ name: 'Broken', latitude: 1000, longitude: null }] });
                if (mode.geo === 'shape') return reply({ results: 'invalid' });
                if (mode.geo === 'empty') return reply({});
                const name = url.searchParams.get('name');
                if (mode.geo === 'race' && name === 'Tokyo') await new Promise(resolve => setTimeout(resolve, 200));
                const result = locations.find(item => item.name === name) || locations[6];
                return reply({ results: name === 'Springfield' ? [{ ...locations[5], name: 'Springfield', admin1: 'New York' }, { ...locations[3], name: 'Springfield', admin1: 'Berlin' }] : [result] });
            }
            if (url.hostname === 'api.open-meteo.com') {
                assert.equal(url.searchParams.get('forecast_days'), '14');
                assert.equal(url.searchParams.get('timezone'), 'auto');
                assert.equal(url.searchParams.get('hourly'), 'relative_humidity_2m');
                assert.equal(url.searchParams.get('current'), 'temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m');
                assert.equal(url.searchParams.get('temperature_unit'), 'celsius');
                assert.equal(url.searchParams.get('wind_speed_unit'), 'kmh');
                assert.equal(url.searchParams.get('precipitation_unit'), 'mm');
                if (mode.forecast === 'network') return route.abort();
                if (mode.forecast === 'failure') return route.fulfill({ status: 503, body: '{}' });
                if (mode.forecast === 'rate') return route.fulfill({ status: 429, body: '{}' });
                if (mode.forecast === 'race' && Number(url.searchParams.get('latitude')) === locations[4].latitude) await new Promise(resolve => setTimeout(resolve, 200));
                return reply(forecast(url.searchParams));
            }
            return route.abort();
        });
        const ready = () => page.waitForFunction(() => document.querySelector('#forecastGrid').getAttribute('aria-busy') === 'false');
        const goto = async (next = {}, query = '') => { mode = next; requests = []; await page.goto(base + '/apis/02-weather/index.html' + query); await ready(); };
        const search = async name => { await page.locator('#locationQuery').fill(name); await page.locator('#locationQuery').press('Enter'); await page.waitForFunction(() => document.querySelector('#locationResults').getAttribute('aria-busy') === 'false'); };
        const choose = async index => { await page.locator('.location-result').nth(index || 0).click(); await ready(); };
        await goto();
        assert.match(await page.locator('#resolvedLocation').innerText(), /Best/i);
        assert.equal(await page.locator('.forecast-day').count(), 14);
        assert.equal(await page.locator('#currentHumidity').innerText(), '68%');
        assert.equal(await page.locator('.forecast-humidity').first().innerText(), 'RH 60%');
        assert.equal(await page.locator('#detailHumidityAverage').innerText(), 'Average: 60%');
        assert.equal(await page.locator('#detailHumidityLow').innerText(), 'Low: 40%');
        assert.equal(await page.locator('#detailHumidityHigh').innerText(), 'High: 80%');
        assert.match(await page.locator('.forecast-rain').first().innerText(), /75%/);
        assert.equal(await page.locator('#currentCondition').innerText(), 'Partly cloudy');
        await page.locator('.forecast-day').nth(1).click();
        assert.equal(await page.locator('#detailHumidityAverage').innerText(), 'Average: 20%');
        assert.equal(await page.locator('#detailCondition').innerText(), 'Thunderstorm');
        assert.equal(await page.locator('#detailSunrise').innerText(), '07:15');
        assert.equal(await page.locator('#detailSunset').innerText(), '18:25');
        console.log('PASS default, 14 days, current RH, calculated averages/ranges, rain separation, WMO and existing details');
        for (const location of locations.slice(0, 6)) {
            await search(location.name);
            assert.equal(await page.locator('.location-result').count(), 1);
            const before = requests.filter(url => url.includes('api.open-meteo.com/v1/forecast')).length;
            await choose();
            const last = new URL(requests.filter(url => url.includes('api.open-meteo.com/v1/forecast')).at(-1));
            assert.equal(Number(last.searchParams.get('latitude')), location.latitude);
            assert.equal(Number(last.searchParams.get('longitude')), location.longitude);
            assert.equal(requests.filter(url => url.includes('api.open-meteo.com/v1/forecast')).length, before + 1);
            assert.equal(await page.locator('#locationTimezone').innerText(), location.timezone);
            assert.equal(await page.locator('.forecast-weekday').first().innerText(), 'TODAY');
            assert.equal(await page.locator('.forecast-day').count(), 14);
            assert.equal(await page.locator('#currentHumidity').innerText(), '68%');
            assert.equal(new URL(page.url()).searchParams.get('lat'), String(location.latitude));
            const day = await page.evaluate(() => forecastDays[0].date);
            assert.equal(day, isoToday(location.timezone));
            console.log('PASS selected coordinates, local date/timezone and humidity:', location.name);
        }
        const currentLocation = await page.locator('#resolvedLocation').innerText();
        const count = requests.length;
        await search('Springfield');
        assert.equal(await page.locator('.location-result').count(), 2);
        assert.equal(await page.locator('#resolvedLocation').innerText(), currentLocation);
        assert.equal(requests.slice(count).filter(url => url.includes('/v1/forecast')).length, 0);
        assert.match(await page.locator('.location-result').nth(1).innerText(), /Berlin/);
        await choose(1);
        await search('90210');
        await choose();
        assert.match(await page.locator('#resolvedLocation').innerText(), /Beverly Hills/i);
        const shared = new URL(page.url()).search;
        await goto({}, shared);
        assert.match(await page.locator('#resolvedLocation').innerText(), /Beverly Hills/i);
        assert.equal(await page.locator('#locationTimezone').innerText(), 'America/Los_Angeles');
        await search('Tokyo'); await choose();
        await page.goBack(); await ready();
        assert.match(await page.locator('#resolvedLocation').innerText(), /Beverly Hills/i);
        assert.match(await page.locator('#locationSearchStatus').innerText(), /Location restored.*Beverly Hills/i);
        console.log('PASS explicit ambiguous picker, postal code, URL restore and browser Back');
        for (const query of ['?lat=91&lon=4&name=Broken', '?lat=NaN&lon=4&name=Broken', '?lat=&lon=4&name=Broken', '?lat=40&lon=999&name=Broken', '?lat=40&lon=4', '?lat=40&lon=4&name=%00']) { await goto({}, query); assert.match(await page.locator('#resolvedLocation').innerText(), /Best/i); }
        await goto();
        for (const query of ['', ' ', '?', 'a']) { const count = requests.length; await search(query); assert.equal(requests.length, count); assert.match(await page.locator('#locationSearchStatus').innerText(), /Enter a city/i); }
        for (const geo of ['empty', 'malformed', 'shape', 'network', 'failure']) {
            await goto({ geo }); await search('Tokyo');
            assert.equal(await page.locator('.forecast-day').count(), 14);
            assert.match(await page.locator('#resolvedLocation').innerText(), /Best/i);
            if (geo === 'empty') assert.match(await page.locator('#locationSearchStatus').innerText(), /No location found/i);
            else { assert(await page.locator('#retryLocationSearch').isVisible()); mode.geo = ''; await page.locator('#retryLocationSearch').click(); await page.waitForSelector('.location-result'); }
        }
        for (const failure of ['network', 'failure', 'rate']) {
            await goto(); mode.forecast = failure; await search('Tokyo'); await choose();
            assert.match(await page.locator('#resolvedLocation').innerText(), /Tokyo/i);
            assert.equal(await page.locator('.forecast-day').count(), 0);
            assert.equal(await page.locator('#currentHumidity').innerText(), '—');
            assert.equal(await page.locator('#weatherStatus').getAttribute('data-state'), 'error');
            assert(!(await page.locator('#refreshWeather').isDisabled()));
            mode.forecast = ''; await page.locator('#refreshWeather').click(); await ready();
            assert.equal(await page.locator('.forecast-day').count(), 14);
        }
        console.log('PASS URL/input validation, no results, malformed/network/API/rate errors, selected-location retention and retry');
        await goto({ humidity: 'missing', current: 'missing', short: true });
        assert.equal(await page.locator('.forecast-day').count(), 14);
        assert.equal(await page.locator('.forecast-humidity').first().innerText(), 'RH —');
        assert.equal(await page.locator('#detailHumidityLow').innerText(), 'Low: —');
        assert.equal(await page.locator('#currentHumidity').innerText(), '—');
        assert.equal(await page.locator('#weatherStatus').getAttribute('data-state'), 'partial');
        const grouped = await page.evaluate(() => [...dailyHumidity({ time: ['2026-10-25T00:00', '2026-10-25T02:00', '2026-10-25T02:00', '2026-10-25T23:00', '2026-10-26T00:00', '2026-02-30T12:00', '2026-10-25T99:99'], relative_humidity_2m: [20, 40, 60, 80, 10, 100, 100] })]);
        assert.deepEqual(grouped, [['2026-10-25', { min: 20, max: 80, average: 50, count: 4 }], ['2026-10-26', { min: 10, max: 10, average: 10, count: 1 }]]);
        console.log('PASS missing humidity, partial 14-day sequence and local/DST calendar grouping');
        await goto({ geo: 'race' });
        await page.locator('#locationQuery').fill('Tokyo'); await page.locator('#locationQuery').press('Enter');
        await page.locator('#locationQuery').fill('Berlin'); await page.locator('#locationQuery').press('Enter');
        await page.waitForSelector('.location-result'); assert.match(await page.locator('.location-result').first().innerText(), /Berlin/);
        await goto({ forecast: 'race' });
        await search('Tokyo'); await page.locator('.location-result').first().click();
        await search('Berlin'); await choose();
        assert.match(await page.locator('#resolvedLocation').innerText(), /Berlin/i); assert.equal(await page.locator('#locationTimezone').innerText(), 'Europe/Berlin');
        console.log('PASS superseded geocoding/forecast cancellation');
        for (const width of [1440, 768, 375]) {
            await page.setViewportSize({ width, height: 1000 }); await goto(); await search('Springfield');
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await choose(); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            const boxes = await page.locator('.site-nav-links a').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, height: box.height }; }));
            assert(boxes.every(box => box.left >= 0 && box.right <= width && box.height >= 44));
            console.log('PASS responsive navigation/search/forecast/detail', width);
        }
        await goto(); await page.keyboard.press('Tab'); assert(await page.locator('.skip-link').evaluate(node => node === document.activeElement)); await page.keyboard.press('Enter'); assert(await page.locator('main').evaluate(node => node === document.activeElement));
        await page.locator('#locationQuery').focus(); await page.keyboard.type('Tokyo'); await page.keyboard.press('Enter'); await page.waitForSelector('.location-result'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); assert(await page.locator('.location-result').first().evaluate(node => node === document.activeElement)); await page.keyboard.press('Enter'); await ready();
        assert.match(await page.locator('#resolvedLocation').innerText(), /Tokyo/i);
        await page.locator('.forecast-day').first().focus(); await page.keyboard.press('Enter'); assert.equal(await page.locator('.forecast-day').first().getAttribute('aria-pressed'), 'true');
        await page.emulateMedia({ reducedMotion: 'reduce' }); assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto'); assert.equal(await page.locator('.forecast-day').first().evaluate(node => getComputedStyle(node).transitionDuration), '0s');
        const links = await page.locator('.site-nav a').evaluateAll(nodes => nodes.map(node => node.href));
        for (let index = 0; index < links.length; index++) { await goto(); await page.locator('.site-nav a').nth(index).click(); await page.waitForURL(links[index]); assert.equal((await page.request.get(links[index])).status(), 200); }
        assert.deepEqual(errors, []);
        console.log('PASS keyboard search/picker/day controls, reduced motion, global navigation, no geolocation and zero JavaScript errors');
    } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
