# Restricted Archive

Restricted Archive searches books, authors, ISBNs, and technical subjects in the public Open Library catalog. It presents catalog hits as retrieved archive files and opens Work or Author records only when requested.

## Public API

The experiment uses public, unauthenticated Open Library APIs. No API credentials are stored.

- Search API: `https://openlibrary.org/search.json` with focused `fields`, `limit=20`, and mode-specific parameters for general, title, author, ISBN, or subject queries.
- ISBN lookup: `https://openlibrary.org/isbn/<ISBN>.json` is attempted first for validated ISBN-10 and ISBN-13 values; Search API results then provide richer work-level fields.
- Work API: `https://openlibrary.org/works/<WORK_ID>.json` loads description and subjects when a result is opened.
- Author API: `https://openlibrary.org/authors/<AUTHOR_ID>.json` loads an author file only when the user selects that author.
- Covers API: `https://covers.openlibrary.org/b/id/<COVER_ID>-M.jpg?default=false` for search rows and the `-L.jpg` variant for an opened record.

Search requests are capped at 20 records. This is a low-volume lookup interface, not a bulk catalog harvesting tool. Missing metadata and covers are normal. Catalog information can differ between editions, and Open Library availability fields are shown conservatively rather than treated as a promise of free reading access.