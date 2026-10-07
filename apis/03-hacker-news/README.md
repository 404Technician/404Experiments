# Hacker News Signal Feed

This experiment reads Hacker News stories through the official Firebase API at `https://hacker-news.firebaseio.com/v0/`. It uses public, unauthenticated, read-only requests; no API credentials are stored.

## Feeds and loading

The feed controls use these public endpoints:

- Top: `/topstories.json`
- New: `/newstories.json`
- Best: `/beststories.json`
- Ask HN: `/askstories.json`
- Show HN: `/showstories.json`
- Jobs: `/jobstories.json`

The page first requests a feed of story IDs, selects at most 20 IDs, and then resolves those records through `/item/<id>.json`. It does not request the full feed of hundreds of IDs. The Hacker News v0 API exposes data in near real time.

Feeds can include deleted, dead, or missing records, and individual item requests can fail. Those records are skipped while available stories remain visible; a failed feed request has a retry state.

Story links open the external article when one is available; Ask HN, Show HN, and other items without a URL link to their Hacker News discussion. Every story also has a discussion link on Hacker News.