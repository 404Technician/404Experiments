const HN_API_BASE = "https://hacker-news.firebaseio.com/v0";
const STORY_LIMIT = 20;
const FEEDS = {
    top: { endpoint: "topstories", label: "Top stories" },
    new: { endpoint: "newstories", label: "New stories" },
    best: { endpoint: "beststories", label: "Best stories" },
    ask: { endpoint: "askstories", label: "Ask HN" },
    show: { endpoint: "showstories", label: "Show HN" },
    jobs: { endpoint: "jobstories", label: "Jobs" },
};

const statusElement = document.getElementById("hnStatus");
const statusText = document.getElementById("hnStatusText");
const errorElement = document.getElementById("hnError");
const refreshButton = document.getElementById("hnRefresh");
const storyList = document.getElementById("hnStoryList");
const feedHeading = document.getElementById("feedHeading");
const itemCount = document.getElementById("hnItemCount");
const updatedLabel = document.getElementById("hnUpdated");

let activeFeed = "top";
let activeRequest = 0;
let requestController;

function setStatus(state, message) {
    statusElement.dataset.state = state;
    statusText.textContent = message;
}

function setError(message) {
    errorElement.textContent = message;
    errorElement.hidden = !message;
}

async function fetchJson(url, signal) {
    const response = await fetch(url, {
        headers: { Accept: "application/json" },
        credentials: "omit",
        signal,
    });
    if (!response.ok) throw new Error(`The public feed returned ${response.status}.`);
    return response.json();
}

function storyAge(timestamp) {
    const seconds = Number(timestamp);
    if (!Number.isFinite(seconds) || seconds <= 0) return "age unavailable";
    const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
    if (elapsed < 60) return "just now";
    if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
    if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h ago`;
    if (elapsed < 604800) return `${Math.floor(elapsed / 86400)}d ago`;
    return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(seconds * 1000));
}

function sourceDomain(item) {
    if (!item.url) return item.type === "job" ? "HN job listing" : "news.ycombinator.com";
    try {
        const url = new URL(item.url);
        if (url.protocol !== "http:" && url.protocol !== "https:") return "Hacker News";
        return url.hostname.replace(/^www\./, "");
    } catch {
        return "External source";
    }
}

function safeStoryUrl(url, fallback) {
    if (typeof url !== "string" || !url.trim()) return fallback;
    try {
        const parsed = new URL(url);
        return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : fallback;
    } catch {
        return fallback;
    }
}

function appendText(parent, tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
}

function externalLink(href, text, className) {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = text;
    link.className = className;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
}

function createStoryRow(item, rank) {
    const itemUrl = `https://hacker-news.firebaseio.com/v0/item/${encodeURIComponent(item.id)}.json`;
    const discussionUrl = `https://news.ycombinator.com/item?id=${encodeURIComponent(item.id)}`;
    const destination = safeStoryUrl(item.url, discussionUrl);
    const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : "Untitled story";

    const row = document.createElement("li");
    row.className = "hn-story-row";
    row.dataset.storyId = String(item.id);

    const rankElement = appendText(row, "span", "hn-story-rank", String(rank).padStart(2, "0"));
    rankElement.setAttribute("aria-label", `Rank ${rank}`);

    const content = document.createElement("div");
    content.className = "hn-story-content";
    const header = document.createElement("div");
    header.className = "hn-story-title-line";
    header.append(externalLink(destination, title, "hn-story-title"));
    appendText(header, "span", "hn-story-domain", sourceDomain(item));
    content.append(header);

    const metadata = document.createElement("div");
    metadata.className = "hn-story-metadata";
    appendText(metadata, "span", "hn-story-score", `${Number.isFinite(item.score) ? item.score : "—"} POINTS`);
    appendText(metadata, "span", "hn-story-author", `BY ${item.by || "unknown"}`);
    appendText(metadata, "span", "hn-story-age", storyAge(item.time));
    appendText(metadata, "span", "hn-story-comments", `${Number.isFinite(item.descendants) ? item.descendants : 0} COMMENTS`);
    content.append(metadata);

    const links = document.createElement("div");
    links.className = "hn-story-links";
    appendText(links, "span", "hn-story-type", (item.type || "story").toUpperCase());
    links.append(externalLink(discussionUrl, "DISCUSS ↗", "hn-discussion-link"));
    content.append(links);

    row.append(content);
    row.dataset.itemUrl = itemUrl;
    return row;
}

function showFeedFailure(message) {
    setStatus("error", "Signal unavailable");
    setError(message);
    storyList.replaceChildren();
    const row = document.createElement("li");
    row.className = "hn-feed-placeholder hn-feed-placeholder--error";
    row.textContent = "The feed could not be resolved. Retry when the signal returns.";
    storyList.append(row);
    storyList.setAttribute("aria-busy", "false");
}

async function loadFeed(feed = activeFeed) {
    if (!FEEDS[feed]) return;
    activeFeed = feed;
    const requestId = ++activeRequest;
    requestController?.abort();
    requestController = new AbortController();
    const { signal } = requestController;

    document.querySelectorAll("[data-feed]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.feed === feed));
    });
    feedHeading.textContent = FEEDS[feed].label;
    refreshButton.disabled = true;
    setError("");
    setStatus("loading", "Resolving public story records");
    updatedLabel.textContent = "RESOLVING FEED IDS";
    itemCount.textContent = `${STORY_LIMIT} RECORDS`;
    storyList.setAttribute("aria-busy", "true");
    const placeholder = document.createElement("li");
    placeholder.className = "hn-feed-placeholder";
    placeholder.textContent = `Resolving the ${FEEDS[feed].label.toLowerCase()} signal...`;
    storyList.replaceChildren(placeholder);

    try {
        const ids = await fetchJson(`${HN_API_BASE}/${FEEDS[feed].endpoint}.json`, signal);
        if (!Array.isArray(ids)) throw new Error("The feed response was incomplete.");
        const selectedIds = ids.slice(0, STORY_LIMIT);
        const results = await Promise.allSettled(selectedIds.map(id => {
            if (!Number.isInteger(id) || id <= 0) return Promise.resolve(null);
            return fetchJson(`${HN_API_BASE}/item/${id}.json`, signal);
        }));
        if (requestId !== activeRequest) return;

        const stories = [];
        let unavailable = 0;
        results.forEach((result, index) => {
            if (result.status === "rejected") {
                unavailable += 1;
                return;
            }
            const item = result.value;
            if (!item || item.deleted || item.dead || !Number.isInteger(item.id)) {
                unavailable += 1;
                return;
            }
            stories.push({ item, rank: index + 1 });
        });

        storyList.replaceChildren(...stories.map(({ item, rank }) => createStoryRow(item, rank)));
        if (stories.length === 0) {
            const empty = document.createElement("li");
            empty.className = "hn-feed-placeholder hn-feed-placeholder--error";
            empty.textContent = "No available story records were resolved from this feed.";
            storyList.append(empty);
        }
        storyList.setAttribute("aria-busy", "false");
        itemCount.textContent = `${stories.length} / ${selectedIds.length} RECORDS`;
        const now = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date());
        updatedLabel.textContent = `LAST UPDATED ${now}`;
        if (unavailable) {
            setStatus("partial", `${unavailable} RECORD${unavailable === 1 ? "" : "S"} UNAVAILABLE`);
            setError("Some records were deleted, missing, or could not be reached. Available stories remain visible.");
        } else {
            setStatus("ready", "LIVE FEED CONNECTED");
        }
    } catch (error) {
        if (signal.aborted || requestId !== activeRequest) return;
        const message = error.name === "AbortError"
            ? "The Hacker News feed timed out. Try again shortly."
            : error instanceof TypeError
                ? "Hacker News could not be reached. Check your connection and retry."
                : error instanceof SyntaxError
                    ? "Hacker News returned an unreadable feed response. Retry to try again."
                    : error.message || "Hacker News could not be reached. Check your connection and retry.";
        showFeedFailure(message);
    } finally {
        if (requestId === activeRequest) refreshButton.disabled = false;
    }
}

document.querySelectorAll("[data-feed]").forEach(button => {
    button.addEventListener("click", () => loadFeed(button.dataset.feed));
});
refreshButton.addEventListener("click", () => loadFeed(activeFeed));
loadFeed();