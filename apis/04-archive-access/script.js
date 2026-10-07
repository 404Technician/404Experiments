const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
const RELATED_LIMIT = 8;
const VISUAL_LIMIT = 6;
const SEARCH_LIMIT = 5;
const GENERIC_LINKS = new Set([
    "references", "external links", "notes", "further reading", "bibliography", "sources",
    "help", "wikipedia", "commons", "portal", "category", "isbn", "doi", "issn",
]);

const searchForm = document.getElementById("archiveSearchForm");
const queryInput = document.getElementById("archiveQuery");
const searchButton = document.getElementById("searchButton");
const statusElement = document.getElementById("archiveStatus");
const statusText = document.getElementById("archiveStatusText");
const progressElement = document.getElementById("archiveProgress");
const progressText = document.getElementById("archiveProgressText");
const errorElement = document.getElementById("archiveError");
const errorText = document.getElementById("archiveErrorText");
const retryButton = document.getElementById("retrySearch");
const possibleRecords = document.getElementById("possibleRecords");
const recordOptions = document.getElementById("recordOptions");
const dossier = document.getElementById("dossier");
const primaryImage = document.getElementById("primaryImage");
const primaryImagePlaceholder = document.getElementById("primaryImagePlaceholder");
const visualArchive = document.getElementById("visualArchive");
const relatedRecords = document.getElementById("relatedRecords");
const trail = document.getElementById("archiveTrail");
const trailItems = document.getElementById("archiveTrailItems");
const backButton = document.getElementById("backDossier");

let requestController;
let requestSerial = 0;
let lastQuery = "";
let searchResults = [];
let trailEntries = [];
let currentTitle = "";

function setStatus(state, message) {
    statusElement.dataset.state = state;
    statusText.textContent = message;
}

function setProgress(message) {
    progressElement.hidden = !message;
    progressText.textContent = message || "";
}

function setError(message) {
    errorElement.hidden = !message;
    errorText.textContent = message || "";
}

function requestUrl(parameters) {
    const params = new URLSearchParams({ ...parameters, format: "json", formatversion: "2", origin: "*" });
    return `${WIKIPEDIA_API}?${params}`;
}

async function fetchApi(parameters, signal) {
    const response = await fetch(requestUrl(parameters), {
        headers: { Accept: "application/json" },
        credentials: "omit",
        signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Wikipedia returned ${response.status}.`);
    if (!data) throw new Error("Wikipedia returned an unreadable response.");
    if (data.error) throw new Error(data.error.info || "Wikipedia could not complete the request.");
    return data;
}

function cleanText(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function shortDescription(extract) {
    const text = cleanText(extract);
    if (!text) return "No short description is available for this record.";
    const firstSentence = text.match(/^.{40,230}?[.!?](?=\s|$)/);
    if (firstSentence) return firstSentence[0];
    return text.length > 190 ? `${text.slice(0, 187).trimEnd()}...` : text;
}

function articleUrl(page) {
    return page.canonicalurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
}

function formatRetrievedTime() {
    return new Intl.DateTimeFormat("en", {
        year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).format(new Date());
}

function setExternalLink(id, url) {
    const link = document.getElementById(id);
    link.href = url;
}

function setPrimaryImage(url, title) {
    if (!url) {
        primaryImage.hidden = true;
        primaryImage.removeAttribute("src");
        primaryImagePlaceholder.hidden = false;
        return;
    }

    primaryImage.hidden = false;
    primaryImage.alt = `${title} — lead image`;
    primaryImage.onload = () => { primaryImagePlaceholder.hidden = true; };
    primaryImage.onerror = () => {
        primaryImage.hidden = true;
        primaryImagePlaceholder.hidden = false;
    };
    primaryImage.src = url;
}

function showSectionEmpty(parent, message) {
    const empty = document.createElement("p");
    empty.className = "section-empty";
    empty.textContent = message;
    parent.replaceChildren(empty);
}

function filterRelatedLinks(links, selectedTitle) {
    const seen = new Set([selectedTitle.toLowerCase()]);
    return (links || []).filter(link => {
        const title = cleanText(link.title);
        const normalized = title.toLowerCase();
        if (!title || link.ns !== 0 || GENERIC_LINKS.has(normalized) || seen.has(normalized)) return false;
        if (/^\d{2,4}s?$/.test(title) || /^(?:isbn|doi|issn)\s/i.test(title)) return false;
        seen.add(normalized);
        return true;
    }).slice(0, RELATED_LIMIT);
}

function renderRelatedRecords(links) {
    const records = filterRelatedLinks(links, currentTitle);
    document.getElementById("relatedCount").textContent = `${records.length} LINKS RESOLVED`;
    document.getElementById("metadataRelatedCount").textContent = String(records.length);
    if (!records.length) {
        showSectionEmpty(relatedRecords, "No related article links were available for this record.");
        return 0;
    }

    const cards = records.map((record, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "related-record";
        button.dataset.query = record.title;
        const ordinal = document.createElement("span");
        ordinal.className = "related-ordinal";
        ordinal.textContent = String(index + 1).padStart(2, "0");
        const title = document.createElement("span");
        title.className = "related-title";
        title.textContent = record.title;
        const arrow = document.createElement("span");
        arrow.className = "related-arrow";
        arrow.textContent = "↗";
        button.append(ordinal, title, arrow);
        button.addEventListener("click", () => submitSearch(record.title));
        return button;
    });
    relatedRecords.replaceChildren(...cards);
    return records.length;
}

function imageFileAllowed(image) {
    const title = (image.title || "").toLowerCase();
    return /\.(?:jpe?g|png|webp|gif|tiff?)$/.test(title) && !/(?:icon|logo|symbol|flag|commons-logo)/.test(title);
}

function renderVisualArchive(images, leadUrl, title) {
    const leadWithoutQuery = leadUrl?.split("?")[0];
    const selected = (images || []).map(page => ({
        title: page.title,
        ...page.imageinfo?.[0],
    })).filter(image => {
        const imageUrl = image.thumburl || image.url;
        return imageFileAllowed(image) && imageUrl && imageUrl.split("?")[0] !== leadWithoutQuery;
    }).slice(0, VISUAL_LIMIT);

    document.getElementById("visualCount").textContent = `${selected.length} FRAGMENTS`;
    if (!selected.length) {
        showSectionEmpty(visualArchive, "No additional visual fragments were recovered from this record.");
        return;
    }

    const figures = selected.map(image => {
        const figure = document.createElement("figure");
        figure.className = "visual-fragment";
        const img = document.createElement("img");
        img.src = image.thumburl || image.url;
        img.alt = `${title}: ${image.title?.replace(/^File:/, "") || "archival image"}`;
        img.loading = "lazy";
        img.onerror = () => figure.remove();
        const caption = document.createElement("figcaption");
        caption.textContent = (image.title || "Wikimedia image").replace(/^File:/, "").replace(/_/g, " ");
        figure.append(img, caption);
        return figure;
    });
    visualArchive.replaceChildren(...figures);
}

function renderSearchCandidates(results, selectedTitle) {
    searchResults = results;
    const alternatives = results.filter(result => result.title !== selectedTitle).slice(0, SEARCH_LIMIT - 1);
    possibleRecords.hidden = alternatives.length === 0;
    if (!alternatives.length) return;

    const buttons = alternatives.map(result => {
        const button = document.createElement("button");
        button.className = "record-option";
        button.type = "button";
        button.dataset.title = result.title;
        const title = document.createElement("span");
        title.textContent = result.title;
        const hint = document.createElement("small");
        hint.textContent = `PAGE ${result.pageid}`;
        button.append(title, hint);
        button.addEventListener("click", () => assembleDossier(result.title, true));
        return button;
    });
    recordOptions.replaceChildren(...buttons);
}

function updateTrail(title, fromTrail = false) {
    if (!fromTrail && trailEntries[trailEntries.length - 1] !== title) trailEntries.push(title);
    trailEntries = trailEntries.slice(-6);
    trail.hidden = trailEntries.length === 0;
    backButton.disabled = trailEntries.length < 2;
    trailItems.replaceChildren();
    trailEntries.forEach((entry, index) => {
        if (index) {
            const separator = document.createElement("span");
            separator.className = "trail-arrow";
            separator.textContent = "→";
            trailItems.append(separator);
        }
        const crumb = document.createElement("button");
        crumb.type = "button";
        crumb.textContent = entry;
        crumb.addEventListener("click", () => openTrailEntry(index));
        trailItems.append(crumb);
    });
}

async function openTrailEntry(index) {
    if (index < 0 || index >= trailEntries.length) return;
    const title = trailEntries[index];
    trailEntries = trailEntries.slice(0, index + 1);
    await assembleDossier(title, false, true);
}

async function resolveSearch(query, signal) {
    const data = await fetchApi({
        action: "query",
        list: "search",
        srsearch: query,
        srlimit: String(SEARCH_LIMIT),
        srnamespace: "0",
    }, signal);
    const results = data.query?.search;
    if (!Array.isArray(results)) throw new Error("Wikipedia returned an incomplete search response.");
    return results;
}

async function fetchArticle(title, signal) {
    const data = await fetchApi({
        action: "query",
        prop: "extracts|pageimages|info",
        exintro: "1",
        explaintext: "1",
        exchars: "1600",
        piprop: "thumbnail|original",
        pithumbsize: "1200",
        inprop: "url",
        titles: title,
    }, signal);
    const page = data.query?.pages?.[0];
    if (!page || page.missing !== undefined) throw new Error(`No English Wikipedia article was found for “${title}”.`);
    return page;
}

async function fetchRelatedLinks(title, signal) {
    const data = await fetchApi({
        action: "query",
        prop: "links",
        plnamespace: "0",
        pllimit: "40",
        titles: title,
    }, signal);
    return data.query?.pages?.[0]?.links || [];
}

async function fetchVisuals(title, signal) {
    const data = await fetchApi({
        action: "query",
        generator: "images",
        titles: title,
        gimlimit: String(VISUAL_LIMIT + 3),
        prop: "imageinfo",
        iiprop: "url",
        iiurlwidth: "900",
    }, signal);
    return data.query?.pages || [];
}

function renderArticle(page, links, images, requestedTitle, fromTrail) {
    const title = cleanText(page.title) || requestedTitle;
    const extract = cleanText(page.extract);
    const canonical = articleUrl(page);
    const leadImage = page.original?.source || page.thumbnail?.source || "";
    currentTitle = title;

    document.getElementById("recordId").textContent = `A-${String(page.pageid || 0).padStart(4, "0")}`;
    document.getElementById("dossierTitle").textContent = title;
    document.getElementById("dossierDescription").textContent = shortDescription(extract);
    document.getElementById("summaryText").textContent = extract || "No introductory extract was available for this record.";
    document.getElementById("pageId").textContent = page.pageid ? String(page.pageid) : "Not available";
    document.getElementById("retrievedAt").textContent = formatRetrievedTime();
    setExternalLink("canonicalLink", canonical);
    setExternalLink("metadataCanonical", canonical);
    setExternalLink("externalWikipedia", canonical);
    setExternalLink("externalCommons", `https://commons.wikimedia.org/wiki/Special:MediaSearch?type=image&search=${encodeURIComponent(title)}`);
    setPrimaryImage(leadImage, title);
    renderRelatedRecords(links);
    renderVisualArchive(images, leadImage, title);
    dossier.hidden = false;
    updateTrail(title, fromTrail);
    document.getElementById("sourceState").textContent = extract ? "RECONSTRUCTED" : "PARTIAL RECORD";
}

async function assembleDossier(title, fromResult = false, fromTrail = false) {
    const requestId = ++requestSerial;
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    const { signal } = controller;
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    lastQuery = title;
    searchButton.disabled = true;
    queryInput.value = title;
    setError("");
    setStatus("loading", "ASSEMBLING DOSSIER");
    setProgress("RESOLVING RECORD");
    possibleRecords.hidden = true;
    dossier.hidden = true;

    try {
        const [articleResult, relatedResult, visualResult] = await Promise.allSettled([
            fetchArticle(title, signal),
            fetchRelatedLinks(title, signal),
            fetchVisuals(title, signal),
        ]);
        if (requestId !== requestSerial) return;
        if (articleResult.status === "rejected") throw articleResult.reason;

        const page = articleResult.value;
        const links = relatedResult.status === "fulfilled" ? relatedResult.value : [];
        const images = visualResult.status === "fulfilled" ? visualResult.value : [];
        renderArticle(page, links, images, title, fromTrail);
        setStatus("ready", "DOSSIER RECONSTRUCTED // WIKIMEDIA EN");
        setProgress("");
        if (relatedResult.status === "rejected") {
            document.getElementById("relatedCount").textContent = "LINK FEED UNAVAILABLE";
        }
        if (visualResult.status === "rejected") {
            document.getElementById("visualCount").textContent = "VISUAL FEED UNAVAILABLE";
        }
        if (fromResult && searchResults.length > 1) renderSearchCandidates(searchResults, title);
    } catch (error) {
        if (signal.aborted || requestId !== requestSerial) return;
        setStatus("error", "ARCHIVE QUERY FAILED");
        setProgress("");
        const message = error.name === "AbortError"
            ? "The dossier request timed out. Retry the query."
            : error.name === "TypeError"
                ? "Wikipedia could not be reached. Check your connection and retry the query."
                : error.message || "The dossier could not be assembled. Retry the query.";
        setError(message);
    } finally {
        window.clearTimeout(timeout);
        if (requestId === requestSerial) searchButton.disabled = false;
    }
}

async function submitSearch(value = queryInput.value) {
    const query = cleanText(value);
    if (!query) {
        queryInput.focus();
        return;
    }

    const requestId = ++requestSerial;
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    const { signal } = controller;
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    lastQuery = query;
    searchButton.disabled = true;
    queryInput.value = query;
    setError("");
    setStatus("loading", "QUERYING ARCHIVE");
    setProgress("QUERYING ARCHIVE");
    possibleRecords.hidden = true;
    dossier.hidden = true;

    try {
        const results = await resolveSearch(query, signal);
        if (requestId !== requestSerial) return;
        if (!results.length) throw new Error(`No records matched “${query}”. Try another subject.`);
        searchResults = results;
        const strongest = results[0];
        renderSearchCandidates(results, strongest.title);
        setProgress("ASSEMBLING DOSSIER");
        await assembleDossier(strongest.title, true);
    } catch (error) {
        if (signal.aborted || requestId !== requestSerial) return;
        setStatus("error", "ARCHIVE QUERY FAILED");
        setProgress("");
        const message = error.name === "AbortError"
            ? "The archive search timed out. Retry or search another subject."
            : error.name === "TypeError"
                ? "Wikipedia could not be reached. Check your connection and retry the query."
                : error.message || "The archive could not resolve this query. Retry or search another subject.";
        setError(message);
        possibleRecords.hidden = true;
    } finally {
        window.clearTimeout(timeout);
        if (requestId === requestSerial) searchButton.disabled = false;
    }
}

searchForm.addEventListener("submit", event => {
    event.preventDefault();
    submitSearch();
});

document.querySelectorAll("[data-query]").forEach(button => {
    button.addEventListener("click", () => submitSearch(button.dataset.query));
});

retryButton.addEventListener("click", () => submitSearch(lastQuery));
backButton.addEventListener("click", () => openTrailEntry(trailEntries.length - 2));