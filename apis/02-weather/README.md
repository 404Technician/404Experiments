# Weather Signal: location search and relative humidity

The existing cinematic weather sequence now follows a location you choose. **Best, North Brabant, Netherlands (`51.51`, `5.39`) remains the default starting location**, rather than a fixed forecast. Search for a city or postal code, review the matching regions/countries/coordinates, and explicitly choose a result. Browser geolocation is never requested. No localStorage or private credentials are used.

## Geocoding

Official endpoint: `https://geocoding-api.open-meteo.com/v1/search`

Exact request pattern:

```text
https://geocoding-api.open-meteo.com/v1/search?name={URL-encoded user query}&count=5&language=en&format=json
```

The input must contain at least two characters and a letter or number. Up to five results are shown; even a single result requires explicit selection. The picker shows the available name, region, country/code, and coordinates so ambiguous matches are not silently selected. Invalid names or out-of-range/non-numeric coordinates are rejected. Search failures have an independent retry; no matches do not erase the current forecast.

## Forecast

Official endpoint: `https://api.open-meteo.com/v1/forecast`

All readings use **one forecast request** for the selected latitude/longitude:

```text
latitude={selected latitude}
longitude={selected longitude}
timezone=auto
forecast_days=14
temperature_unit=celsius
wind_speed_unit=kmh
precipitation_unit=mm
current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m
hourly=relative_humidity_2m
daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset
```

Parameters are encoded with `URLSearchParams`. No API key is required for the public endpoints used by this experiment. Current conditions show temperature, WMO condition, relative humidity, and wind speed. The existing 14-day forecast, WMO descriptions, selectable details, apparent temperatures, precipitation, wind/gusts, and sunrise/sunset are retained.

The sequence always renders exactly 14 consecutive local dates when a usable forecast is received. Missing daily dates/values have unavailable readings (`—`), not invented weather. A wholly unavailable or malformed forecast shows an error and Refresh instead of fabricated forecast cards.

## Relative humidity and local time

`relative_humidity_2m` is requested both hourly and current. For daily values, the client groups the hourly timestamps by their **local calendar-date prefix**. Open-Meteo's `timezone=auto` response supplies local ISO timestamps, so the implementation does not convert them through the browser's timezone or UTC. It uses only numeric, finite relative-humidity values in the inclusive range 0–100 and valid local timestamps.

For each day:

- Minimum = smallest valid hourly relative-humidity value.
- Maximum = largest valid hourly relative-humidity value.
- Average = sum of valid hourly values divided by their count.

No missing sample is treated as zero. Missing samples are excluded; a day with no valid samples displays `—`. Calculations keep their precision and are rounded only for displayed percentages. The card shows average RH with an accessible “Average relative humidity” label. Day detail shows average/low/high. Relative humidity is separate from precipitation probability and is never taken from the Climate API.

The API's returned timezone is authoritative. The geocoder timezone is shown while the forecast resolves, and `timezone=auto` also handles bookmarked coordinates. “Today” is calculated in that location's timezone. Forecast calendar-date formatting uses a neutral UTC anchor only to format the supplied date without shifting it; sunrise/sunset and current observation time are displayed directly as local clock times. Variable-length/DST days use the hourly samples returned for that local date without assuming exactly 24 values.

## URL and reception state

Selecting a result writes a shareable query, for example:

```text
?lat=51.44083&lon=5.47778&name=Eindhoven%2C+Netherlands
```

Only coordinates and a human-readable name/country label are stored. On opening a shared link, coordinates and name are validated; missing/invalid values fall back to Best. The forecast resolves the timezone automatically. Browser Back/Forward restores the URL location.

On location change, old forecasts/current/detail values are cleared before reception, so old-city readings cannot appear under a new location. If reception fails, the selected location remains visible and Refresh retries it. Requests time out after 15 seconds, cancellation prevents superseded requests from replacing newer data, and HTTP/rate-limit/network/malformed/partial-data states remain readable. No artificial response delay, polling, or fake fallback data is added.

Official documentation checked for this update:

- [Geocoding API](https://open-meteo.com/en/docs/geocoding-api)
- [Forecast API](https://open-meteo.com/en/docs)

## Verification

Verify Best, Eindhoven, Amsterdam, Berlin, Tokyo, New York, an ambiguous place name, and a postal code. Check that selected coordinates drive the single forecast request, the timezone and “Today” follow the location, exactly 14 dates render, and current/daily humidity stays distinct from rain probability. Exercise no results, invalid input, malformed geocoding, network/HTTP failures, retries, superseded responses, missing hourly values, and share-link validation. Inspect desktop 1440px, tablet 768px, and mobile 375px for overflow and keyboard usability, along with reduced motion and all four global categories.

### Repeatable browser checks

`tests/browser.cjs` uses Playwright and test-only responses; no fallback weather ships with the page. It starts a local server and checks location selection, request parameters, humidity maths, missing samples, local-day/DST handling, URL validation/Back, concurrent requests, error recovery, keyboard access, navigation, and all three viewport sizes.

Install browser tooling outside the repository and run:

```powershell
npm install --prefix "$env:TEMP\404-browser-tools" playwright
& "$env:TEMP\404-browser-tools\node_modules\.bin\playwright.cmd" install chromium
$env:NODE_PATH = "$env:TEMP\404-browser-tools\node_modules"
node apis/02-weather/tests/browser.cjs
```

Live checks are separate from these controlled cases and use the real public services.
