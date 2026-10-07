# DEEP SPACE SIGNAL

A single 404 observation station receiving three classes of public NASA data: a daily astronomical transmission, today's near-Earth object tracks, and an on-demand search of NASA imagery. It belongs to **SIGNALS / Live data**. The imagery library inside this experience does not change its top-level category.

Open `index.html` through a static HTTP server or GitHub Pages. No build, backend, private credentials, or additional runtime dependencies are required. Dates and object passages are labelled UTC; NASA may not have published an APOD for the current UTC day yet.

## APIs and exact request patterns

### 01 / Daily transmission — current APOD

Base: `https://science.nasa.gov/wp-json/wp/v2/apod-basic`

- `GET https://science.nasa.gov/wp-json/wp/v2/apod-basic/{YYMMDD}`
- Example: `https://science.nasa.gov/wp-json/wp/v2/apod-basic/261007`
- Previous day: `https://science.nasa.gov/wp-json/wp/v2/apod-basic/261006`

One record is fetched for the selected day. Previous/next navigation stops at today and the first APOD date, 1995-06-16. Successfully received records are cached in memory for this page visit. Retry bypasses the cache. There are no range, random, `count`, or legacy `date` requests.

The returned fields are `date`, `post_id`, `title`, `permalink`, `url`, `media_type`, `explanation`, `credit`, `copyright`, `alt`, `hdurl`, and `basic_html`. In this service **`url` is an article permalink**, not an image URL. The image comes from `hdurl`; its NASA dynamic-image width/height bounds are reduced to 1440 where supported, while the original returned URL remains available as a high-resolution link. Images use `object-fit: contain`.

Non-image records use a source-linked presentation rather than automatic third-party embeds. Missing images do not remove the explanation or source. API HTML is converted to plain text; `basic_html` is never executed or inserted into the page. No key is required.

### 02 / Near-Earth objects — NeoWs

Base and endpoint: `https://api.nasa.gov/neo/rest/v1/feed`

`GET https://api.nasa.gov/neo/rest/v1/feed?start_date={YYYY-MM-DD}&end_date={YYYY-MM-DD}&api_key=DEMO_KEY`

Both dates are **today in UTC**. No multi-day window, lookup, browse, or automatic polling is used. All objects in that day's response are presented as tracks with NASA/JPL ID, estimated diameter in metres, classification, UTC passage, miss distance in kilometres, relative velocity in km/s, and orbiting body when supplied. Potentially hazardous status comes only from the API's boolean flag; it is not an impact prediction.

Only NeoWs uses the public **DEMO_KEY**. NASA documents DEMO_KEY limits of 30 requests/hour and 50 requests/day per IP address. Repeated page visits and other DEMO_KEY users can exhaust this allowance. A future deployment needing higher limits should use a server/edge proxy with an environment-managed NASA key, caching, and rate limiting. A browser-only GitHub Pages site cannot keep a personal key private; do not place one in client JavaScript or commit one.

### 03 / Deep space archive — NASA Image and Video Library

Base: `https://images-api.nasa.gov`

- Search: `GET https://images-api.nasa.gov/search?q={URL-encoded query}&media_type=image&page_size=12&page=1`
- On-demand asset manifest: `GET https://images-api.nasa.gov/asset/{URL-encoded nasa_id}`
- On-demand metadata location: `GET https://images-api.nasa.gov/metadata/{URL-encoded nasa_id}`
- Additional metadata: `GET {location}` from the metadata response, accepted only for an HTTPS NASA domain. Typically `https://images-assets.nasa.gov/image/{nasa_id}/metadata.json`.
- Preview/media URLs are taken from NASA's search/asset responses, not invented. Typically `https://images-assets.nasa.gov/image/{nasa_id}/{nasa_id}~thumb.jpg` and `~medium.jpg`.
- Human-readable source: `https://images.nasa.gov/details/{URL-encoded nasa_id}`.

No key is required. Search is initiated by a submitted query or suggested-subject button. It fetches at most 12 images and does not automatically paginate. Results show ID, title, description, date, keywords, media type, center/creator, and thumbnail where available. Opening a result requests its asset and metadata endpoints independently. Medium/large/small assets are preferred for detail display, with the thumbnail retained when larger media is absent. Original media is linked for explicit viewing, never automatically downloaded for every search result. The dialog supports Escape, focus trapping, a visible close control, and focus return through the native HTML dialog.

## Reception and failures

The three sources operate independently. An APOD outage does not block object tracking or archive queries. HTTP, network, 20-second timeout, JSON, empty, missing-field, rate-limit, and image errors have readable states. Retry controls apply only to the affected source. No fake fallback records are shipped. Optional metadata failures preserve the original search metadata and source link. Superseded searches and closed detail requests are cancelled; stale responses cannot replace a newer result. Successfully resolved details are cached in memory for the visit. There is no automatic retry loop or artificial delay.

## API LIFECYCLE

Official guidance was inspected **before implementation** and rechecked **before committing**, on **2026-10-07**:

- [NASA Open APIs catalog](https://api.nasa.gov/) identifies the current APOD replacement and the retired services, and documents NeoWs.
- [NASA's APOD migration README](https://github.com/nasa/apod-api/blob/master/README.md) identifies the new response fields and December 1, 2026 legacy retirement.
- The current NASA service's own `OPTIONS https://science.nasa.gov/wp-json/wp/v2/apod-basic` advertises `page`, `per_page`, `date_from`, and `date_to`. The date route was confirmed directly by NASA's live `/261007` and `/261006` responses; the implementation uses that route rather than transferring legacy query parameters.
- [Official NASA Image and Video Library API documentation](https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf), linked from NASA's library, documents `/search`, `page_size`, `/asset/{nasa_id}`, and `/metadata/{nasa_id}`. The catalog and documentation contain no retirement/deprecation notice for the endpoints used here.

The implementation intentionally does **not** use:

- Legacy APOD: `https://api.nasa.gov/planetary/apod` — scheduled for retirement on December 1, 2026. APOD uses the current `https://science.nasa.gov/wp-json/wp/v2/apod-basic` directly.
- Archived Earth API: `https://api.nasa.gov/planetary/earth/imagery` or `/planetary/earth/assets` — archived; NASA identifies Earthdata GIBS as its replacement. Neither is needed here.
- Archived Mars Rover API: `https://api.nasa.gov/mars-photos/api/v1/rovers/...` — archived; not used.
- Any other deprecated, legacy, archived, or retiring NASA API.

**Recheck official API lifecycle status before future major changes.** A working HTTP response alone does not establish lifecycle support. NASA's linked APOD Notion guide was unavailable during this check; request routing was validated using NASA's current service schema and live responses instead.

## Verification

Use a static server and inspect 1440px, 768px, and 375px widths. Verify APOD current/previous dates and next-day bounds; image, non-image, missing-field, and failure states; full/partial/potentially-hazardous/empty/rate-limited object feeds; Jupiter, nebula, Apollo, and James Webb searches; empty results, detail metadata/media failures, and retry. Verify keyboard-only form submission, skip link, dialog Escape/focus return, reduced motion, SIGNALS category state, and all global navigation links. Network failures should leave the other sections usable. Browser test fixtures are not production fallback data.

### Repeatable browser regression suite

The test runner is `tests/browser.cjs`. It uses Playwright with controlled test-only responses, runs from any working directory, and starts its own local static server. Install Playwright and Chromium in a temporary tooling directory, then point Node at that directory without adding dependencies to this static site:

```powershell
npm install --prefix "$env:TEMP\404-browser-tools" playwright
& "$env:TEMP\404-browser-tools\node_modules\.bin\playwright.cmd" install chromium
$env:NODE_PATH = "$env:TEMP\404-browser-tools\node_modules"
node apis/06-deep-space-signal/tests/browser.cjs
```

The suite exercises success, partial, empty, malformed JSON, HTTP/network/rate-limit, non-image, unsafe URL, metadata and asset failure, retry, concurrent-search, keyboard/dialog, navigation, and all three viewport cases. Live NASA checks are separate, so the deterministic suite does not consume DEMO_KEY quotas.
