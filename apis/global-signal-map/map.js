'use strict';

(() => {
    const $ = id => document.getElementById(id);
    const finite = value => typeof value === 'number' && Number.isFinite(value);
    const coord = (lat, lon) => finite(lat) && finite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    const timestamp = value => finite(value) && value > 0 && value <= Date.now() + 60000;
    const utc = value => new Date(value).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const locations = [
        { name: 'Best, Netherlands', latitude: 51.51, longitude: 5.39 },
        { name: 'New York', latitude: 40.7128, longitude: -74.006 },
        { name: 'São Paulo', latitude: -23.5505, longitude: -46.6333 },
        { name: 'Cape Town', latitude: -33.9249, longitude: 18.4241 },
        { name: 'Tokyo', latitude: 35.6762, longitude: 139.6503 },
        { name: 'Sydney', latitude: -33.8688, longitude: 151.2093 }
    ];
    const intervals = { seismic: 300000, orbital: 20000, atmospheric: 600000 };
    const groups = {}, markers = {}, records = {}, timers = {}, jobs = new Map(), received = new Map();
    let map, fullRefresh = false;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function element(tag, text, className) {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    }
    function state(key, message, kind = 'online') {
        $(key + '-status').textContent = key.toUpperCase() + ' / ' + message;
        $(key + '-status').dataset.state = kind;
    }
    async function json(url) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        try {
            const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return await response.json();
        } catch (error) {
            if (controller.signal.aborted) throw new Error('12-second timeout');
            if (error instanceof SyntaxError) throw new Error('Invalid source JSON');
            if (error instanceof TypeError) throw new Error('Network / CORS unavailable');
            throw error;
        } finally { clearTimeout(timeout); }
    }
    function popup(record) {
        const content = element('div', undefined, 'signal-popup');
        content.append(element('h2', record.kind), element('h3', record.title));
        for (const text of record.lines) content.append(element('p', text));
        content.append(element('p', 'Source: ' + record.source));
        if (record.url) {
            try {
                const url = new URL(record.url);
                if (url.protocol === 'https:' && /(^|\.)usgs\.gov$/.test(url.hostname)) {
                    const link = element('a', 'USGS event details →');
                    link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
                    content.append(link);
                }
            } catch { /* A missing or unsafe detail URL does not discard an observation. */ }
        }
        return content;
    }
    function marker(key, record, diameter = 10) {
        if (!map) return null;
        const icon = L.divIcon({
            className: 'signal-marker ' + key + '-marker',
            html: '<span class="marker-core" aria-hidden="true" style="--diameter:' + diameter + 'px"></span>',
            iconSize: [36, 36], iconAnchor: [18, 18]
        });
        const point = L.marker([record.latitude, record.longitude], { icon, title: record.title, alt: record.title, keyboard: true,
            riseOnHover: true, zIndexOffset: key === 'orbital' ? 1000 : key === 'atmospheric' ? 300 : 0 });
        point.bindPopup(popup(record), { maxWidth: 260, minWidth: 180, autoPanPadding: [24, 24] });
        point.bindTooltip(element('span', record.title), { direction: 'top', offset: [0, -8] });
        point.on('add', () => {
            const node = point.getElement();
            if (node) {
                node.setAttribute('aria-label', record.title + '. Open ' + record.kind.toLowerCase() + ' details');
                node.dataset.feed = key;
            }
        });
        point.addTo(groups[key]);
        return point;
    }
    function clear(key) {
        groups[key]?.clearLayers(); markers[key] = [];
    }
    function renderText() {
        $('observations').replaceChildren(...['seismic', 'orbital', 'atmospheric'].map(key => {
            const section = element('section');
            section.append(element('h2', key.toUpperCase()));
            const entries = records[key] || [];
            if (!entries.length) { section.append(element('p', 'No received observations. See feed status above.')); return section; }
            const list = element('ul');
            // Keep the text alternative small; map markers retain every plotted seismic record.
            for (const record of entries.slice(0, key === 'seismic' ? 10 : 6)) {
                const li = element('li');
                li.append(element('strong', record.title));
                for (const line of record.lines) li.append(element('div', line));
                list.append(li);
            }
            if (key === 'seismic' && entries.length > 10) section.append(element('p', 'Ten largest plotted events below. All ' + entries.length + ' markers are keyboard accessible on the map.'));
            section.append(list);
            return section;
        }));
    }
    const loaders = {
        async seismic() {
            const data = await json('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
            if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features) || !timestamp(data.metadata?.generated)) throw new Error('Invalid USGS feed');
            const valid = data.features.filter(f => {
                const p = f?.properties, c = f?.geometry?.coordinates;
                return f?.geometry?.type === 'Point' && Array.isArray(c) && coord(c[1], c[0]) && finite(p?.mag) && p.mag >= 2.5 &&
                    timestamp(p.time) && p.time >= Date.now() - 86400000 && (!p.type || p.type === 'earthquake');
            }).sort((a, b) => b.properties.mag - a.properties.mag || b.properties.time - a.properties.time);
            if (data.features.length && !valid.length) throw new Error('No usable recent earthquake coordinates');
            clear('seismic');
            records.seismic = valid.slice(0, 180).map(f => {
                const p = f.properties, c = f.geometry.coordinates;
                const record = { kind: 'SEISMIC SIGNAL', title: 'M ' + p.mag.toFixed(1) + ' · ' + (typeof p.place === 'string' ? p.place : 'Location description unavailable'),
                    latitude: c[1], longitude: c[0], source: 'USGS', url: p.url,
                    lines: ['Observed: ' + utc(p.time), 'Depth: ' + (finite(c[2]) ? c[2].toFixed(1) + ' km' : 'Unavailable'), 'Feed published: ' + utc(data.metadata.generated)] };
                const point = marker('seismic', record, Math.min(22, Math.max(7, 5 + p.mag * 1.7)));
                if (point) markers.seismic.push(point);
                return record;
            });
            $('seismic-value').textContent = String(records.seismic.length);
            const stale = Date.now() - data.metadata.generated > 1800000;
            const skipped = data.features.length - valid.length;
            state('seismic', (stale ? 'STALE FEED' : 'ONLINE') + (valid.length > 180 ? ' · Largest 180 of ' + valid.length : '') +
                (skipped ? ' · ' + skipped + ' unusable / out-of-window omitted' : ''), stale ? 'stale' : 'online');
        },
        async orbital() {
            const data = await json('https://api.wheretheiss.at/v1/satellites/25544');
            if (data?.id !== 25544 || !finite(data.timestamp) || !coord(data.latitude, data.longitude) || !timestamp(data.timestamp * 1000)) throw new Error('Invalid ISS position');
            const record = { kind: 'ORBITAL SIGNAL', title: 'ISS', latitude: data.latitude, longitude: data.longitude, source: 'Where the ISS at?',
                lines: ['Latitude: ' + data.latitude.toFixed(4) + '°', 'Longitude: ' + data.longitude.toFixed(4) + '°', 'Updated: ' + utc(data.timestamp * 1000)] };
            records.orbital = [record];
            // Update the existing position and popup rather than stacking or animating markers.
            const point = markers.orbital?.[0];
            if (point) { point.setLatLng([record.latitude, record.longitude]); point.setPopupContent(popup(record)); }
            else { clear('orbital'); const created = marker('orbital', record); if (created) markers.orbital.push(created); }
            const stale = Date.now() - data.timestamp * 1000 > 120000;
            $('orbital-value').textContent = stale ? 'LAST KNOWN' : 'TRACKING';
            state('orbital', (stale ? 'STALE / ' : 'ONLINE / ') + new Date(data.timestamp * 1000).toISOString().slice(11, 19) + ' UTC', stale ? 'stale' : 'online');
        },
        async atmospheric() {
            const params = new URLSearchParams({
                latitude: locations.map(p => p.latitude).join(','), longitude: locations.map(p => p.longitude).join(','),
                current: 'temperature_2m,wind_speed_10m', timezone: 'UTC'
            });
            const data = await json('https://api.open-meteo.com/v1/forecast?' + params);
            if (!Array.isArray(data) || data.length !== locations.length) throw new Error('Invalid weather batch');
            const observations = data.map((row, i) => {
                const site = locations[i], current = row?.current;
                const observed = typeof current?.time === 'string' ? Date.parse(current.time + 'Z') : NaN;
                if (!coord(row?.latitude, row?.longitude) || Math.abs(row.latitude - site.latitude) > .5 || Math.abs(row.longitude - site.longitude) > .5 ||
                    (row.location_id !== undefined && row.location_id !== i) || !finite(current?.temperature_2m) || !finite(current?.wind_speed_10m) ||
                    current.wind_speed_10m < 0 || !timestamp(observed) || row.current_units?.temperature_2m !== '°C' || row.current_units?.wind_speed_10m !== 'km/h') return null;
                return { kind: 'ATMOSPHERIC SIGNAL', title: site.name, latitude: site.latitude, longitude: site.longitude, source: 'Open-Meteo',
                    stale: Date.now() - observed > 7200000,
                    lines: [current.temperature_2m.toFixed(1) + ' °C', 'Wind: ' + current.wind_speed_10m.toFixed(1) + ' km/h', 'Updated: ' + utc(observed)] };
            }).filter(Boolean);
            if (!observations.length) throw new Error('No valid current weather observations');
            clear('atmospheric'); records.atmospheric = observations;
            for (const record of observations) { const point = marker('atmospheric', record); if (point) markers.atmospheric.push(point); }
            $('atmospheric-value').textContent = observations.length + ' NODES';
            const stale = observations.some(p => p.stale);
            state('atmospheric', observations.length < 6 ? 'PARTIAL / ' + observations.length + ' of 6' : stale ? 'STALE OBSERVATIONS' : 'ONLINE',
                observations.length < 6 ? 'partial' : stale ? 'stale' : 'online');
        }
    };
    function schedule(key) {
        clearTimeout(timers[key]);
        if (!document.hidden && $('show-' + key).checked) timers[key] = setTimeout(() => receive(key), intervals[key]);
    }
    function receive(key) {
        if (jobs.has(key)) return jobs.get(key);
        clearTimeout(timers[key]);
        state(key, 'LOADING', 'loading');
        const promise = (async () => {
            try { await loaders[key](); received.set(key, Date.now()); }
            catch (error) {
                clear(key); records[key] = []; received.delete(key);
                $(key + '-value').textContent = '—';
                state(key, 'SIGNAL LOST · ' + error.message, 'error');
            } finally {
                renderText(); jobs.delete(key); schedule(key);
            }
        })();
        jobs.set(key, promise);
        return promise;
    }
    async function refresh() {
        if (fullRefresh) return;
        fullRefresh = true; $('refresh-map').disabled = true;
        $('reception-status').textContent = 'Refreshing three independent feeds…';
        await Promise.allSettled(Object.keys(loaders).map(receive));
        const date = new Date();
        $('last-sync').dateTime = date.toISOString(); $('last-sync').textContent = date.toISOString().slice(11, 19);
        $('reception-status').textContent = 'Refresh complete · ' + Object.values(records).filter(rows => rows.length).length +
            '/3 feeds received · Last sync marks full refresh completion, not source publication.';
        fullRefresh = false; $('refresh-map').disabled = false;
    }
    function worldView() { map?.fitBounds([[-65, -180], [80, 180]], { padding: [14, 14], animate: false }); }
    if (typeof L === 'undefined') {
        $('global-map').replaceChildren(element('p', 'Map library unavailable. Reload to retry. Received observations remain available below.', 'map-placeholder'));
        $('basemap-status').textContent = 'BASEMAP / Leaflet CDN unavailable';
        $('world-view').disabled = true;
    } else {
        $('global-map').replaceChildren();
        map = L.map('global-map', { minZoom: 0, maxZoom: 8, zoomSnap: .25, zoomDelta: .5, maxBounds: [[-85, -180], [85, 180]], maxBoundsViscosity: 1,
            zoomAnimation: !reduced, fadeAnimation: false, markerZoomAnimation: !reduced, inertia: !reduced });
        map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
        worldView();
        const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 8, noWrap: true, keepBuffer: 1, bounds: [[-85, -180], [85, 180]],
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        let tileErrors = 0;
        tiles.on('tileerror', () => { tileErrors++; $('basemap-status').textContent = 'BASEMAP / Some tiles unavailable. Data layers and source observations remain independent.'; });
        tiles.on('load', () => { if (!tileErrors) $('basemap-status').textContent = 'BASEMAP / OpenStreetMap received'; });
        for (const key of Object.keys(loaders)) groups[key] = L.layerGroup().addTo(map);
        new ResizeObserver(() => map.invalidateSize({ animate: false, pan: false })).observe($('global-map'));
    }
    for (const key of Object.keys(loaders)) {
        $('show-' + key).addEventListener('change', event => {
            if (map) {
                if (event.target.checked) groups[key].addTo(map); else map.removeLayer(groups[key]);
            }
            if (!event.target.checked) clearTimeout(timers[key]);
            else if (!received.has(key) || Date.now() - received.get(key) >= intervals[key]) receive(key);
            else schedule(key);
        });
    }
    $('refresh-map').addEventListener('click', refresh);
    $('world-view').addEventListener('click', worldView);
    document.addEventListener('visibilitychange', () => {
        for (const key of Object.keys(loaders)) {
            clearTimeout(timers[key]);
            if (!document.hidden && $('show-' + key).checked) {
                if (!received.has(key) || Date.now() - received.get(key) >= intervals[key]) receive(key); else schedule(key);
            }
        }
    });
    refresh();
})();
