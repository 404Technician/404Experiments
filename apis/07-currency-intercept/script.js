'use strict';

const FX = 'https://api.frankfurter.dev/v2';
const CBS = 'https://opendata.cbs.nl/ODataApi/OData/80416ned';
const fuels = [
    { key: 'BenzineEuro95_1', name: 'EURO95', color: '#63dcff' },
    { key: 'Diesel_2', name: 'DIESEL', color: '#4c91ff' },
    { key: 'Lpg_3', name: 'LPG', color: '#a9c2b5' }
];
const $ = id => document.getElementById(id);
const state = { currencies: new Map(), rate: null, rateDays: 30, fuelDays: 30, fuelRows: [], visible: new Set(fuels.map(f => f.key)) };
const jobs = new Map();
const number = (value, digits = 4) => new Intl.NumberFormat('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const signed = (value, digits = 4) => (value > 0 ? '+' : '') + number(value, digits);
const price = value => '€ ' + number(value, 3) + ' / L';
const iso = date => date.toISOString().slice(0, 10);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && iso(new Date(value)) === value;
const dateLabel = value => validDate(value) ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value)) : 'Date unavailable';
const positiveNumber = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function windowDates(days) {
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days);
    return { from: iso(start), to: iso(end) };
}
function status(id, message, error = false) {
    $(id).textContent = message;
    $(id).dataset.state = error ? 'error' : 'ready';
}
function job(key) {
    jobs.get(key)?.abort();
    const controller = new AbortController();
    jobs.set(key, controller);
    return controller;
}
function active(key, controller) { return jobs.get(key) === controller; }
async function get(url, signal) {
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
    if (!response.ok) throw new Error('Source returned HTTP ' + response.status + '.');
    try { return await response.json(); } catch { throw new Error('Source returned malformed JSON.'); }
}
function failure(error) {
    return error.message.startsWith('Source') ? error.message : 'Source could not be reached. Please retry.';
}
function age(date, threshold) {
    const days = Math.max(0, Math.floor((Date.parse(iso(new Date())) - Date.parse(date)) / 86400000));
    return days > threshold ? ' · Latest available observation is ' + days + ' days old' : '';
}
function selected() { return { base: $('base').value, quote: $('quote').value }; }
function validateRate(row, base, quote) {
    return row && row.base === base && row.quote === quote && positiveNumber(row.rate) && validDate(row.date) && row.date <= iso(new Date());
}
function renderConversion() {
    const { base, quote } = selected();
    const amount = $('amount').valueAsNumber;
    if (!Number.isFinite(amount) || amount < 0) {
        $('result').textContent = 'Enter a valid, non-negative amount';
        return;
    }
    if (!state.rate) { $('result').textContent = '—'; return; }
    const result = amount * state.rate.rate;
    $('result').textContent = Number.isFinite(result) ? number(result, 2) + ' ' + quote : 'Amount is too large';
    const a = state.currencies.get(base);
    const b = state.currencies.get(quote);
    $('rate-detail').textContent = '1 ' + base + ' = ' + number(state.rate.rate, 6) + ' ' + quote +
        ' · ' + (a?.name || base) + (a?.symbol ? ' (' + a.symbol + ')' : '') + ' → ' +
        (b?.name || quote) + (b?.symbol ? ' (' + b.symbol + ')' : '') +
        ' · Rate date ' + dateLabel(state.rate.date) + age(state.rate.date, 4);
}
async function loadPair() {
    const controller = job('pair');
    const { base, quote } = selected();
    state.rate = null;
    renderConversion();
    $('rate-detail').textContent = 'Receiving ' + base + '/' + quote + '…';
    status('exchange-status', 'Receiving latest available rate…');
    loadTrace();
    try {
        if (base === quote) throw new Error('Source pair must contain two different currencies.');
        const row = await get(FX + '/rate/' + base.toLowerCase() + '/' + quote.toLowerCase(), controller.signal);
        if (!validateRate(row, base, quote)) throw new Error('Source has no valid rate for this pair.');
        if (!active('pair', controller)) return;
        state.rate = row;
        renderConversion();
        status('exchange-status', 'Latest available / ' + base + ' → ' + quote);
    } catch (error) {
        if (!active('pair', controller)) return;
        $('rate-detail').textContent = 'No reference rate available for ' + base + '/' + quote + '.';
        status('exchange-status', failure(error), true);
    }
}
async function loadExchange() {
    const controller = job('metadata');
    job('pair'); job('trace'); job('strip');
    state.ratePoints = [];
    state.rate = null;
    state.currencies.clear();
    renderConversion();
    $('rate-detail').textContent = 'Receiving currency metadata…';
    $('base').disabled = $('quote').disabled = $('swap').disabled = true;
    $('pair-strip').replaceChildren();
    $('rate-chart').replaceChildren(); $('rate-metrics').replaceChildren();
    status('trace-status', 'Awaiting currency metadata.');
    status('exchange-status', 'Receiving currency metadata…');
    try {
        const rows = await get(FX + '/currencies', controller.signal);
        if (!Array.isArray(rows) || !rows.length || rows.some(row => !row || !/^[A-Z]{3}$/.test(row.iso_code) || typeof row.name !== 'string')) {
            throw new Error('Source returned invalid currency metadata.');
        }
        if (!active('metadata', controller)) return;
        const previous = selected();
        state.currencies = new Map(rows.map(row => [row.iso_code, row]));
        for (const id of ['base', 'quote']) {
            $(id).replaceChildren(...rows.map(row => {
                const option = document.createElement('option');
                option.value = row.iso_code;
                option.textContent = row.iso_code + ' / ' + row.name;
                return option;
            }));
            const preferred = state.currencies.has(previous[id]) ? previous[id] : id === 'base' ? 'EUR' : 'USD';
            if (!state.currencies.has(preferred)) throw new Error('Source does not support the default currency pair.');
            $(id).value = preferred;
        }
        $('base').disabled = $('quote').disabled = $('swap').disabled = false;
        loadPair(); loadStrip();
    } catch (error) {
        if (!active('metadata', controller)) return;
        status('exchange-status', failure(error), true);
        status('trace-status', 'Currency metadata unavailable. Retry exchange.', true);
    }
}
async function loadStrip() {
    const controller = job('strip');
    const nodes = ['USD', 'GBP', 'CHF', 'JPY', 'CNY'].map(quote => {
        const article = document.createElement('article');
        article.innerHTML = '<span>EUR / ' + quote + '</span><strong>—</strong><small>Receiving…</small>';
        $('pair-strip').append(article);
        return { quote, article };
    });
    await Promise.allSettled(nodes.map(async ({ quote, article }) => {
        try {
            if (!state.currencies.has('EUR') || !state.currencies.has(quote)) throw new Error('Unsupported');
            const row = await get(FX + '/rate/eur/' + quote.toLowerCase(), controller.signal);
            if (!validateRate(row, 'EUR', quote)) throw new Error('Missing pair');
            if (!active('strip', controller)) return;
            article.querySelector('strong').textContent = number(row.rate);
            article.querySelector('small').textContent = dateLabel(row.date) + age(row.date, 4);
        } catch {
            if (active('strip', controller)) article.querySelector('small').textContent = 'Unavailable · retry exchange';
        }
    }));
}
function summary(points) {
    const first = points[0].value;
    const latest = points.at(-1).value;
    return { first, latest, delta: latest - first, percent: (latest - first) / first * 100,
        high: Math.max(...points.map(p => p.value)), low: Math.min(...points.map(p => p.value)) };
}
function metric(label, value, movement) {
    return '<div><dt>' + escape(label) + '</dt><dd' + (movement === undefined ? '' : ' class="' + (movement > 0 ? 'positive' : movement < 0 ? 'negative' : '') + '"') + '>' + escape(value) + '</dd></div>';
}
function chart(id, series, from, to, title, digits = 4) {
    const host = $(id);
    const shown = series.filter(s => s.points.some(p => positiveNumber(p.value)));
    if (!shown.length) { host.innerHTML = '<p class="empty">No observations to plot in this window.</p>'; return; }
    const values = shown.flatMap(s => s.points.filter(p => positiveNumber(p.value)).map(p => p.value));
    let low = Math.min(...values), high = Math.max(...values);
    const pad = (high - low || high * .02) * .15;
    low -= pad; high += pad;
    const start = Date.parse(from), span = Date.parse(to) - start || 1;
    const width = Math.max(300, Math.min(960, host.clientWidth));
    const right = width - 20;
    const x = date => 65 + (Date.parse(date) - start) / span * (right - 65);
    const y = value => 205 - (value - low) / (high - low) * 170;
    let svg = '<svg viewBox="0 0 ' + width + ' 260" role="img" aria-label="' + escape(title) + '"><title>' + escape(title) + '</title>';
    for (let i = 0; i < 3; i++) {
        const value = low + (high - low) * i / 2;
        svg += '<path d="M65 ' + y(value) + 'H' + right + '" stroke="#263847" stroke-width="1"/><text x="3" y="' + (y(value) + 4) + '">' + number(value, digits) + '</text>';
    }
    for (const s of shown) {
        // Missing observations break a line; they are never coerced to zero or interpolated.
        let drawing = false;
        let path = '';
        for (const p of s.points) {
            if (!positiveNumber(p.value)) { drawing = false; continue; }
            path += (drawing ? 'L' : 'M') + x(p.date).toFixed(2) + ' ' + y(p.value).toFixed(2);
            drawing = true;
            svg += '<circle cx="' + x(p.date) + '" cy="' + y(p.value) + '" r="2" fill="' + s.color + '"><title>' + escape(s.name + ' / ' + p.date + ' / ' + number(p.value, digits)) + '</title></circle>';
        }
        svg += '<path d="' + path + '" fill="none" stroke="' + s.color + '" stroke-width="2" vector-effect="non-scaling-stroke"/>';
    }
    svg += '<text x="65" y="246">' + escape(dateLabel(from)) + '</text><text x="' + right + '" y="246" text-anchor="end">' + escape(dateLabel(to)) + '</text></svg>';
    host.innerHTML = svg;
}
async function loadTrace() {
    const controller = job('trace');
    state.ratePoints = [];
    $('rate-chart').replaceChildren(); $('rate-metrics').replaceChildren();
    if (!state.currencies.size) { status('trace-status', 'Awaiting currency metadata.'); return; }
    const { base, quote } = selected();
    const { from, to } = windowDates(state.rateDays);
    status('trace-status', 'Receiving ' + base + '/' + quote + ' · ' + from + ' → ' + to);
    try {
        if (base === quote) throw new Error('Source pair must contain two different currencies.');
        const params = new URLSearchParams({ base: base.toLowerCase(), quotes: quote.toLowerCase(), from, to });
        const rows = await get(FX + '/rates?' + params, controller.signal);
        if (!Array.isArray(rows) || rows.some(row => !validateRate(row, base, quote))) throw new Error('Source returned invalid rate history.');
        const points = rows.filter(row => row.date >= from && row.date <= to).sort((a, b) => a.date.localeCompare(b.date)).map(row => ({ date: row.date, value: row.rate }));
        if (!active('trace', controller)) return;
        if (!points.length) throw new Error('Source has no observations in this window.');
        const m = summary(points);
        state.ratePoints = points;
        chart('rate-chart', [{ name: base + '/' + quote, color: '#63dcff', points }], from, to, base + '/' + quote + ' daily reference rate trace');
        $('rate-metrics').innerHTML = '<dl class="metrics">' + metric('First', number(m.first)) + metric('Latest', number(m.latest)) +
            metric('Window delta', signed(m.delta), m.delta) + metric('Delta %', signed(m.percent, 2) + '%', m.delta) + metric('High', number(m.high)) + metric('Low', number(m.low)) + '</dl>';
        status('trace-status', base + '/' + quote + ' · ' + dateLabel(from) + ' → ' + dateLabel(to) + ' · ' + points.length + ' observations' + (points.length === 1 ? ' · One point; no movement comparison' : ''));
    } catch (error) {
        if (!active('trace', controller)) return;
        status('trace-status', failure(error), true);
        $('rate-chart').innerHTML = '<p class="empty">Rate trace unavailable. Retry this window.</p>';
    }
}
function fuelDate(key) {
    if (typeof key !== 'string' || !/^\d{8}$/.test(key)) return null;
    const date = key.slice(0, 4) + '-' + key.slice(4, 6) + '-' + key.slice(6);
    return validDate(date) ? date : null;
}
async function fuelData(days, signal) {
    const { from, to } = windowDates(days);
    const params = new URLSearchParams({
        '$filter': "Perioden ge '" + from.replaceAll('-', '') + "' and Perioden le '" + to.replaceAll('-', '') + "'",
        '$select': 'Perioden,BenzineEuro95_1,Diesel_2,Lpg_3',
        '$top': '400'
    });
    let url = CBS + '/TypedDataSet?' + params;
    const rows = [];
    const visited = new Set();
    while (url) {
        if (visited.has(url) || visited.size >= 10) throw new Error('Source returned invalid pagination.');
        visited.add(url);
        const data = await get(url, signal);
        if (!data || !Array.isArray(data.value) || data.value.some(row => !row || !fuelDate(row.Perioden) ||
            fuels.some(f => !Object.hasOwn(row, f.key) || (row[f.key] !== null && (typeof row[f.key] !== 'number' || !Number.isFinite(row[f.key])))))) {
            throw new Error('Source returned invalid fuel observations.');
        }
        rows.push(...data.value.map(row => ({ ...row, date: fuelDate(row.Perioden) })).filter(row => row.date >= from && row.date <= to));
        const next = data['odata.nextLink'];
        if (next) {
            const nextURL = new URL(next, url);
            if (nextURL.origin !== new URL(CBS).origin || !nextURL.pathname.startsWith(new URL(CBS).pathname + '/TypedDataSet')) throw new Error('Source returned invalid pagination.');
            url = nextURL.href;
        } else url = null;
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date));
}
async function loadFuel() {
    const controller = job('fuel');
    $('fuel-current').replaceChildren(); $('fuel-dates').textContent = '';
    status('fuel-status', 'Receiving latest national averages…');
    loadFuelTrace();
    // A bounded year also permits a per-fuel latest observation when a recent value is missing.
    const infoTask = get(CBS + '/TableInfos', controller.signal).catch(() => null);
    try {
        const rows = await fuelData(365, controller.signal);
        const info = await infoTask;
        if (!active('fuel', controller)) return;
        if (!rows.length || !fuels.some(f => rows.some(row => positiveNumber(row[f.key])))) throw new Error('Source has no fuel observations in the last year.');
        $('fuel-current').innerHTML = fuels.map(f => {
            const row = rows.findLast(row => positiveNumber(row[f.key]));
            return '<article><h3>' + f.name + '</h3><strong>' + (row ? price(row[f.key]) : 'Unavailable') +
                '</strong><small>' + (row ? 'Source date ' + dateLabel(row.date) + age(row.date, 7) : 'No valid observation in the last year') + '</small></article>';
        }).join('');
        const last = rows.findLast(row => fuels.some(f => positiveNumber(row[f.key]))).date;
        const modified = info?.value?.[0]?.Modified;
        const updateDate = typeof modified === 'string' ? modified.slice(0, 10) : null;
        $('fuel-dates').textContent = 'Latest observation: ' + dateLabel(last) + ' · Dataset updated: ' + (validDate(updateDate) ? dateLabel(updateDate) : 'Unavailable') + '. Daily values published weekly; update date is not a fuel observation date.';
        status('fuel-status', 'Latest published / national weighted average' + age(last, 7));
    } catch (error) {
        if (!active('fuel', controller)) return;
        status('fuel-status', failure(error), true);
    }
}
function renderFuelTrace() {
    const { from, to } = windowDates(state.fuelDays);
    const series = fuels.filter(f => state.visible.has(f.key)).map(f => ({ ...f, points: state.fuelRows.map(row => ({ date: row.date, value: positiveNumber(row[f.key]) ? row[f.key] : null })) }));
    chart('fuel-chart', series, from, to, 'Dutch national weighted average fuel prices in euros per litre', 3);
    if (!state.visible.size) $('fuel-chart').innerHTML = '<p class="empty">Select a fuel series to plot.</p>';
    $('fuel-metrics').innerHTML = fuels.map(f => {
        const points = state.fuelRows.filter(row => positiveNumber(row[f.key])).map(row => ({ date: row.date, value: row[f.key] }));
        if (!points.length) return '<article><h3>' + f.name + '</h3><p>No valid observations in this window.</p></article>';
        const m = summary(points);
        return '<article><h3>' + f.name + ' / ' + points.length + ' observations</h3><dl>' +
            metric('Latest in window', price(m.latest)) + metric('Window delta €/L', signed(m.delta, 3), m.delta) +
            metric('Delta %', signed(m.percent, 2) + '%', m.delta) + metric('High €/L', number(m.high, 3)) +
            metric('Low €/L', number(m.low, 3)) + '</dl><p>Observed ' + dateLabel(points.at(-1).date) + '</p></article>';
    }).join('');
}
async function loadFuelTrace() {
    const controller = job('fuelTrace');
    state.fuelRows = [];
    $('fuel-chart').replaceChildren(); $('fuel-metrics').replaceChildren();
    const { from, to } = windowDates(state.fuelDays);
    status('fuel-trace-status', 'Receiving ' + dateLabel(from) + ' → ' + dateLabel(to) + '…');
    try {
        const rows = await fuelData(state.fuelDays, controller.signal);
        if (!active('fuelTrace', controller)) return;
        state.fuelRows = rows;
        renderFuelTrace();
        const count = rows.filter(row => fuels.some(f => positiveNumber(row[f.key]))).length;
        const missing = rows.some(row => fuels.some(f => !positiveNumber(row[f.key])));
        status('fuel-trace-status', dateLabel(from) + ' → ' + dateLabel(to) + ' · ' + count + ' daily observations' +
            (count ? (missing ? ' · Missing values omitted; chart gaps preserved' : '') : ' · No observations in this window; daily values arrive in weekly batches'));
    } catch (error) {
        if (!active('fuelTrace', controller)) return;
        status('fuel-trace-status', failure(error), true);
        $('fuel-chart').innerHTML = '<p class="empty">Fuel trace unavailable. Retry this window.</p>';
    }
}
function periods(id, key, load) {
    for (const [label, days] of [['7D', 7], ['30D', 30], ['90D', 90], ['1Y', 365]]) {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = label;
        button.setAttribute('aria-pressed', String(state[key] === days));
        button.addEventListener('click', () => {
            state[key] = days;
            for (const sibling of $(id).children) sibling.setAttribute('aria-pressed', String(sibling === button));
            load();
        });
        $(id).append(button);
    }
}
periods('rate-periods', 'rateDays', loadTrace);
periods('fuel-periods', 'fuelDays', loadFuelTrace);
for (const f of fuels) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = f.name; button.style.borderBottomColor = f.color;
    button.setAttribute('aria-pressed', 'true');
    button.addEventListener('click', () => {
        if (state.visible.has(f.key)) state.visible.delete(f.key); else state.visible.add(f.key);
        button.setAttribute('aria-pressed', String(state.visible.has(f.key)));
        renderFuelTrace();
    });
    $('fuel-toggles').append(button);
}
$('amount').addEventListener('input', renderConversion);
$('base').addEventListener('change', loadPair);
$('quote').addEventListener('change', loadPair);
$('swap').addEventListener('click', () => {
    const base = $('base').value;
    $('base').value = $('quote').value;
    $('quote').value = base;
    loadPair();
});
$('exchange-retry').addEventListener('click', loadExchange);
$('trace-retry').addEventListener('click', loadTrace);
$('fuel-retry').addEventListener('click', loadFuel);
$('fuel-trace-retry').addEventListener('click', loadFuelTrace);
loadExchange();
loadFuel();

// Resize the plots from cached observations; viewport changes need no new API calls.
let chartWidth = window.innerWidth;
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (window.innerWidth === chartWidth) return;
        chartWidth = window.innerWidth;
        if (state.ratePoints?.length) {
            const { base, quote } = selected();
            const { from, to } = windowDates(state.rateDays);
            chart('rate-chart', [{ name: base + '/' + quote, color: '#63dcff', points: state.ratePoints }], from, to, base + '/' + quote + ' daily reference rate trace');
        }
        if (state.fuelRows.length) renderFuelTrace();
    }, 100);
});
