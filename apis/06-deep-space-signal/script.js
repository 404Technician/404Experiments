'use strict';

(() => {
    const APOD = 'https://science.nasa.gov/wp-json/wp/v2/apod-basic';
    const NEO = 'https://api.nasa.gov/neo/rest/v1/feed';
    const LIBRARY = 'https://images-api.nasa.gov';
    const $ = id => document.getElementById(id);
    const today = () => new Date().toISOString().slice(0, 10);
    const firstApodDate = '1995-06-16';
    let selectedDate = today();
    let apodVersion = 0;
    let searchVersion = 0;
    let detailVersion = 0;
    let lastQuery = '';
    let selectedRecord = null;
    let searchController;
    let detailController;
    const transmissions = new Map();
    const detailCache = new Map();

    // API HTML is parsed as inert text, never inserted into the live document.
    function plain(value, fallback = 'Not supplied') {
        if (value == null || value === '') return fallback;
        const source = typeof value === 'object' ? value.rendered || '' : String(value);
        const doc = new DOMParser().parseFromString(source.replace(/<br\s*\/?\s*>/gi, '\n'), 'text/html');
        doc.querySelectorAll('script, style, iframe, object, embed').forEach(node => node.remove());
        return doc.body.textContent.trim() || fallback;
    }
    function safeUrl(value, nasaOnly = false) {
        try {
            const url = new URL(value);
            if (url.protocol === 'http:' && /(^|\.)nasa\.gov$/.test(url.hostname)) url.protocol = 'https:';
            if (url.protocol !== 'https:') return null;
            if (nasaOnly && !/(^|\.)nasa\.gov$/.test(url.hostname)) return null;
            return url.href;
        } catch { return null; }
    }
    function element(tag, text, className) {
        const node = document.createElement(tag);
        if (text != null) node.textContent = text;
        if (className) node.className = className;
        return node;
    }
    function sourceLink(label, url, nasaOnly = false) {
        const href = safeUrl(url, nasaOnly);
        if (!href) return null;
        const link = element('a', label);
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        return link;
    }
    function state(source, text, kind = 'ready') {
        const node = $(source + '-status');
        node.textContent = text;
        node.dataset.state = kind;
        $(source + '-retry').hidden = kind !== 'error';
    }
    function received() {
        return new Date().toLocaleTimeString('en-GB', { timeZone: 'UTC', hour12: false }) + ' UTC';
    }
    async function json(url, signal) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (signal?.aborted) controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        const timeout = setTimeout(abort, 20000);
        try {
            const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
            if (!response.ok) {
                if (response.status === 429 || response.status === 403) throw new Error('NASA reception is limited. Wait before retrying; shared API limits or access restrictions may apply.');
                if (response.status === 404) throw new Error('This NASA record is not available.');
                throw new Error('NASA could not complete this request (HTTP ' + response.status + '). Try again later.');
            }
            return await response.json();
        } catch (error) {
            if (signal?.aborted) throw error;
            if (error.name === 'AbortError') throw new Error('NASA did not respond within 20 seconds. Retry when the connection is available.');
            if (error instanceof TypeError) throw new Error('The NASA connection is unavailable. Check your connection and retry.');
            if (error instanceof SyntaxError) throw new Error('NASA returned an unreadable response. Please retry later.');
            throw error;
        } finally {
            clearTimeout(timeout);
            signal?.removeEventListener('abort', abort);
        }
    }
    function unavailable(text) { return element('p', text, 'media-unavailable'); }
    function image(url, alt, className, onFailure, lazy = false) {
        const img = element('img', null, className);
        img.alt = alt;
        img.decoding = 'async';
        if (lazy) img.loading = 'lazy';
        img.addEventListener('error', () => {
            if (!img.isConnected) return;
            img.replaceWith(unavailable('Media unavailable. The source record remains accessible.'));
            onFailure?.();
        }, { once: true });
        img.src = url;
        return img;
    }
    function historyControls(loading) {
        $('previous-transmission').disabled = loading || selectedDate <= firstApodDate;
        $('next-transmission').disabled = loading || selectedDate >= today();
        $('current-transmission').disabled = loading || selectedDate === today();
        $('transmission-date').textContent = selectedDate + ' / UTC';
    }
    function shiftDate(amount) {
        const date = new Date(selectedDate + 'T12:00:00Z');
        date.setUTCDate(date.getUTCDate() + amount);
        const next = date.toISOString().slice(0, 10);
        if (next < firstApodDate || next > today()) return;
        selectedDate = next;
        loadApod();
    }
    function renderApod(record) {
        const content = $('apod-content');
        content.replaceChildren();
        const title = plain(record.title, 'Untitled NASA transmission');
        const source = safeUrl(record.permalink || record.url, true) || 'https://science.nasa.gov/apod/';
        const figure = element('figure', null, 'transmission-figure');
        const mediaType = plain(record.media_type, 'unknown').toLowerCase();
        const hd = safeUrl(record.hdurl);
        // The new API's url is an article permalink, not an image URL.
        if (mediaType === 'image' && hd) {
            let displayUrl = hd;
            const url = new URL(hd);
            if (url.hostname === 'assets.science.nasa.gov' && url.searchParams.has('w')) {
                url.searchParams.set('w', '1440');
                url.searchParams.set('h', '1440');
                url.searchParams.set('fit', 'clip');
                displayUrl = url.href;
            }
            figure.append(image(displayUrl, plain(record.alt, title), 'transmission-image', () => state('apod', 'Image unavailable. Open the NASA source or retry.', 'error')));
        } else {
            // Do not execute basic_html or automatically embed third-party players.
            figure.append(unavailable(mediaType === 'image' ? 'NASA did not supply an image for this record.' : 'This transmission contains ' + mediaType + ' media. View the presentation at NASA.'));
        }
        const caption = element('figcaption', null, 'transmission-caption');
        caption.append(element('span', plain(record.date, selectedDate) + ' / ' + mediaType, 'source-tag'));
        if (mediaType === 'image' && hd) caption.append(sourceLink('View high-resolution image ↗', hd));
        figure.append(caption);
        content.append(figure, element('h3', title, 'transmission-title'), element('p', plain(record.explanation, 'NASA did not supply an explanation for this transmission.'), 'transmission-description'));
        const credit = plain(record.credit, 'Credit not supplied by NASA');
        const copyright = plain(record.copyright, '');
        content.append(element('p', 'CREDIT / ' + credit, 'transmission-credit'));
        if (copyright) content.append(element('p', 'COPYRIGHT / ' + copyright, 'transmission-credit'));
        const links = element('div', null, 'transmission-links');
        links.append(sourceLink('Open NASA source ↗', source, true));
        content.append(links);
    }
    async function loadApod(force = false) {
        const version = ++apodVersion;
        const date = selectedDate;
        historyControls(true);
        state('apod', 'Acquiring transmission / ' + date, 'loading');
        $('apod-content').setAttribute('aria-busy', 'true');
        $('apod-content').replaceChildren(unavailable('Acquiring transmission from NASA…'));
        try {
            // NASA's current route uses YYMMDD; no legacy date/count parameters.
            let record = !force && transmissions.get(date);
            if (!record) {
                record = await json(APOD + '/' + date.replaceAll('-', '').slice(2));
                if (Array.isArray(record)) record = record[0];
                if (!record || typeof record !== 'object' || !('title' in record || 'media_type' in record || 'explanation' in record)) throw new Error('No transmission was returned for this date. It may not have been published yet.');
                if (record.date && record.date !== date) throw new Error('NASA returned a different date. Please retry this transmission later.');
                transmissions.set(date, record);
            }
            if (version !== apodVersion) return;
            renderApod(record);
            state('apod', 'Signal acquired / Last received ' + received());
        } catch (error) {
            if (version !== apodVersion) return;
            $('apod-content').replaceChildren(unavailable('Transmission unavailable. Object tracking and archive search remain independent.'));
            state('apod', error.message, 'error');
        } finally {
            if (version === apodVersion) {
                historyControls(false);
                $('apod-content').setAttribute('aria-busy', 'false');
            }
        }
    }
    function number(value, unit, digits = 1) {
        if (value == null || value === '') return 'Not supplied';
        const n = Number(value);
        return Number.isFinite(n) ? n.toLocaleString('en-GB', { maximumFractionDigits: digits }) + ' ' + unit : 'Not supplied';
    }
    function metric(list, label, value) {
        const group = element('div');
        group.append(element('dt', label), element('dd', value));
        list.append(group);
    }
    async function loadNeo() {
        const date = today();
        $('objects-date').textContent = date;
        state('neo', 'Resolving object tracks / ' + date, 'loading');
        $('neo-content').setAttribute('aria-busy', 'true');
        $('neo-retry').disabled = true;
        $('neo-content').replaceChildren();
        try {
            const url = new URL(NEO);
            url.search = new URLSearchParams({ start_date: date, end_date: date, api_key: 'DEMO_KEY' });
            const data = await json(url);
            if (!data.near_earth_objects || typeof data.near_earth_objects !== 'object') throw new Error('NASA did not supply a valid object feed. Retry later.');
            const objects = data.near_earth_objects[date] || [];
            if (!Array.isArray(objects)) throw new Error('NASA returned an unreadable object list.');
            objects.forEach((object, index) => {
                if (!object || typeof object !== 'object') return;
                const track = element('article', null, 'object-track');
                const identity = element('div');
                identity.append(element('span', 'OBJECT ' + String(index + 1).padStart(2, '0'), 'section-index'), element('h3', plain(object.name, 'Unnamed object'), 'track-name'), element('p', 'NASA/JPL ID / ' + plain(object.neo_reference_id || object.id), 'track-id'));
                const hazardous = object.is_potentially_hazardous_asteroid;
                identity.append(element('span', hazardous === true ? 'Potentially hazardous / NASA flag' : hazardous === false ? 'Monitored / Not flagged hazardous' : 'Classification not supplied', 'track-classification' + (hazardous === true ? ' potentially-hazardous' : '')));
                const approach = (Array.isArray(object.close_approach_data) ? object.close_approach_data : []).find(item => item.close_approach_date === date) || {};
                const metrics = element('dl', null, 'track-metrics');
                let passage = plain(approach.close_approach_date_full || approach.close_approach_date);
                if (Number.isFinite(approach.epoch_date_close_approach)) passage = new Date(approach.epoch_date_close_approach).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
                else if (approach.close_approach_date_full) passage += ' UTC';
                const diameter = object.estimated_diameter?.meters;
                const diameterText = diameter?.estimated_diameter_min != null && diameter?.estimated_diameter_max != null ? number(diameter.estimated_diameter_min, '', 0).trim() + '–' + number(diameter.estimated_diameter_max, 'm', 0) : 'Not supplied';
                metric(metrics, 'Passage', passage);
                metric(metrics, 'Miss distance', number(approach.miss_distance?.kilometers, 'km', 0));
                metric(metrics, 'Relative velocity', number(approach.relative_velocity?.kilometers_per_second, 'km/s', 2));
                metric(metrics, 'Est. diameter', diameterText);
                metric(metrics, 'Orbiting body', plain(approach.orbiting_body));
                const source = sourceLink('NASA / JPL record ↗', object.nasa_jpl_url, true);
                if (source) {
                    const group = element('div');
                    group.append(element('dt', 'Source'), element('dd'));
                    group.lastChild.append(source);
                    metrics.append(group);
                }
                track.append(identity, metrics);
                $('neo-content').append(track);
            });
            state('neo', objects.length ? objects.length + ' objects received / ' + received() : 'No close approaches returned for ' + date + '.');
        } catch (error) { state('neo', error.message, 'error'); }
        finally {
            $('neo-content').setAttribute('aria-busy', 'false');
            $('neo-retry').disabled = false;
        }
    }
    function libraryInfo(item) {
        const data = item?.data?.[0] || {};
        return {
            id: plain(data.nasa_id, ''), title: plain(data.title, 'Untitled NASA record'),
            description: plain(data.description || data.description_508, 'Description not supplied.'),
            date: plain(data.date_created, 'Date not supplied'), type: plain(data.media_type, 'image'),
            keywords: Array.isArray(data.keywords) ? data.keywords.map(keyword => plain(keyword, '')).filter(Boolean) : [],
            creator: plain(data.photographer || data.secondary_creator, ''), center: plain(data.center, ''),
            thumbnail: safeUrl(item?.links?.find(link => link.rel === 'preview' && link.render === 'image')?.href, true)
        };
    }
    function renderSearch(items) {
        const results = $('library-results');
        results.replaceChildren();
        items.slice(0, 12).forEach(item => {
            const record = libraryInfo(item);
            const article = element('article', null, 'library-result');
            const figure = element('figure');
            figure.append(record.thumbnail ? image(record.thumbnail, record.title, '', null, true) : element('span', 'No preview supplied', 'thumbnail-missing'));
            article.append(figure, element('p', record.type + ' / ' + record.id + ' / ' + record.date.slice(0, 10), 'record-meta'), element('h3', record.title), element('p', record.description, 'record-summary'));
            if (record.creator || record.center) article.append(element('p', [record.creator, record.center].filter(Boolean).join(' / '), 'record-meta'));
            if (record.keywords.length) article.append(element('p', record.keywords.slice(0, 5).join(' · '), 'record-tags'));
            const open = element('button', 'Open observation ↗');
            open.type = 'button';
            open.disabled = !record.id;
            open.addEventListener('click', () => openDetail(record));
            article.append(open);
            results.append(article);
        });
    }
    async function searchLibrary(query) {
        query = query.trim().slice(0, 120);
        if (!query) { $('archive-query').focus(); return; }
        lastQuery = query;
        $('archive-query').value = query;
        searchController?.abort();
        searchController = new AbortController();
        const version = ++searchVersion;
        state('library', 'Querying image archive / ' + query, 'loading');
        $('library-results').setAttribute('aria-busy', 'true');
        $('library-results').replaceChildren();
        try {
            const url = new URL(LIBRARY + '/search');
            url.search = new URLSearchParams({ q: query, media_type: 'image', page_size: '12', page: '1' });
            const data = await json(url, searchController.signal);
            if (version !== searchVersion) return;
            if (!Array.isArray(data.collection?.items)) throw new Error('NASA did not return a valid archive response.');
            const items = data.collection.items.slice(0, 12);
            renderSearch(items);
            state('library', items.length ? items.length + ' image records received / ' + received() : 'No image records found. Try another subject.');
        } catch (error) {
            if (version === searchVersion) state('library', error.message, 'error');
        } finally {
            if (version === searchVersion) $('library-results').setAttribute('aria-busy', 'false');
        }
    }
    function renderDetail(record, asset, metadata) {
        const content = $('detail-content');
        content.replaceChildren();
        const urls = (asset?.collection?.items || []).map(item => safeUrl(item.href, true)).filter(Boolean);
        const imageUrls = urls.filter(url => /\.(jpe?g|png|webp)(\?|$)/i.test(url));
        const larger = imageUrls.find(url => /~medium\./i.test(url)) || imageUrls.find(url => /~large\./i.test(url)) || imageUrls.find(url => /~small\./i.test(url));
        const fallback = record.thumbnail;
        if (larger || fallback) content.append(image(larger || fallback, record.title, 'detail-image', () => state('detail', 'Image asset unavailable. Metadata and NASA source remain accessible.', 'error')));
        else content.append(unavailable('No browser-readable image asset was supplied.'));
        const description = plain(metadata?.['AVAIL:Description'], record.description);
        content.append(element('p', description, 'detail-description'));
        const list = element('dl', null, 'detail-metadata');
        metric(list, 'NASA ID', record.id);
        metric(list, 'Date created', plain(metadata?.['AVAIL:DateCreated'], record.date));
        metric(list, 'Media type', record.type);
        metric(list, 'Center', plain(metadata?.['AVAIL:Center'], record.center || 'Not supplied'));
        metric(list, 'Photographer / creator', plain(metadata?.['AVAIL:Photographer'], record.creator || 'Not supplied'));
        const keywords = metadata?.['AVAIL:Keywords'];
        metric(list, 'Keywords', Array.isArray(keywords) ? keywords.map(value => plain(value)).join(' · ') : record.keywords.join(' · ') || 'Not supplied');
        content.append(list);
        const links = element('div', null, 'detail-links');
        links.append(sourceLink('Open NASA source ↗', 'https://images.nasa.gov/details/' + encodeURIComponent(record.id), true));
        const original = imageUrls.find(url => /~orig\./i.test(url));
        if (original) links.append(sourceLink('View original image ↗', original, true));
        content.append(links);
    }
    async function openDetail(record, force = false) {
        selectedRecord = record;
        detailController?.abort();
        detailController = new AbortController();
        const signal = detailController.signal;
        const version = ++detailVersion;
        $('detail-title').textContent = record.title;
        if (!$('record-dialog').open) $('record-dialog').showModal();
        $('close-detail').focus();
        state('detail', 'Resolving observation assets', 'loading');
        $('detail-content').setAttribute('aria-busy', 'true');
        // Search metadata remains useful even if optional detail requests fail.
        renderDetail(record);
        try {
            let result = !force && detailCache.get(record.id);
            if (!result) {
                const id = encodeURIComponent(record.id);
                const [asset, metadata] = await Promise.allSettled([
                    json(LIBRARY + '/asset/' + id, signal),
                    (async () => {
                        const response = await json(LIBRARY + '/metadata/' + id, signal);
                        const location = safeUrl(response.location, true);
                        if (!location) throw new Error('Metadata location unavailable.');
                        return json(location, signal);
                    })()
                ]);
                result = { asset: asset.status === 'fulfilled' ? asset.value : null, metadata: metadata.status === 'fulfilled' ? metadata.value : null, incomplete: asset.status === 'rejected' || metadata.status === 'rejected' };
                if (!result.incomplete) detailCache.set(record.id, result);
            }
            if (version !== detailVersion || !$('record-dialog').open) return;
            renderDetail(record, result.asset, result.metadata);
            state('detail', result.incomplete ? 'Some media or additional metadata could not be received. Search metadata is shown; you can retry.' : 'Observation resolved / Last received ' + received(), result.incomplete ? 'error' : 'ready');
        } catch (error) {
            if (version === detailVersion && $('record-dialog').open) state('detail', error.message, 'error');
        } finally {
            if (version === detailVersion) $('detail-content').setAttribute('aria-busy', 'false');
        }
    }

    $('previous-transmission').addEventListener('click', () => shiftDate(-1));
    $('next-transmission').addEventListener('click', () => shiftDate(1));
    $('current-transmission').addEventListener('click', () => { selectedDate = today(); loadApod(); });
    $('apod-retry').addEventListener('click', () => loadApod(true));
    $('neo-retry').addEventListener('click', loadNeo);
    $('archive-search').addEventListener('submit', event => { event.preventDefault(); searchLibrary($('archive-query').value); });
    document.querySelectorAll('[data-query]').forEach(button => button.addEventListener('click', () => searchLibrary(button.dataset.query)));
    $('library-retry').addEventListener('click', () => searchLibrary(lastQuery));
    $('close-detail').addEventListener('click', () => $('record-dialog').close());
    $('record-dialog').addEventListener('close', () => { ++detailVersion; detailController?.abort(); });
    $('detail-retry').addEventListener('click', () => { if (selectedRecord) openDetail(selectedRecord, true); });
    loadApod();
    loadNeo();
})();
