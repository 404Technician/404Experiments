'use strict';

(() => {
    const INTERVAL = 5 * 60 * 1000;
    const TIMEOUT = 12000;
    const $ = id => document.getElementById(id);
    const iso = date => date.toISOString().slice(0, 10);
    const utcDay = () => iso(new Date());
    const timeLabel = date => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date) + ' UTC';
    const finite = value => typeof value === 'number' && Number.isFinite(value);
    const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && iso(new Date(value)) === value;
    const readouts = new Map();
    let refreshing = false;
    let lastSync = 0;
    let timer;

    function relative(timestamp) {
        const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
        if (!minutes) return 'JUST NOW';
        if (minutes < 60) return minutes + 'M AGO';
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + 'H AGO';
        return Math.floor(hours / 24) + 'D AGO';
    }
    function plainTitle(value) {
        const text = typeof value === 'object' && value ? value.rendered : value;
        if (typeof text !== 'string' || !text.trim()) throw new Error('No transmission title supplied.');
        const doc = new DOMParser().parseFromString(text, 'text/html');
        doc.querySelectorAll('script, style, iframe, object, embed').forEach(node => node.remove());
        const title = doc.body.textContent.trim();
        if (!title) throw new Error('No transmission title supplied.');
        return title;
    }
    async function json(url, headers = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT);
        try {
            const response = await fetch(url, { signal: controller.signal, credentials: 'omit', headers: { Accept: 'application/json', ...headers } });
            if (!response.ok) {
                if (response.status === 429 || response.status === 403) throw new Error('Source access or shared rate limit. Try again later.');
                throw new Error('Source returned HTTP ' + response.status + '.');
            }
            return await response.json();
        } catch (error) {
            if (controller.signal.aborted) throw new Error('Source timed out after 12 seconds.');
            if (error instanceof SyntaxError) throw new Error('Unreadable source response.');
            if (error instanceof TypeError) throw new Error('Source connection unavailable.');
            throw error;
        } finally { clearTimeout(timeout); }
    }
    const sources = {
        async weather() {
            const params = new URLSearchParams({ latitude: '51.51', longitude: '5.39', current: 'temperature_2m,relative_humidity_2m', timezone: 'UTC' });
            const data = await json('https://api.open-meteo.com/v1/forecast?' + params);
            const current = data?.current;
            const timestamp = typeof current?.time === 'string' ? Date.parse(current.time + (current.time.endsWith('Z') ? '' : 'Z')) : NaN;
            if (!finite(current?.temperature_2m) || !finite(current?.relative_humidity_2m) || current.relative_humidity_2m < 0 ||
                current.relative_humidity_2m > 100 || !Number.isFinite(timestamp) || timestamp > Date.now() + 60000 ||
                data.current_units?.temperature_2m !== '°C' || data.current_units?.relative_humidity_2m !== '%') throw new Error('Incomplete current weather reading.');
            return {
                value: current.temperature_2m.toFixed(1) + '°C / RH ' + Math.round(current.relative_humidity_2m) + '%',
                detail: 'Best, NL · Observed ' + current.time.replace('T', ' ') + ' UTC',
                stale: () => Date.now() - timestamp > 2 * 60 * 60 * 1000
            };
        },
        async neo() {
            const day = utcDay();
            const params = new URLSearchParams({ start_date: day, end_date: day, api_key: 'DEMO_KEY' });
            const data = await json('https://api.nasa.gov/neo/rest/v1/feed?' + params);
            const rows = data?.near_earth_objects?.[day];
            if (!Array.isArray(rows) || rows.some(row => !row || !['string', 'number'].includes(typeof row.id))) throw new Error('Today’s object feed is incomplete.');
            const objects = [...new Map(rows.map(row => [String(row.id), row])).values()];
            const flagged = objects.filter(row => row.is_potentially_hazardous_asteroid === true).length;
            return {
                value: objects.length + ' OBJECT' + (objects.length === 1 ? '' : 'S'),
                detail: day + ' UTC' + (flagged ? ' · ' + flagged + ' FLAGGED / NASA classification' : ' · NASA / NeoWs'),
                stale: () => day !== utcDay()
            };
        },
        async currency() {
            const end = utcDay();
            const date = new Date(end + 'T00:00:00Z');
            date.setUTCDate(date.getUTCDate() - 7);
            const params = new URLSearchParams({ base: 'eur', quotes: 'usd', from: iso(date), to: end });
            const rows = await json('https://api.frankfurter.dev/v2/rates?' + params);
            if (!Array.isArray(rows) || rows.some(row => !row || row.base !== 'EUR' || row.quote !== 'USD' ||
                !finite(row.rate) || row.rate <= 0 || !validDay(row.date) || row.date < iso(date) || row.date > end)) throw new Error('Invalid reference-rate response.');
            const points = [...new Map(rows.map(row => [row.date, row])).values()].sort((a, b) => a.date.localeCompare(b.date));
            const latest = points.at(-1), previous = points.at(-2);
            if (!latest || !previous) throw new Error('Two available reference dates needed for movement.');
            const change = (latest.rate - previous.rate) / previous.rate * 100;
            if (!finite(change)) throw new Error('Reference movement unavailable.');
            return {
                value: 'EUR/USD ' + new Intl.NumberFormat('en-GB', { signDisplay: 'exceptZero', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(change) + '%',
                detail: 'Reference ' + latest.date + ' vs ' + previous.date + ' · ' + latest.rate.toFixed(4) + ' USD/EUR',
                stale: () => Date.parse(utcDay()) - Date.parse(latest.date) > 4 * 86400000
            };
        },
        async hacker() {
            const rows = await json('https://hacker-news.firebaseio.com/v0/topstories.json');
            if (!Array.isArray(rows) || rows.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid top-story ID list.');
            return { value: rows.length + ' STORIES', detail: 'Top-story IDs · Received ' + timeLabel(new Date()) };
        },
        async github() {
            const rows = await json('https://api.github.com/repos/404Technician/404Experiments/commits?per_page=1', {
                Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'
            });
            const row = Array.isArray(rows) ? rows[0] : null;
            const timestamp = Date.parse(row?.commit?.committer?.date);
            if (!row || !/^[a-f0-9]{7,40}$/i.test(row.sha) || !Number.isFinite(timestamp) || timestamp > Date.now() + 60000) throw new Error('Latest commit metadata unavailable.');
            return {
                value: () => 'UPDATED ' + relative(timestamp),
                detail: row.sha.slice(0, 7) + ' · Committed ' + new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
            };
        },
        async space() {
            const day = utcDay();
            let record = await json('https://science.nasa.gov/wp-json/wp/v2/apod-basic/' + day.replaceAll('-', '').slice(2));
            if (Array.isArray(record)) record = record[0];
            if (!record || typeof record !== 'object' || record.date !== day) throw new Error('Today’s APOD has not been received.');
            return { value: 'SIGNAL ACQUIRED', detail: day + ' · ' + plainTitle(record.title), stale: () => day !== utcDay() };
        }
    };
    function render(id, state, value, detail) {
        const row = document.querySelector('[data-signal="' + id + '"]');
        row.dataset.state = state;
        row.querySelector('.status-state').textContent = state.toUpperCase();
        if (value !== undefined) row.querySelector('.status-value').textContent = value;
        if (detail !== undefined) {
            row.querySelector('.status-detail').textContent = detail;
            row.querySelector('.status-detail').title = detail;
        }
        document.querySelector('[data-node="' + id + '"]').dataset.state = state;
    }
    function show(id, reading) {
        const stale = (reading.stale?.() || Date.now() - reading.received >= INTERVAL);
        render(id, stale ? 'stale' : 'active', typeof reading.value === 'function' ? reading.value() : reading.value,
            reading.detail + (stale ? ' · Older observation / reception' : ''));
    }
    async function receive(id, load) {
        render(id, 'loading');
        try {
            const reading = await load();
            reading.received = Date.now();
            readouts.set(id, reading);
            show(id, reading);
        } catch (error) {
            readouts.delete(id);
            render(id, 'unavailable', 'UNAVAILABLE', error.message + ' Refresh to retry.');
        }
    }
    function schedule() {
        clearTimeout(timer);
        if (!document.hidden) timer = setTimeout(refresh, INTERVAL);
    }
    async function refresh() {
        if (refreshing || document.hidden) return;
        refreshing = true;
        clearTimeout(timer);
        $('refresh-signals').disabled = true;
        $('status-readings').setAttribute('aria-busy', 'true');
        $('sync-note').textContent = 'Refreshing independent sources. Navigation remains available.';
        try {
            await Promise.allSettled(Object.entries(sources).map(([id, load]) => receive(id, load)));
            lastSync = Date.now();
            $('nexus-last-sync').dateTime = new Date(lastSync).toISOString();
            $('nexus-last-sync').textContent = timeLabel(new Date(lastSync));
            const unavailable = document.querySelectorAll('.status-signal[data-state="unavailable"]').length;
            $('sync-note').textContent = 'Refresh complete · ' + readouts.size + '/6 received' +
                (unavailable ? ' · ' + unavailable + ' unavailable' : '') + '. Last sync is reception completion, not source publication.';
        } finally {
            refreshing = false;
            $('refresh-signals').disabled = false;
            $('status-readings').setAttribute('aria-busy', 'false');
            schedule();
        }
    }
    $('refresh-signals').addEventListener('click', refresh);
    document.addEventListener('visibilitychange', () => {
        document.body.dataset.paused = String(document.hidden);
        if (document.hidden) { clearTimeout(timer); return; }
        for (const [id, reading] of readouts) show(id, reading);
        if (!lastSync || Date.now() - lastSync >= INTERVAL) refresh();
        else {
            clearTimeout(timer);
            timer = setTimeout(refresh, INTERVAL - (Date.now() - lastSync));
        }
    });
    document.body.dataset.paused = String(document.hidden);
    refresh();
})();
