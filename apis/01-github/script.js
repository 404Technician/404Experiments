const API_BASE = "https://api.github.com";
const PROFILE_ENDPOINT = `${API_BASE}/users/404Technician`;
const REPOSITORY_ENDPOINT = `${API_BASE}/repos/404Technician/404Experiments`;
const COMMITS_ENDPOINT = `${REPOSITORY_ENDPOINT}/commits?per_page=1`;

const apiStatus = document.getElementById("apiStatus");
const apiError = document.getElementById("apiError");
const dashboard = document.getElementById("githubDashboard");
const refreshButton = document.getElementById("refreshButton");
const avatar = document.getElementById("profileAvatar");

class GitHubApiError extends Error {
    constructor(kind) {
        super(kind);
        this.kind = kind;
    }
}

function setText(id, value, fallback = "Not available") {
    const element = document.getElementById(id);
    element.textContent = value === null || value === undefined || value === "" ? fallback : value;
}

function formatDate(value) {
    if (!value) return "Not available";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not available";

    return new Intl.DateTimeFormat("en", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(date);
}

function formatCount(value) {
    return Number.isFinite(value) ? new Intl.NumberFormat("en").format(value) : "Not available";
}

function setStatus(state, message) {
    apiStatus.dataset.state = state;
    apiStatus.lastChild.textContent = message;
}

async function fetchPublicJson(endpoint, signal) {
    let response;
    try {
        response = await fetch(endpoint, {
            headers: {
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            credentials: "omit",
            signal,
        });
    } catch (error) {
        if (error.name === "AbortError") throw new GitHubApiError("timeout");
        throw new GitHubApiError("network");
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const rateLimited = response.status === 403 && (
            response.headers.get("x-ratelimit-remaining") === "0" ||
            (data?.message || "").toLowerCase().includes("rate limit")
        );
        if (rateLimited) throw new GitHubApiError("rate-limit");
        if (response.status === 404) throw new GitHubApiError("not-found");
        throw new GitHubApiError("http");
    }

    return data;
}

function renderProfile(profile) {
    setText("profileName", profile.name || profile.login);
    setText("profileLogin", profile.login, "404Technician");
    setText("profileBio", profile.bio, "No public profile description.");
    setText("publicRepos", formatCount(profile.public_repos));
    setText("followers", formatCount(profile.followers));
    setText("following", formatCount(profile.following));
    setText("accountCreated", formatDate(profile.created_at));

    const profileLink = document.getElementById("profileLink");
    profileLink.href = profile.html_url || "https://github.com/404Technician";
    avatar.src = profile.avatar_url || "";
    avatar.alt = `${profile.login || "GitHub user"} profile avatar`;
    avatar.hidden = !profile.avatar_url;
}

function renderRepository(repository) {
    const [owner, name] = (repository.full_name || repository.name || "404Experiments").split("/");
    setText("repositoryOwner", owner, repository.owner?.login || "404Technician");
    setText("repositoryName", name || repository.name || "404Experiments");
    setText("repositoryDescription", repository.description, "No public repository description.");
    setText("stars", formatCount(repository.stargazers_count));
    setText("forks", formatCount(repository.forks_count));
    setText("openIssues", formatCount(repository.open_issues_count));
    setText("primaryLanguage", repository.language);
    setText("defaultBranch", repository.default_branch);
    setText("repositoryCreated", formatDate(repository.created_at));
    setText("repositoryUpdated", formatDate(repository.updated_at));
    setText("repositoryPushed", formatDate(repository.pushed_at));

    const repositoryLink = document.getElementById("repositoryLink");
    repositoryLink.href = repository.html_url || "https://github.com/404Technician/404Experiments";
}

function renderCommit(commits) {
    const latest = commits[0];
    if (!latest) {
        setText("latestCommitLink", "No public commits found.");
        setText("commitSha", "");
        setText("commitDate", "");
        return;
    }

    const message = latest.commit?.message?.split("\n")[0];
    setText("latestCommitLink", message, "Commit message unavailable");
    document.getElementById("latestCommitLink").href = latest.html_url || "https://github.com/404Technician/404Experiments/commits";
    setText("commitSha", latest.sha?.slice(0, 7));

    const date = latest.commit?.committer?.date || latest.commit?.author?.date;
    const dateElement = document.getElementById("commitDate");
    dateElement.textContent = formatDate(date);
    if (date) dateElement.dateTime = date;
}

function describeFailure(error) {
    switch (error.kind) {
        case "rate-limit":
            return "GitHub's unauthenticated rate limit has been reached. Wait a while before refreshing.";
        case "not-found":
            return "A requested public profile, repository, or commit was not found.";
        case "timeout":
            return "GitHub did not respond in time. Check the connection and try again.";
        case "network":
            return "GitHub could not be reached. Check the network connection and try again.";
        default:
            return "GitHub returned an error. The public data could not be loaded.";
    }
}

async function loadGitHubData() {
    refreshButton.disabled = true;
    apiError.hidden = true;
    dashboard.setAttribute("aria-busy", "true");
    setStatus("loading", "Contacting public endpoints");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    const results = await Promise.allSettled([
        fetchPublicJson(PROFILE_ENDPOINT, controller.signal),
        fetchPublicJson(REPOSITORY_ENDPOINT, controller.signal),
        fetchPublicJson(COMMITS_ENDPOINT, controller.signal),
    ]);
    window.clearTimeout(timeout);

    const [profileResult, repositoryResult, commitsResult] = results;
    if (profileResult.status === "fulfilled") renderProfile(profileResult.value);
    if (repositoryResult.status === "fulfilled") renderRepository(repositoryResult.value);
    if (commitsResult.status === "fulfilled") renderCommit(commitsResult.value);

    const errors = results.filter(result => result.status === "rejected").map(result => result.reason);
    if (errors.length === 0) {
        setStatus("ready", "Live public data connected");
    } else {
        const isRateLimited = errors.some(error => error.kind === "rate-limit");
        const hasSomeData = results.some(result => result.status === "fulfilled");
        setStatus(isRateLimited ? "rate-limit" : hasSomeData ? "partial" : "error", hasSomeData ? "Partial signal // Some data unavailable" : "Signal unavailable");
        apiError.textContent = describeFailure(errors[0]);
        apiError.hidden = false;
    }

    dashboard.setAttribute("aria-busy", "false");
    refreshButton.disabled = false;
}

refreshButton.addEventListener("click", loadGitHubData);
loadGitHubData();