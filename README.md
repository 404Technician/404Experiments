# 404Experiments

404Experiments is an evolving environment for things tested, built, explored, and not supposed to exist yet. The 404 identity points to the unknown, the missing, and the routes beyond the expected path.

Live site: https://404technician.github.io/404Experiments/

## Site Structure

- **Home** (`index.html`) is the cinematic entry point, with selected experiments and API signals.
- **Experiments** (`experiments/`) contains the complete catalog of ten interactive tools. Their original folder URLs remain unchanged.
- **APIs** (`apis/`) contains experiments that read public services. New API experiments can be added as numbered folders.
- **Future experiments** (`future-experiments/`) marks space for categories that may appear later.

All sections share the root `site.css` theme and the same Home / Experiments / APIs navigation. Individual tools retain their existing behavior and local styling where needed.

## API Experiment: GitHub

The first API file is [`apis/01-github/`](apis/01-github/). It reads public profile, repository, and latest-commit data from the GitHub REST API:

- `GET /users/404Technician`
- `GET /repos/404Technician/404Experiments`
- `GET /repos/404Technician/404Experiments/commits?per_page=1`

Requests are unauthenticated and use no API key or token. GitHub rate-limits unauthenticated requests; the interface reports rate-limit, network, and missing-resource errors without exposing credentials.

## API Experiment: Weather Signal

[`apis/02-weather/`](apis/02-weather/) uses the public Open-Meteo Forecast API for a fixed location in Best, North Brabant, Netherlands (`51.51, 5.39`). It requests a 14-day forecast in the `Europe/Amsterdam` timezone and includes daily conditions, air and apparent temperatures, precipitation, wind, sunrise, and sunset.

The browser makes unauthenticated requests; no API credentials are stored. Forecast data is live and can change between updates. The page reports API, network, and incomplete-data states.

## API Experiment: Hacker News

[`apis/03-hacker-news/`](apis/03-hacker-news/) reads the official Hacker News Firebase API in near real time. It requests one selected feed of story IDs, resolves at most 20 item records, and supports Top, New, Best, Ask HN, Show HN, and Jobs. Requests are public and unauthenticated; unavailable or deleted items are skipped, and links open external stories or Hacker News discussions safely.

## API Experiment: Archive Access

[`apis/04-archive-access/`](apis/04-archive-access/) resolves English Wikipedia searches into a dossier with a plain-text extract, lead image, related article links, metadata, and optional Wikimedia visual material. It uses the public MediaWiki Action API without credentials; optional related and image requests do not block the primary article.

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