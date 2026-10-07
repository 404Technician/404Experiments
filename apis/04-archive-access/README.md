# Archive Access

Archive Access assembles an English-language Wikipedia topic into a compact knowledge dossier: an introductory extract, lead image, linked related records, a small visual archive, and source metadata.

## API and requests

The experiment uses the public MediaWiki Action API at `https://en.wikipedia.org/w/api.php`. Requests are unauthenticated, public, and do not require an API key. Browser requests include `origin=*` for CORS access.

Search resolution uses `action=query&list=search` with a five-result limit. The highest-ranked result is opened by default, with other matches available for explicit selection. The selected article request uses `prop=extracts|pageimages|info` for a plain-text introduction, thumbnail/original image, canonical URL, and page ID. A separate `prop=links` request retrieves up to 40 namespace-zero links, and a bounded `generator=images` request retrieves up to six additional images where available. Link and image requests are optional and cannot block the primary dossier.

Related records are inferred from links on the selected Wikipedia page, not from a semantic relationship service. The page avoids generic navigation links and lets a reader open a related subject as a new dossier. Wikipedia summaries depend on the source article, images may be absent or inaccessible, and public Wikipedia content can change over time. Optional related-link or image failures do not prevent the primary article from loading.