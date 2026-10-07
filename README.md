# 404Experiments

404Experiments is an evolving environment for things tested, built, explored, and not supposed to exist yet. The 404 identity points to the unknown, the missing, and the routes beyond the expected path.

Live site: https://404technician.github.io/404Experiments/

## Site Structure

- **Home** (`index.html`) is the cinematic entry point, with selected experiments and API signals.
- **Experiments** (`experiments/`) contains the complete catalog of ten interactive tools. Their original folder URLs remain unchanged.
- **APIs** (`apis/`) contains experiments that read public services. New API experiments can be added as numbered folders.
- **Future experiments** (`future-experiments/`) marks space for categories that may appear later.

All sections share the root `site.css` theme and the same 404 / NEXUS / LAB / SIGNALS navigation (home, experiments, and APIs). Individual tools retain their existing behavior and local styling where needed.

## API Experiment: GitHub

The first API file is [`apis/01-github/`](apis/01-github/). It reads public profile, repository, and latest-commit data from the GitHub REST API:

- `GET /users/404Technician`
- `GET /repos/404Technician/404Experiments`
- `GET /repos/404Technician/404Experiments/commits?per_page=1`

Requests are unauthenticated and use no API key or token. GitHub rate-limits unauthenticated requests; the interface reports rate-limit, network, and missing-resource errors without exposing credentials.

## API Experiment: Weather Signal

[`apis/02-weather/`](apis/02-weather/) uses public Open-Meteo geocoding to resolve city/postal-code searches and a single Forecast API request for 14 days of local weather, current conditions, and hourly relative humidity. Best, North Brabant (`51.51, 5.39`) remains the default. The selected location’s timezone governs the daily humidity averages/ranges, date labels, sunrise, and sunset.

The browser makes unauthenticated requests; no API credentials are stored. Forecast data is live and can change between updates. The page reports API, network, and incomplete-data states.

## API Experiment: Hacker News

[`apis/03-hacker-news/`](apis/03-hacker-news/) reads the official Hacker News Firebase API in near real time. It requests one selected feed of story IDs, resolves at most 20 item records, and supports Top, New, Best, Ask HN, Show HN, and Jobs. Requests are public and unauthenticated; unavailable or deleted items are skipped, and links open external stories or Hacker News discussions safely.

## API Experiment: Archive Access

[`apis/04-archive-access/`](apis/04-archive-access/) resolves English Wikipedia searches into a dossier with a plain-text extract, lead image, related article links, metadata, and optional Wikimedia visual material. It uses the public MediaWiki Action API without credentials; optional related and image requests do not block the primary article.

## API Experiment: Restricted Archive

[`apis/05-restricted-archive/`](apis/05-restricted-archive/) searches the public Open Library catalog by general query, title, author, ISBN, or subject. It resolves Work and Author records on demand, displays official cover images where available, and uses no API credentials.

## Experiments

1. Random Number Generator
2. Dice Roller
3. Counter
4. Password Generator
5. To-do App
6. Color Palette Generator
7. Signal Converter
8. PT100 Converter
9. Signal Diagnostics
10. PID Tuning Sandbox

## Extending the Archive

Add new tools under `experiments/` or new API interfaces as numbered folders under `apis/`. Other categories can be introduced as the archive grows.
## NEXUS / Live system status

The homepage now receives six compact statuses immediately after its cinematic
hero. All source logic lives in nexus.js; no external library or private
credential is added. The decorative eight-node SVG reflects successful, stale
and unavailable reception with faint illumination. Its slow CSS line movement
pauses while hidden and is disabled by prefers-reduced-motion, while the static
network and live data remain available.

**Six API requests on initial visible load and each refresh**, one per source:

| Signal | Exact request pattern |
| --- | --- |
| Weather / Best, NL | https://api.open-meteo.com/v1/forecast?latitude=51.51&longitude=5.39&current=temperature_2m%2Crelative_humidity_2m&timezone=UTC |
| NASA NeoWs | https://api.nasa.gov/neo/rest/v1/feed?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&api_key=DEMO_KEY |
| Frankfurter v2 | https://api.frankfurter.dev/v2/rates?base=eur&quotes=usd&from=YYYY-MM-DD&to=YYYY-MM-DD |
| Hacker News | https://hacker-news.firebaseio.com/v0/topstories.json |
| GitHub | https://api.github.com/repos/404Technician/404Experiments/commits?per_page=1 |
| Current NASA APOD | https://science.nasa.gov/wp-json/wp/v2/apod-basic/YYMMDD |

NeoWs dates are today in UTC. Currency dates cover only today minus seven days
through today: the two latest distinct available reference dates are selected
from this single response. Movement is (latest - previous) / previous × 100,
rather than an intraday quote or a seven-day change. Fewer than two valid dates
produce an explained unavailable movement, never a made-up percentage.
Open-Meteo requests only current Celsius temperature and relative humidity at
the same default coordinates as Weather Signal; no geolocation, geocoding,
hourly data or full forecast is needed. NEO IDs are deduplicated, and only NASA's
true hazardous flags are counted. GitHub requests one latest commit, displays
its committer date as relative freshness and retains the short SHA. An older
commit is historical information, not evidence that the GitHub connection failed.

Hacker News uses only the returned top-story ID count. APOD uses the existing
verified YYMMDD route and only displays metadata: no image, embedded media or
legacy planetary/apod request. There are no story-item, CBS, full chart, large
GitHub list, or image-library requests. API JSON can include fields not displayed;
the homepage never fetches media URLs contained in those responses.

Reception uses independent promises with Promise.allSettled. Each request has a
**12-second AbortController timeout**, including JSON body reading. HTTP,
shared rate-limit, network, malformed JSON, incomplete/missing metadata and
timeouts produce a text UNAVAILABLE state only for that source. Other rows and
navigation remain usable. Refresh is disabled while active, with an additional
code guard against overlapping requests. Values occupy reserved row heights to
avoid layout movement on arrival. Sources are retried only by the next manual
or scheduled refresh, with no immediate retry loop.

REFRESH SIGNALS requests all six statuses. Automatic refresh runs **five minutes
after completion**, pauses when the document is hidden, and refreshes on return
if the last reception is at least five minutes old. A homepage initially opened
hidden waits until visible. Readings support LOADING, ACTIVE, STALE and
UNAVAILABLE. Weather older than two hours and reference rates older than four
days are marked STALE; UTC day changes age the NASA day-specific readings, and
reception older than five minutes is also stale. These thresholds are UI
freshness indicators, not assertions about a source's publication schedule.

LAST SYNC records when the refresh finishes, including partial failures, and is
explicitly labelled UTC. It does not mean every dataset was published then:
weather, daily/reference currency data, object feeds, APOD, story IDs and
repository commits follow different source clocks. No claim is made that all
six signals are real-time. NeoWs uses only the public DEMO_KEY, matching Deep
Space Signal. Its shared limits still apply (30 requests/hour and 50/day per IP);
rate-limit responses remain isolated and visible. No personal NASA or GitHub
key is committed.

### NEXUS verification

With Node, Playwright and Chromium available:

    node --check nexus.js
    node --check tests/nexus.browser.cjs
    node tests/nexus.browser.cjs
    node tests/nexus.browser.cjs --live
    git diff --check

Set NODE_PATH if Playwright resides in a separate temporary tooling directory.
Controlled test-only responses verify each of the six independent outages,
network/HTTP/rate-limit/JSON/schema failures, timeout and retry, refresh locking,
five-minute scheduling, hidden-page pause/resume, timestamps, all status
calculations, all six destination links, keyboard refresh, static reduced-motion
SVG, no imagery, exactly six initial data requests, stable arrival layout and
1440/768/375px widths without horizontal overflow. Screenshots are written to
the OS temporary directory. The separate live mode verifies actual responses
from all six sources. Production includes no test fixtures or fallback numbers.

## Global Signal Map

[GLOBAL SIGNAL MAP](apis/global-signal-map/index.html) plots recent USGS M2.5+
earthquakes, the International Space Station position, and current weather for
Best (Netherlands), New York, São Paulo, Cape Town, Tokyo and Sydney on a real
interactive world map. It is entirely client-side, using pinned Leaflet 1.9.4
with verified CDN integrity hashes and OpenStreetMap tiles; no build step,
backend, private credentials or visitor geolocation is involved.

Public data endpoints:
- USGS: https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson
- ISS: https://api.wheretheiss.at/v1/satellites/25544
- Open-Meteo: https://api.open-meteo.com/v1/forecast with comma-separated latitude
  and longitude lists, current=temperature_2m,wind_speed_10m and timezone=UTC.
- Tiles: https://tile.openstreetmap.org/{z}/{x}/{y}.png with visible OSM attribution.

Initial load and a full manual refresh use **three data requests**: one earthquake
feed, one ISS position, and one six-location weather batch. Tile requests vary
with viewport, pan and zoom; Leaflet also downloads its pinned JS/CSS. ISS polls
every 20 seconds after completion, earthquakes every five minutes, weather every
ten minutes. Hidden documents and disabled layers pause automatic polling;
in-flight work is shared so refreshes cannot overlap duplicate feed requests.
Requests time out after 12 seconds. LAST SYNC means full refresh completion;
each popup retains the source observation time. Failed feeds clear only their
own markers. Layers and controls stay usable when another feed or tiles fail.

Only real coordinates and valid source values are plotted. Up to 180 largest
recent earthquakes are shown if a feed is unusually large; omitted records are
reported. Weather points represent fixed public locations with modelled current
conditions, not instrumented stations or visitor positions. The ISS marker
moves only when a new source position arrives; no orbit is extrapolated.
An accessible text view remains available even if the Leaflet CDN is unavailable.

All services are public, unauthenticated and subject to external availability
and rate limits. The ISS endpoint was verified for HTTPS, browser CORS and its
current latitude/longitude/timestamp response. OSM tiles use normal browser
caching and visible attribution, with no bulk download or prefetch feature.
Source and tile attribution remain visible. NEXUS and existing experiments are
not modified.

Browser coverage: node apis/global-signal-map/tests/browser.cjs (controlled
fixtures with genuine verified Leaflet assets) and the same command with --live
for the real CDN, world tiles and APIs. Set NODE_PATH to an external Playwright
installation if needed. Tests cover all three layers, popup values, keyboard
markers, toggles, manual refresh protection, source isolation, missing/partial
data, JSON/network/HTTP/timeout errors, ISS updates, hidden-page pause, CDN
failure, world/drag/zoom controls, 1440/768/390px layouts and relative routes
served under /404Experiments/. Test fixtures never ship as production data.
