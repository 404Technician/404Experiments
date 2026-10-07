# GitHub API Experiment

This page reads live public GitHub profile, repository, and commit information for `404Technician` and `404Technician/404Experiments`.

## Endpoints

- `GET https://api.github.com/users/404Technician`
- `GET https://api.github.com/repos/404Technician/404Experiments`
- `GET https://api.github.com/repos/404Technician/404Experiments/commits?per_page=1`

The profile response supplies the avatar, username, public repository count, followers, following, and account creation date. The repository response supplies its description, counts, language, default branch, and dates. The commits endpoint supplies the latest public commit summary.

## Request and Rate-Limit Notes

Requests are made client-side with `fetch()` and no authentication. No GitHub token, API key, or personal credential is requested or stored by this site. GitHub applies rate limits to unauthenticated public API requests; if a limit is reached, wait before refreshing. Network, missing-resource, and API errors are shown in the interface.