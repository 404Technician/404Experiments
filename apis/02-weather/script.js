const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const FORECAST_DAYS = 14;
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const CURRENT_FIELDS = ["temperature_2m", "weather_code", "relative_humidity_2m", "wind_speed_10m"];
const DEFAULT_LOCATION = { name: "Best", admin1: "North Brabant", country: "Netherlands", country_code: "NL", latitude: 51.51, longitude: 5.39, timezone: "Europe/Amsterdam" };
const DAILY_FIELDS = [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "apparent_temperature_max",
    "apparent_temperature_min",
    "precipitation_probability_max",
    "precipitation_sum",
    "wind_speed_10m_max",
    "wind_gusts_10m_max",
    "sunrise",
    "sunset",
];

const weatherStatus = document.getElementById("weatherStatus");
const weatherError = document.getElementById("weatherError");
const refreshButton = document.getElementById("refreshWeather");
const forecastGrid = document.getElementById("forecastGrid");
let forecastDays = [];
let selectedLocation = locationFromUrl();
let forecastController;
let forecastVersion = 0;
let geocodingController;
let geocodingVersion = 0;
let lastSearch = "";

const WEATHER_STATES = [
    { matches: code => code === 0, label: "Clear", symbol: "◉", visual: "clear" },
    { matches: code => code === 1, label: "Mainly clear", symbol: "◉", visual: "clear" },
    { matches: code => code === 2, label: "Partly cloudy", symbol: "◌", visual: "cloud" },
    { matches: code => code === 3, label: "Overcast", symbol: "●", visual: "cloud" },
    { matches: code => code === 45 || code === 48, label: "Fog", symbol: "≋", visual: "fog" },
    { matches: code => code >= 51 && code <= 57, label: "Drizzle", symbol: "⌁", visual: "rain" },
    { matches: code => code >= 61 && code <= 67, label: "Rain", symbol: "⌁", visual: "rain" },
    { matches: code => code >= 71 && code <= 77, label: "Snow", symbol: "✳", visual: "snow" },
    { matches: code => code >= 80 && code <= 82, label: "Showers", symbol: "⌁", visual: "rain" },
    { matches: code => code === 85 || code === 86, label: "Snow showers", symbol: "✳", visual: "snow" },
    { matches: code => code >= 95 && code <= 99, label: "Thunderstorm", symbol: "ϟ", visual: "storm" },
];

function weatherForCode(value) {
    if (value === null || value === undefined || value === "") {
        return { label: "Conditions unavailable", symbol: "?", visual: "unknown" };
    }
    const code = Number(value);
    if (!Number.isFinite(code)) return { label: "Conditions unavailable", symbol: "?", visual: "unknown" };
    return WEATHER_STATES.find(state => state.matches(code)) || { label: "Unknown conditions", symbol: "?", visual: "unknown" };
}

function valueAt(daily, key, index) {
    const value = daily[key]?.[index];
    return value === null || value === undefined || value === "" ? null : value;
}

function formatNumber(value, suffix = "") {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    return Number.isFinite(number) ? `${Math.round(number)}${suffix}` : "—";
}

function formatDate(value, options) {
    if (!value) return "Date unavailable";
    const date = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(date);
}

function formatTime(value) {
    if (typeof value !== "string") return "—";
    const time = value.split("T")[1];
    return time ? time.slice(0, 5) : "—";
}

function setStatus(state, message) {
    weatherStatus.dataset.state = state;
    weatherStatus.lastChild.textContent = message;
}

function appendValue(parent, className, text) {
    const element = document.createElement("span");
    element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
}

function createForecastCard(day, index) {
    const state = weatherForCode(day.weather_code);
    const card = document.createElement("button");
    card.className = "forecast-day";
    card.type = "button";
    card.dataset.dayIndex = String(index);
    card.setAttribute("aria-pressed", "false");
    card.setAttribute("aria-label", `${formatDate(day.date, { weekday: "long", day: "numeric", month: "long" })}, ${state.label}, high ${formatNumber(day.high, "°")}, low ${formatNumber(day.low, "°")}, relative humidity ${formatHumidity(day.humidity.average)}`);

    const date = document.createElement("span");
    date.className = "forecast-date";
    appendValue(date, "forecast-weekday", day.date === localToday() ? "Today" : formatDate(day.date, { weekday: "short" }));
    appendValue(date, "forecast-calendar-date", formatDate(day.date, { day: "2-digit", month: "short" }));

    const glyph = document.createElement("span");
    glyph.className = `weather-glyph weather-glyph--${state.visual}`;
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = state.symbol;

    const label = document.createElement("span");
    label.className = "forecast-condition";
    label.textContent = state.label;

    const temperatures = document.createElement("span");
    temperatures.className = "forecast-temperatures";
    appendValue(temperatures, "forecast-high", formatNumber(day.high, "°"));
    appendValue(temperatures, "forecast-low", formatNumber(day.low, "°"));

    const lower = document.createElement("span");
    lower.className = "forecast-lower-line";
    appendValue(lower, "forecast-rain", `RAIN ${formatNumber(day.precipitation_probability, "%")}`);
    appendValue(lower, "forecast-wind", `${formatNumber(day.wind, " km/h")} WIND`);

    const humidity = document.createElement("span");
    humidity.className = "forecast-humidity";
    humidity.textContent = `RH ${formatHumidity(day.humidity.average)}`;
    humidity.setAttribute("aria-label", `Average relative humidity: ${formatHumidity(day.humidity.average)}`);
    card.append(date, glyph, label, temperatures, lower, humidity);
    return card;
}

function renderSelectedDay(day) {
    const state = weatherForCode(day.weather_code);
    document.getElementById("detailTitle").textContent = formatDate(day.date, { weekday: "long", day: "numeric", month: "long" });
    document.getElementById("detailCondition").textContent = state.label;
    document.getElementById("detailFeels").textContent = `${formatNumber(day.apparent_max, "°")} / ${formatNumber(day.apparent_min, "°")} C`;
    document.getElementById("detailPrecipitation").textContent = `${formatNumber(day.precipitation_sum, " mm")} / ${formatNumber(day.precipitation_probability, "%")} chance`;
    document.getElementById("detailWind").textContent = `${formatNumber(day.wind, " km/h")} / ${formatNumber(day.gusts, " km/h")} gusts`;
    document.getElementById("detailHumidityAverage").textContent = `Average: ${formatHumidity(day.humidity.average)}`;
    document.getElementById("detailHumidityLow").textContent = `Low: ${formatHumidity(day.humidity.min)}`;
    document.getElementById("detailHumidityHigh").textContent = `High: ${formatHumidity(day.humidity.max)}`;
    document.getElementById("detailSunrise").textContent = formatTime(day.sunrise);
    document.getElementById("detailSunset").textContent = formatTime(day.sunset);
}

function renderForecast(daily, hourly) {
    const receivedDates = Array.isArray(daily.time) ? daily.time : [];
    const startDate = receivedDates.find(validDay);
    if (!startDate) throw new Error("The forecast response did not include valid daily dates.");
    const times = Array.from({ length: FORECAST_DAYS }, (_, offset) => {
        const date = new Date(startDate + "T12:00:00Z");
        date.setUTCDate(date.getUTCDate() + offset);
        return date.toISOString().slice(0, 10);
    });
    const humidity = dailyHumidity(hourly);
    forecastDays = times.map(date => {
        const index = receivedDates.indexOf(date);
        return {
            date,
            weather_code: valueAt(daily, "weather_code", index),
            high: valueAt(daily, "temperature_2m_max", index),
            low: valueAt(daily, "temperature_2m_min", index),
            apparent_max: valueAt(daily, "apparent_temperature_max", index),
            apparent_min: valueAt(daily, "apparent_temperature_min", index),
            precipitation_probability: valueAt(daily, "precipitation_probability_max", index),
            precipitation_sum: valueAt(daily, "precipitation_sum", index),
            wind: valueAt(daily, "wind_speed_10m_max", index),
            gusts: valueAt(daily, "wind_gusts_10m_max", index),
            sunrise: valueAt(daily, "sunrise", index),
            sunset: valueAt(daily, "sunset", index),
            humidity: humidity.get(date) || { min: null, max: null, average: null, count: 0 },
        };
    });
    forecastGrid.replaceChildren(...forecastDays.map(createForecastCard));
    forecastGrid.setAttribute("aria-busy", "false");
    forecastGrid.querySelector(".forecast-day")?.setAttribute("aria-pressed", "true");
    renderSelectedDay(forecastDays[0]);
    return forecastDays.every(day => receivedDates.includes(day.date) && day.humidity.count > 0) && DAILY_FIELDS.every(field => {
        const values = daily[field];
        return Array.isArray(values) && values.length >= FORECAST_DAYS && values.slice(0, FORECAST_DAYS).every(value => value !== null && value !== undefined && value !== "");
    });
}

function showFailure(message) {
    weatherError.textContent = message;
    weatherError.hidden = false;
    if (forecastDays.length === 0) {
        const empty = document.createElement("p");
        empty.className = "forecast-placeholder forecast-placeholder--error";
        empty.textContent = "Forecast signal unavailable. Use refresh to try again.";
        forecastGrid.replaceChildren(empty);
    }
    forecastGrid.setAttribute("aria-busy", "false");
    setStatus("error", "Signal unavailable");
}

async function loadForecast() {
    forecastController?.abort();
    const controller = new AbortController();
    forecastController = controller;
    const version = ++forecastVersion;
    refreshButton.disabled = true;
    weatherError.hidden = true;
    forecastDays = [];
    forecastGrid.setAttribute("aria-busy", "true");
    const placeholder = document.createElement("p");
    placeholder.className = "forecast-placeholder";
    placeholder.textContent = "Receiving forecast for " + selectedLocation.name + "…";
    forecastGrid.replaceChildren(placeholder);
    resetConditions();
    setStatus("loading", "Receiving local forecast");
    const parameters = new URLSearchParams({
        latitude: String(selectedLocation.latitude),
        longitude: String(selectedLocation.longitude),
        daily: DAILY_FIELDS.join(","),
        hourly: "relative_humidity_2m",
        current: CURRENT_FIELDS.join(","),
        timezone: "auto",
        forecast_days: String(FORECAST_DAYS),
        temperature_unit: "celsius",
        wind_speed_unit: "kmh",
        precipitation_unit: "mm",
    });
    try {
        const data = await requestJson(FORECAST_URL + "?" + parameters, controller.signal);
        if (version !== forecastVersion) return;
        if (!data?.daily) throw new Error("The forecast response did not include daily data.");
        selectedLocation.timezone = validTimezone(data.timezone) ? data.timezone : selectedLocation.timezone || "UTC";
        showLocation();
        const complete = renderForecast(data.daily, data.hourly);
        const currentComplete = renderCurrent(data.current);
        const now = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: selectedLocation.timezone }).format(new Date());
        setStatus(complete && currentComplete ? "ready" : "partial", complete && currentComplete ? "Live data // Updated " + now + " local" : "Partial forecast // Some values unavailable");
        if (!complete || !currentComplete) {
            weatherError.textContent = "Some forecast or current values are unavailable. Missing readings are shown as —; humidity uses the valid hourly samples received for each local day.";
            weatherError.hidden = false;
        }
    } catch (error) {
        if (version !== forecastVersion) return;
        showFailure(error.name === "AbortError" ? "Open-Meteo did not respond in time. Use refresh to retry." : error.message || "The forecast could not be loaded.");
    } finally {
        if (version === forecastVersion) {
            refreshButton.disabled = false;
            forecastGrid.setAttribute("aria-busy", "false");
        }
    }
}

forecastGrid.addEventListener("click", event => {
    const card = event.target.closest(".forecast-day");
    if (!card) return;

    forecastGrid.querySelectorAll(".forecast-day").forEach(dayCard => dayCard.setAttribute("aria-pressed", "false"));
    card.setAttribute("aria-pressed", "true");
    const selected = forecastDays[Number(card.dataset.dayIndex)];
    if (selected) renderSelectedDay(selected);
});

refreshButton.addEventListener("click", loadForecast);
loadForecast();
function validDay(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + "T12:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTimezone(value) {
    if (typeof value !== "string" || !value) return false;
    try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; }
    catch { return false; }
}

function localToday() {
    const parts = new Intl.DateTimeFormat("en", {
        timeZone: selectedLocation.timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type).value;
    return `${part("year")}-${part("month")}-${part("day")}`;
}

function validHumidity(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function formatHumidity(value) {
    return validHumidity(value) ? `${Math.round(value)}%` : "—";
}

function dailyHumidity(hourly) {
    const groups = new Map();
    const times = Array.isArray(hourly?.time) ? hourly.time : [];
    const values = Array.isArray(hourly?.relative_humidity_2m) ? hourly.relative_humidity_2m : [];
    times.forEach((time, index) => {
        // With timezone=auto Open-Meteo supplies local, offset-free ISO timestamps.
        // Group their calendar-date prefix directly, without browser/UTC conversion.
        if (typeof time !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return;
        const day = time.slice(0, 10);
        const value = values[index];
        if (!validDay(day) || !validHumidity(value)) return;
        const group = groups.get(day) || { min: Infinity, max: -Infinity, sum: 0, count: 0 };
        group.min = Math.min(group.min, value);
        group.max = Math.max(group.max, value);
        group.sum += value;
        group.count++;
        groups.set(day, group);
    });
    return new Map([...groups].map(([day, group]) => [day, { min: group.min, max: group.max, average: group.sum / group.count, count: group.count }]));
}

function renderCurrent(current) {
    document.getElementById("currentTemperature").textContent = formatNumber(current?.temperature_2m, "° C");
    document.getElementById("currentCondition").textContent = weatherForCode(current?.weather_code).label;
    document.getElementById("currentHumidity").textContent = formatHumidity(current?.relative_humidity_2m);
    document.getElementById("currentWind").textContent = formatNumber(current?.wind_speed_10m, " km/h");
    document.getElementById("currentTime").textContent = current?.time && formatTime(current.time) !== "—" ? " / " + formatTime(current.time) + " local" : "";
    return CURRENT_FIELDS.every(field => current?.[field] !== null && current?.[field] !== undefined && current?.[field] !== "") && validHumidity(current?.relative_humidity_2m);
}

function resetConditions() {
    ["currentTemperature", "currentCondition", "currentHumidity", "currentWind", "detailFeels", "detailPrecipitation", "detailWind", "detailSunrise", "detailSunset"].forEach(id => { document.getElementById(id).textContent = "—"; });
    document.getElementById("currentTime").textContent = "";
    document.getElementById("detailTitle").textContent = "Waiting for forecast";
    document.getElementById("detailCondition").textContent = "Selected location / " + selectedLocation.name;
    document.getElementById("detailHumidityAverage").textContent = "Average: —";
    document.getElementById("detailHumidityLow").textContent = "Low: —";
    document.getElementById("detailHumidityHigh").textContent = "High: —";
}

function locationFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const lat = params.get("lat");
    const lon = params.get("lon");
    const name = params.get("name")?.trim();
    if (!lat?.trim() || !lon?.trim() || !name || name.length > 120 || /[\u0000-\u001f]/.test(name)) return { ...DEFAULT_LOCATION };
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { ...DEFAULT_LOCATION };
    return { name, latitude, longitude, timezone: null };
}

function coordinates(location) {
    const lat = Math.abs(location.latitude).toFixed(2) + "° " + (location.latitude < 0 ? "S" : "N");
    const lon = Math.abs(location.longitude).toFixed(2) + "° " + (location.longitude < 0 ? "W" : "E");
    return lat + " · " + lon;
}

function showLocation() {
    const title = document.getElementById("resolvedLocation");
    title.textContent = selectedLocation.name;
    if (selectedLocation.country_code) appendValue(title, "location-country-code", " / " + selectedLocation.country_code);
    document.getElementById("locationRegion").textContent = [selectedLocation.admin1, selectedLocation.country].filter(Boolean).join(", ");
    document.getElementById("locationCoordinates").textContent = coordinates(selectedLocation);
    document.getElementById("locationTimezone").textContent = selectedLocation.timezone || "Resolving local timezone…";
}

function chooseLocation(location) {
    geocodingController?.abort();
    ++geocodingVersion;
    selectedLocation = { ...location };
    document.getElementById("locationResults").replaceChildren();
    document.getElementById("locationResults").setAttribute("aria-busy", "false");
    document.getElementById("locationSearchStatus").textContent = "Location selected / " + [location.name, location.country].filter(Boolean).join(", ");
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ lat: String(location.latitude), lon: String(location.longitude), name: [location.name, location.country].filter(Boolean).join(", ").slice(0, 120) });
    window.history.pushState(null, "", url);
    showLocation();
    const title = document.getElementById("resolvedLocation");
    title.tabIndex = -1;
    title.focus();
    loadForecast();
}

async function requestJson(url, signal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal.aborted) controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timeout = window.setTimeout(abort, 15000);
    try {
        const response = await fetch(url, { headers: { Accept: "application/json" }, credentials: "omit", signal: controller.signal });
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.error) {
            if (response.status === 429) throw new Error("Open-Meteo is limiting requests. Wait before retrying.");
            throw new Error(data?.reason ? "Open-Meteo: " + data.reason : `Open-Meteo returned HTTP ${response.status}. Please retry.`);
        }
        if (!data || typeof data !== "object") throw new Error("Open-Meteo returned an unreadable response. Please retry.");
        return data;
    } catch (error) {
        if (error instanceof TypeError) throw new Error("Open-Meteo could not be reached. Check your connection and retry.");
        throw error;
    } finally {
        window.clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
    }
}

function normalizeLocation(result) {
    if (!result || typeof result.name !== "string" || !result.name.trim() || result.name.length > 120) return null;
    if (typeof result.latitude !== "number" || typeof result.longitude !== "number" || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude) || Math.abs(result.latitude) > 90 || Math.abs(result.longitude) > 180) return null;
    const text = value => typeof value === "string" ? value.slice(0, 120) : "";
    return { name: result.name.trim(), latitude: result.latitude, longitude: result.longitude, timezone: validTimezone(result.timezone) ? result.timezone : null, admin1: text(result.admin1), country: text(result.country), country_code: /^[A-Z]{2}$/.test(result.country_code) ? result.country_code : "" };
}

async function searchLocations() {
    const query = document.getElementById("locationQuery").value.trim();
    const status = document.getElementById("locationSearchStatus");
    const results = document.getElementById("locationResults");
    const retry = document.getElementById("retryLocationSearch");
    geocodingController?.abort();
    const version = ++geocodingVersion;
    results.replaceChildren();
    retry.hidden = true;
    results.setAttribute("aria-busy", "false");
    if (query.length < 2 || query.length > 120 || !/[\p{L}\p{N}]/u.test(query)) {
        status.textContent = "Enter a city or postal code with at least two characters.";
        document.getElementById("locationQuery").focus();
        return;
    }
    lastSearch = query;
    geocodingController = new AbortController();
    results.setAttribute("aria-busy", "true");
    status.textContent = "Resolving location / " + query;
    const parameters = new URLSearchParams({ name: query, count: "5", language: "en", format: "json" });
    try {
        const data = await requestJson(GEOCODING_URL + "?" + parameters, geocodingController.signal);
        if (version !== geocodingVersion) return;
        if (data.results !== undefined && !Array.isArray(data.results)) throw new Error("Open-Meteo returned malformed location results. Please retry.");
        const locations = (data.results || []).slice(0, 5).map(normalizeLocation).filter(Boolean);
        if (data.results?.length && !locations.length) throw new Error("The location results did not contain usable names and coordinates. Please retry.");
        status.textContent = locations.length ? `${locations.length} matching location${locations.length === 1 ? "" : "s"}. Choose a location below.` : "No location found. Try another city name or postal code.";
        locations.forEach(location => {
            const item = document.createElement("li");
            const button = document.createElement("button");
            button.type = "button";
            button.className = "location-result";
            appendValue(button, "location-result-name", location.name + (location.country_code ? " / " + location.country_code : ""));
            appendValue(button, "location-result-region", [location.admin1, location.country].filter(Boolean).join(", ") || "Region not supplied");
            appendValue(button, "location-result-coordinates", coordinates(location));
            button.addEventListener("click", () => chooseLocation(location));
            item.append(button);
            results.append(item);
        });
    } catch (error) {
        if (version !== geocodingVersion) return;
        status.textContent = error.name === "AbortError" ? "Location search timed out. Retry when the connection is available." : error.message;
        retry.hidden = false;
    } finally {
        if (version === geocodingVersion) results.setAttribute("aria-busy", "false");
    }
}

document.getElementById("locationSearch").addEventListener("submit", event => { event.preventDefault(); searchLocations(); });
document.getElementById("retryLocationSearch").addEventListener("click", () => { document.getElementById("locationQuery").value = lastSearch; searchLocations(); });
window.addEventListener("popstate", () => {
    geocodingController?.abort();
    ++geocodingVersion;
    document.getElementById("locationResults").replaceChildren();
    document.getElementById("locationResults").setAttribute("aria-busy", "false");
    document.getElementById("retryLocationSearch").hidden = true;
    selectedLocation = locationFromUrl();
    document.getElementById("locationSearchStatus").textContent = "Location restored / " + selectedLocation.name;
    showLocation();
    loadForecast();
});
