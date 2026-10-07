const OPEN_LIBRARY_SEARCH = "https://openlibrary.org/search.json";
const OPEN_LIBRARY_API = "https://openlibrary.org";
const RESULT_LIMIT = 20;
const SEARCH_FIELDS = [
    "key", "title", "author_name", "author_key", "first_publish_year", "edition_count",
    "cover_i", "isbn", "language", "subject", "publisher", "ia", "public_scan_b", "ebook_access",
];

const searchForm = document.getElementById("searchForm");
const searchMode = document.getElementById("searchMode");
const searchInput = document.getElementById("catalogQuery");
const searchButton = document.getElementById("searchButton");
const statusElement = document.getElementById("archiveStatus");
const statusText = document.getElementById("archiveStatusText");
const messageElement = document.getElementById("catalogMessage");
const errorElement = document.getElementById("catalogError");
const errorText = document.getElementById("catalogErrorText");
const recordList = document.getElementById("recordList");
const detailSection = document.getElementById("recordDetail");
const sortControl = document.getElementById("sortResults");
const coverFilter = document.getElementById("coverFilter");
const readableFilter = document.getElementById("readableFilter");

let results = [];
let lastQuery = "";
let lastMode = "general";
let searchController;
let requestSerial = 0;
let recordTrail = [];
let selectedRecord = null;

function setStatus(state, message) {
    statusElement.dataset.state = state;
    statusText.textContent = message;
}

function setError(message) {
    errorElement.hidden = !message;
    errorText.textContent = message || "";
}

function normalizeIsbn(value) {
    return String(value || "").replace(/[\s-]/g, "").toUpperCase();
}

function isValidIsbn(value) {
    const isbn = normalizeIsbn(value);
    if (/^\d{9}[\dX]$/.test(isbn)) {
        return [...isbn].reduce((sum, character, index) => {
            const digit = character === "X" ? 10 : Number(character);
            return sum + digit * (10 - index);
        }, 0) % 11 === 0;
    }
    if (/^\d{13}$/.test(isbn)) {
        const check = [...isbn.slice(0, 12)].reduce((sum, character, index) => sum + Number(character) * (index % 2 ? 3 : 1), 0);
        return (10 - (check % 10)) % 10 === Number(isbn[12]);
    }
    return false;
}

function coverUrl(coverId, size = "M") {
    return Number.isInteger(Number(coverId))
        ? `https://covers.openlibrary.org/b/id/${encodeURIComponent(coverId)}-${size}.jpg?default=false`
        : "";
}

function unique(values, limit = 4) {
    return [...new Set((values || []).filter(value => typeof value === "string" && value.trim()).map(value => value.trim()))].slice(0, limit);
}

function normalizeEdition(edition) {
    const workKey = edition.works?.[0]?.key;
    return {
        key: workKey || edition.key,
        title: edition.title || "Untitled record",
        author_name: (edition.authors || []).map(author => author.name).filter(Boolean),
        author_key: (edition.authors || []).map(author => author.key?.split("/").pop()).filter(Boolean),
        first_publish_year: Number.parseInt(edition.publish_date, 10) || undefined,
        edition_count: 1,
        cover_i: edition.covers?.[0],
        isbn: [...(edition.isbn_13 || []), ...(edition.isbn_10 || [])],
        language: (edition.languages || []).map(language => language.key?.split("/").pop()).filter(Boolean),
        subject: edition.subjects || [],
        publisher: edition.publishers || [],
        public_scan_b: edition.public_scan_b,
        ebook_access: edition.ebook_access,
        _editionKey: edition.key,
    };
}

function buildSearchUrl(query, mode) {
    const params = new URLSearchParams({
        fields: SEARCH_FIELDS.join(","),
        limit: String(RESULT_LIMIT),
    });
    if (mode === "title") params.set("title", query);
    else if (mode === "author") params.set("author", query);
    else if (mode === "isbn") params.set("isbn", normalizeIsbn(query));
    else if (mode === "subject") params.set("q", `subject:"${query}"`);
    else params.set("q", query);
    return `${OPEN_LIBRARY_SEARCH}?${params}`;
}

async function fetchJson(url, signal) {
    const response = await fetch(url, {
        headers: { Accept: "application/json" },
        credentials: "omit",
        signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const error = new Error(`Open Library returned ${response.status}.`);
        error.status = response.status;
        throw error;
    }
    if (!data) throw new Error("Open Library returned an unreadable response.");
    return data;
}

async function searchRecords(query, mode, signal) {
    let edition;
    if (mode === "isbn") {
        const isbn = normalizeIsbn(query);
        if (!isValidIsbn(isbn)) throw new Error("Enter a valid ISBN-10 or ISBN-13. Spaces and hyphens are allowed.");
        try {
            edition = await fetchJson(`${OPEN_LIBRARY_API}/isbn/${encodeURIComponent(isbn)}.json`, signal);
        } catch (error) {
            if (error.status !== 404) throw error;
        }
    }

    const data = await fetchJson(buildSearchUrl(query, mode), signal);
    let docs = Array.isArray(data.docs) ? data.docs : [];
    if (!docs.length && edition) docs = [normalizeEdition(edition)];
    if (!Array.isArray(data.docs) && !edition) throw new Error("Open Library returned an incomplete search response.");
    return docs.slice(0, RESULT_LIMIT);
}

function statusForRecord(record) {
    if (record.public_scan_b === true) return "PUBLIC SCAN AVAILABLE";
    if (record.ebook_access === "public") return "PUBLIC EBOOK ACCESS";
    if (record.ebook_access === "borrowable") return "BORROWABLE ACCESS";
    return "OPEN LIBRARY RECORD ONLY";
}

function appendText(parent, tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
}

function setImage(image, placeholder, url, alt) {
    placeholder.hidden = false;
    image.hidden = true;
    image.removeAttribute("src");
    if (!url) return;
    image.onload = () => { image.hidden = false; placeholder.hidden = true; };
    image.onerror = () => { image.hidden = true; placeholder.hidden = false; };
    image.alt = alt;
    image.src = url;
}

function createCoverCell(record) {
    const wrapper = document.createElement("span");
    wrapper.className = "record-cover";
    const image = document.createElement("img");
    image.alt = "";
    image.loading = "lazy";
    const fallback = document.createElement("span");
    fallback.className = "record-cover-empty";
    fallback.textContent = "404";
    wrapper.append(image, fallback);
    setImage(image, fallback, coverUrl(record.cover_i, "M"), `${record.title || "Book"} cover`);
    return wrapper;
}

function createAuthorButton(name, key) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "author-link";
    button.textContent = name;
    button.disabled = !key;
    if (key) button.addEventListener("click", () => loadAuthor(key, name));
    return button;
}

function availabilityFor(record) {
    if (record.public_scan_b === true) return "PUBLIC SCAN";
    if (record.ebook_access === "public") return "EBOOK ACCESS";
    if (record.ebook_access === "borrowable") return "BORROWABLE";
    return "CATALOG ONLY";
}

function createResultRow(record, index) {
    const item = document.createElement("li");
    item.className = "record-row";
    item.dataset.recordIndex = String(index);
    item.dataset.hasCover = String(Boolean(record.cover_i));
    item.dataset.readable = String(record.public_scan_b === true || ["public", "borrowable"].includes(record.ebook_access));

    const rank = appendText(item, "span", "record-rank", String(index + 1).padStart(2, "0"));
    const cover = createCoverCell(record);
    const body = document.createElement("div");
    body.className = "record-row-body";

    const identity = document.createElement("div");
    identity.className = "record-row-identity";
    const open = document.createElement("button");
    open.className = "record-title-button";
    open.type = "button";
    open.textContent = record.title || "Untitled record";
    open.addEventListener("click", () => loadWork(record, index + 1));
    identity.append(open);
    const authorNames = unique(record.author_name, 3);
    const authorKeys = record.author_key || [];
    if (authorNames.length) {
        const authorLine = document.createElement("div");
        authorLine.className = "record-authors";
        authorNames.forEach((name, authorIndex) => {
            if (authorIndex) appendText(authorLine, "span", "author-separator", "·");
            authorLine.append(createAuthorButton(name, authorKeys[authorIndex]));
        });
        identity.append(authorLine);
    } else {
        appendText(identity, "span", "record-authors record-authors--missing", "AUTHOR NOT INDEXED");
    }
    body.append(identity);

    const facts = document.createElement("div");
    facts.className = "record-facts";
    appendText(facts, "span", "record-year", record.first_publish_year ? `FIRST PUB. ${record.first_publish_year}` : "YEAR UNKNOWN");
    appendText(facts, "span", "record-editions", `${Number.isFinite(record.edition_count) ? record.edition_count : "—"} EDITIONS`);
    appendText(facts, "span", "record-availability", availabilityFor(record));
    if (record.isbn?.[0]) appendText(facts, "span", "record-isbn", `ISBN ${record.isbn[0]}`);
    if (record.language?.[0]) appendText(facts, "span", "record-language", record.language.slice(0, 2).join(", ").toUpperCase());
    body.append(facts);

    const subjects = unique(record.subject, 3);
    if (subjects.length) {
        const tags = document.createElement("div");
        tags.className = "record-subjects";
        subjects.forEach(subject => appendText(tags, "span", "subject-tag", subject));
        body.append(tags);
    }

    const external = document.createElement("a");
    external.className = "record-open-link";
    external.href = `${OPEN_LIBRARY_API}${record.key || record._editionKey || ""}`;
    external.target = "_blank";
    external.rel = "noopener noreferrer";
    external.textContent = "OPEN FILE ↗";
    item.append(rank, cover, body, external);
    return item;
}

function applyResultControls() {
    const sort = sortControl.value;
    let filtered = results.filter(record => !coverFilter.checked || record.cover_i);
    filtered = filtered.filter(record => !readableFilter.checked || record.public_scan_b === true || ["public", "borrowable"].includes(record.ebook_access));
    if (sort === "oldest") filtered.sort((left, right) => (left.first_publish_year || Infinity) - (right.first_publish_year || Infinity));
    if (sort === "newest") filtered.sort((left, right) => (right.first_publish_year || -Infinity) - (left.first_publish_year || -Infinity));
    recordList.replaceChildren(...filtered.map((record, index) => createResultRow(record, index)));
    document.getElementById("resultCount").textContent = `${filtered.length} / ${results.length} FILES`;
    if (!filtered.length) {
        const empty = document.createElement("li");
        empty.className = "record-empty";
        empty.textContent = results.length ? "NO RECORDS MATCH THESE FILTERS" : "NO FILES RETRIEVED";
        recordList.append(empty);
    }
}

function requestUrlWithSignal(url, signal) {
    return fetch(url, { headers: { Accept: "application/json" }, credentials: "omit", signal }).then(async response => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(`Open Library returned ${response.status}.`);
        if (!data) throw new Error("Open Library returned an unreadable record.");
        return data;
    });
}

function buildWorkUrl(record) {
    const key = record.key || record.work_key;
    if (!key) return "";
    if (key.startsWith("/works/")) return `${OPEN_LIBRARY_API}${key}.json`;
    if (key.startsWith("/books/")) return `${OPEN_LIBRARY_API}${key}.json`;
    return "";
}

function formatDescription(value) {
    if (typeof value === "string") return value;
    if (value && typeof value.value === "string") return value.value;
    return "No longer description is available for this work.";
}

function renderWorkSubjects(work) {
    const container = document.getElementById("detailSubjects");
    container.replaceChildren();
    const categories = [
        ["SUBJECTS", work.subjects],
        ["PLACES", work.subject_places],
        ["PEOPLE", work.subject_people],
        ["TIMES", work.subject_times],
    ];
    categories.forEach(([label, values]) => {
        const list = unique(values, 8);
        if (!list.length) return;
        const group = document.createElement("div");
        group.className = "detail-subject-group";
        appendText(group, "span", "detail-subject-label", label);
        const tags = document.createElement("div");
        tags.className = "detail-subject-tags";
        list.forEach(value => appendText(tags, "span", "subject-tag", value));
        group.append(tags);
        container.append(group);
    });
}

function renderIdentifiers(record) {
    const container = document.getElementById("identifierList");
    container.replaceChildren();
    appendText(container, "span", "identifier-label", "IDENTIFIERS");
    const ids = unique(record.isbn, 3);
    if (ids.length) ids.forEach(isbn => appendText(container, "span", "identifier-value", `ISBN ${isbn}`));
    else appendText(container, "span", "identifier-value", "No ISBN indexed for this work.");
}

async function loadWork(record, resultIndex) {
    selectedRecord = record;
    const requestId = ++requestSerial;
    searchController?.abort();
    const controller = new AbortController();
    searchController = controller;
    const { signal } = controller;
    const workUrl = buildWorkUrl(record);
    detailSection.hidden = false;
    document.getElementById("authorFile").hidden = true;
    document.getElementById("detailTitle").textContent = record.title || "Untitled record";
    document.getElementById("workDescription").textContent = "Resolving deeper work record...";
    document.getElementById("detailKey").textContent = `RETRIEVED RECORD // ${String(resultIndex).padStart(2, "0")}`;
    document.getElementById("availabilityState").textContent = statusForRecord(record);
    document.getElementById("openLibraryLink").href = `${OPEN_LIBRARY_API}${record.key || record._editionKey || ""}`;
    renderIdentifiers(record);
    renderWorkSubjects({});
    document.getElementById("workLinks").replaceChildren();
    setImage(document.getElementById("detailCover"), document.getElementById("detailCoverPlaceholder"), coverUrl(record.cover_i, "L"), `${record.title || "Book"} cover`);
    updateRecordTrail(record.title || "Untitled record");

    if (!workUrl) {
        document.getElementById("workDescription").textContent = "No work-level record was indexed. The edition record remains available.";
        recordList.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
    }

    try {
        const work = await requestUrlWithSignal(workUrl, signal);
        if (requestId !== requestSerial) return;
        document.getElementById("workDescription").textContent = formatDescription(work.description);
        renderWorkSubjects(work);
        const links = (work.links || []).filter(link => {
            if (typeof link.url !== "string") return false;
            try {
                const url = new URL(link.url);
                return url.protocol === "http:" || url.protocol === "https:";
            } catch {
                return false;
            }
        }).slice(0, 4);
        links.forEach(link => {
            const anchor = document.createElement("a");
            anchor.href = link.url;
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
            anchor.textContent = link.title || link.url;
            document.getElementById("workLinks").append(anchor);
        });
    } catch {
        if (signal.aborted || requestId !== requestSerial) return;
        document.getElementById("workDescription").textContent = "The deeper work file is unavailable. Search metadata remains intact.";
    }
    recordList.scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateRecordTrail(title) {
    recordTrail = recordTrail.filter(entry => entry !== title);
    recordTrail.push(title);
    recordTrail = recordTrail.slice(-6);
    const container = document.getElementById("recordTrail");
    container.hidden = recordTrail.length < 2;
    container.replaceChildren();
    appendText(container, "span", "trail-label", "RECORD TRAIL");
    recordTrail.forEach((entry, index) => {
        if (index) appendText(container, "span", "trail-divider", "→");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = entry;
        button.addEventListener("click", () => {
            const record = results.find(result => result.title === entry);
            if (record) loadWork(record, results.indexOf(record) + 1);
        });
        container.append(button);
    });
}

async function loadAuthor(authorId, authorName = "Author") {
    if (!authorId) return;
    const panel = document.getElementById("authorFile");
    const key = authorId.startsWith("/authors/") ? authorId : `/authors/${authorId}`;
    detailSection.hidden = false;
    if (!selectedRecord) {
        document.getElementById("detailKey").textContent = "AUTHOR RECORD // DIRECT LOOKUP";
        document.getElementById("detailTitle").textContent = authorName;
        document.getElementById("availabilityState").textContent = "OPEN LIBRARY AUTHOR FILE";
        document.getElementById("workDescription").textContent = "Author record retrieved from the public catalog.";
        document.getElementById("openLibraryLink").href = `${OPEN_LIBRARY_API}${key}`;
        document.getElementById("detailSubjects").replaceChildren();
        document.getElementById("identifierList").replaceChildren();
        document.getElementById("workLinks").replaceChildren();
    }
    panel.hidden = false;
    document.getElementById("authorFileTitle").textContent = "Resolving author file...";
    document.getElementById("authorBio").textContent = "";
    const url = `${OPEN_LIBRARY_API}${key}.json`;
    try {
        const author = await requestUrlWithSignal(url, new AbortController().signal);
        document.getElementById("authorFileTitle").textContent = author.name || "Author name unavailable";
        document.getElementById("authorFileKey").textContent = key.toUpperCase();
        document.getElementById("authorBio").textContent = formatDescription(author.bio);
        const meta = document.getElementById("authorMeta");
        meta.replaceChildren();
        if (author.birth_date) appendText(meta, "span", "author-fact", `BORN ${author.birth_date}`);
        if (author.death_date) appendText(meta, "span", "author-fact", `DIED ${author.death_date}`);
        if (author.top_work) appendText(meta, "span", "author-fact", `TOP WORK ${author.top_work}`);
        const link = document.createElement("a");
        link.href = `${OPEN_LIBRARY_API}${key}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open author record ↗";
        meta.append(link);
        panel.scrollIntoView({ behavior: "smooth", block: "center" });
        panel.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
        document.getElementById("authorFileTitle").textContent = "Author file unavailable";
        document.getElementById("authorBio").textContent = "The work record remains available; Open Library did not return this author file.";
    }
}

function showSearchError(message) {
    errorElement.hidden = false;
    errorText.textContent = message;
    setStatus("error", "QUERY UNRESOLVED");
}

async function runSearch(query = searchInput.value, mode = searchMode.value) {
    const cleanQuery = String(query || "").trim();
    if (!cleanQuery) {
        searchInput.focus();
        return;
    }
    const requestId = ++requestSerial;
    searchController?.abort();
    const controller = new AbortController();
    searchController = controller;
    const { signal } = controller;
    lastQuery = cleanQuery;
    lastMode = mode;
    searchInput.value = cleanQuery;
    searchMode.value = mode;
    searchButton.disabled = true;
    errorElement.hidden = true;
    errorText.textContent = "";
    messageElement.hidden = true;
    recordList.setAttribute("aria-busy", "true");
    detailSection.hidden = true;
    document.getElementById("authorFile").hidden = true;
    selectedRecord = null;
    results = [];
    applyResultControls();
    setStatus("loading", "QUERYING OPEN LIBRARY");
    recordList.replaceChildren();
    const loading = document.createElement("li");
    loading.className = "record-empty record-empty--loading";
    loading.textContent = "QUERYING CATALOG / RETRIEVING RECORDS...";
    recordList.append(loading);

    try {
        if (mode === "isbn" && !isValidIsbn(cleanQuery)) throw new Error("Enter a valid ISBN-10 or ISBN-13. Spaces and hyphens are allowed.");
        const found = await searchRecords(cleanQuery, mode, signal);
        if (requestId !== requestSerial) return;
        results = found;
        recordList.setAttribute("aria-busy", "false");
        if (!found.length) {
            applyResultControls();
            setStatus("ready", "QUERY COMPLETE // 0 RECORDS");
            messageElement.hidden = false;
            messageElement.textContent = "No records matched this query. Adjust the terms or choose another search mode.";
            return;
        }
        applyResultControls();
        setStatus("ready", "QUERY COMPLETE");
        document.getElementById("resultCount").scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
        if (signal.aborted || requestId !== requestSerial) return;
        recordList.setAttribute("aria-busy", "false");
        applyResultControls();
        const message = error.name === "AbortError"
            ? "The catalog query timed out. Retry when the archive responds."
            : error instanceof TypeError
                ? "Open Library could not be reached. Check your connection and retry."
                : error.message || "The catalog query failed. Retry the request.";
        showSearchError(message);
    } finally {
        if (requestId === requestSerial) searchButton.disabled = false;
    }
}

searchForm.addEventListener("submit", event => {
    event.preventDefault();
    runSearch();
});

document.querySelectorAll("[data-query]").forEach(button => {
    button.addEventListener("click", () => runSearch(button.dataset.query, button.dataset.mode));
});

sortControl.addEventListener("change", applyResultControls);
coverFilter.addEventListener("change", applyResultControls);
readableFilter.addEventListener("change", applyResultControls);
document.getElementById("closeDetail").addEventListener("click", () => { detailSection.hidden = true; });
document.getElementById("retrySearch").addEventListener("click", () => runSearch(lastQuery, lastMode));