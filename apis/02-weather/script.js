const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const FORECAST_DAYS = 14;
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
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat("en-GB", options).format(date);
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
    card.setAttribute("aria-label", `${formatDate(day.date, { weekday: "long", day: "numeric", month: "long" })}, ${state.label}, high ${formatNumber(day.high, "°")}, low ${formatNumber(day.low, "°")}`);

    const date = document.createElement("span");
    date.className = "forecast-date";
    appendValue(date, "forecast-weekday", formatDate(day.date, { weekday: "short" }));
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

    card.append(date, glyph, label, temperatures, lower);
    return card;
}

function renderSelectedDay(day) {
    const state = weatherForCode(day.weather_code);
    document.getElementById("detailTitle").textContent = formatDate(day.date, { weekday: "long", day: "numeric", month: "long" });
    document.getElementById("detailCondition").textContent = state.label;
    document.getElementById("detailFeels").textContent = `${formatNumber(day.apparent_max, "°")} / ${formatNumber(day.apparent_min, "°")} C`;
    document.getElementById("detailPrecipitation").textContent = `${formatNumber(day.precipitation_sum, " mm")} / ${formatNumber(day.precipitation_probability, "%")} chance`;
    document.getElementById("detailWind").textContent = `${formatNumber(day.wind, " km/h")} / ${formatNumber(day.gusts, " km/h")} gusts`;
    document.getElementById("detailSunrise").textContent = formatTime(day.sunrise);
    document.getElementById("detailSunset").textContent = formatTime(day.sunset);
}

function renderForecast(daily) {
    const times = Array.isArray(daily.time) ? daily.time.slice(0, FORECAST_DAYS) : [];
    if (times.length === 0) throw new Error("empty-forecast");

    forecastDays = times.map((date, index) => ({
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
    }));

    forecastGrid.replaceChildren(...forecastDays.map(createForecastCard));
    forecastGrid.setAttribute("aria-busy", "false");
    forecastGrid.querySelector(".forecast-day")?.setAttribute("aria-pressed", "true");
    renderSelectedDay(forecastDays[0]);

    return times.length === FORECAST_DAYS && DAILY_FIELDS.every(field => {
        const values = daily[field];
        return Array.isArray(values) && values.length >= times.length && values
            .slice(0, times.length)
            .every(value => value !== null && value !== undefined && value !== "");
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
    refreshButton.disabled = true;
    weatherError.hidden = true;
    forecastGrid.setAttribute("aria-busy", "true");
    setStatus("loading", "Open-Meteo live feed");

    const parameters = new URLSearchParams({
        latitude: "51.51",
        longitude: "5.39",
        daily: DAILY_FIELDS.join(","),
        timezone: "Europe/Amsterdam",
        forecast_days: String(FORECAST_DAYS),
        temperature_unit: "celsius",
        wind_speed_unit: "kmh",
        precipitation_unit: "mm",
    });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch(`${FORECAST_URL}?${parameters}`, {
            headers: { Accept: "application/json" },
            credentials: "omit",
            signal: controller.signal,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.error) {
            const reason = data?.reason || data?.message;
            throw new Error(reason ? `Open-Meteo: ${reason}` : `Open-Meteo returned ${response.status}.`);
        }
        if (!data?.daily) throw new Error("The forecast response did not include daily data.");

        const complete = renderForecast(data.daily);
        const now = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date());
        setStatus(complete ? "ready" : "partial", complete ? `Live data // Updated ${now}` : "Partial forecast // Some values unavailable");
        if (!complete) {
            weatherError.textContent = "The response contained fewer than 14 complete days or some values were missing. Available data is shown.";
            weatherError.hidden = false;
        }
    } catch (error) {
        const message = error.name === "AbortError"
            ? "Open-Meteo did not respond in time. Try again shortly."
            : error.message === "Failed to fetch"
                ? "The forecast service could not be reached. Check your connection and try again."
                : error.message || "The forecast could not be loaded.";
        showFailure(message);
    } finally {
        window.clearTimeout(timeout);
        refreshButton.disabled = false;
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