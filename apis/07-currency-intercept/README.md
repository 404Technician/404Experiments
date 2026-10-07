# CURRENCY INTERCEPT

SIGNALS experiment 07: global reference exchange rates alongside Dutch national
fuel-price observations. Static HTML, CSS and browser JavaScript; no API keys,
dependencies or server-side credentials are required by the page.

## Frankfurter

Uses only the current v2 API at **https://api.frankfurter.dev/v2**:

- GET /currencies: current metadata array; reads iso_code, name and symbol.
- GET /rate/{base}/{quote}: latest pair observation, e.g. /rate/eur/usd.
  Reads date, base, quote and rate; currencies in request paths are lowercase.
- GET /rates?base=<base>&quotes=<quote>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>:
  bounded selected-pair history. Example:
  https://api.frankfurter.dev/v2/rates?base=eur&quotes=usd&from=2026-09-07&to=2026-10-07

Conversion is amount × returned rate, calculated client-side. No conversion
endpoint is called. The EUR/USD, EUR/GBP, EUR/CHF, EUR/JPY and EUR/CNY strip checks
metadata availability and handles each pair separately. No provider endpoints
are required: the API's default blended daily feed is used, with attribution
to Frankfurter rather than an assumed single provider.

Rates are daily/reference observations, not real-time market ticks. Rate dates
can reflect business-day publication timing. Age is shown when the latest
available observation is more than four calendar days old. Same-currency
selection is explained instead of inventing a source rate.

[Official documentation](https://frankfurter.dev/) and
[official agent reference](https://frankfurter.dev/llms.txt) verified 7 October
2026. The documentation states v1 is deprecated in favor of v2 (though it remains
available); v1 is intentionally avoided.

## CBS / Data Overheid

Dataset **80416ned**, OData base:
**https://opendata.cbs.nl/ODataApi/OData/80416ned**

Runtime requests:

- GET /TableInfos: reads value[0].Modified as the dataset update date.
  This is publication/update metadata, not the date of a fuel observation.
  Unavailable metadata does not suppress valid prices.
- GET /TypedDataSet?$filter=Perioden ge '<YYYYMMDD>' and Perioden le '<YYYYMMDD>'&$select=Perioden,BenzineEuro95_1,Diesel_2,Lpg_3&$top=400
  (query parameters are URL encoded).
  Example unencoded bounds: Perioden ge '20260907' and Perioden le '20261007'.
  Reads the value array and follows odata.nextLink only within this dataset's
  TypedDataSet endpoint; observations are sorted client-side.
  Latest values are independently found per fuel within a bounded 365-day
  query, so a missing latest value for one fuel does not erase other fuels.
  History requests only the selected 7, 30, 90 or 365 days ending today.

Exact properties inspected before implementation:

| Property | Meaning |
| --- | --- |
| Perioden | YYYYMMDD daily observation key |
| BenzineEuro95_1 | Benzine Euro95, euro/litre |
| Diesel_2 | Diesel, euro/litre |
| Lpg_3 | LPG, euro/litre |
| Modified | TableInfos dataset update timestamp |

Discovery requests, not extra runtime dependencies: GET /DataProperties
(verified keys, descriptions, euro/liter units and three decimals), GET /Perioden
(Key, Title, Status), GET /TableInfos (Source, Frequency, Period,
ShortDescription, Description, Modified), and GET /TypedDataSet.
Do not assume OData ordering: observations are explicitly sorted locally.

These are **national weighted average daily pump prices**, including VAT and
excise duties, supplied by **CBS / Travelcard BV**. They are definitive and
available from 1 January 2006. Daily values are **published weekly**, normally
Thursday for observations through Monday; holidays can shift publication.
They are not station-specific or live pump prices. Latest source age is visible
when over seven days. Missing/null/nonpositive fuel values are omitted from
calculations and break chart lines; they never become zero or a synthetic price.
An empty recent window is explained without substituting older observations.
The latest panel retains its separately dated national values.

The [Data Overheid dataset listing](https://data.overheid.nl/dataset/03b556cd-3049-49eb-a084-fc8b10a77b87)
confirms the public **CC BY 4.0** licence. Retain CBS / Travelcard attribution.

Live validation on **7 October 2026** observed:
- Latest observation: **28 September 2026**.
- Euro95: **€ 2.465/L**; Diesel: **€ 2.526/L**; LPG: **€ 0.956/L**.
- TableInfos.Modified: **2026-10-01T02:00:00** (no timezone asserted).
- 7D window: no observations; 30D: 22, 90D: 82, 1Y: 357 daily observations.
These values describe the validation run and are not fallback numbers in the app.

## Data interpretation

This combines two different signals: global currency reference rates and Dutch
national fuel-price statistics. Their publication frequencies are not
synchronized. Neither their juxtaposition nor their movement establishes
causation or offers market advice.

Window delta = latest valid value − first valid value.
Percentage delta = (delta / first valid value) × 100.
High and low use only available valid values. Fuel values have three decimals;
currency conversions have two, rate details six and trace metrics four.
Positive/negative movement colors are small cues, not trading instructions.
7D/30D/90D/1Y are inclusive date bounds (today minus 7/30/90/365 days through
today). A single observation has zero window movement and is labeled accordingly
in the currency trace.

Frankfurter metadata, selected rate, curated pairs, currency history, CBS latest
prices and CBS history have independent requests and retry handling. HTTP,
network, invalid JSON, malformed schemas, missing pairs, empty windows and
stale observations are handled without fake fallback data. Superseded requests
are aborted and guarded so rapid changes cannot overwrite the new selection.
Requests time out after 20 seconds. Currency and fuel visibility remain separate.

## Verification

With Node and Playwright available, from the repository root:

    node --check apis/07-currency-intercept/script.js
    node --check apis/07-currency-intercept/tests/browser.cjs
    node apis/07-currency-intercept/tests/browser.cjs
    node apis/07-currency-intercept/tests/browser.cjs --live
    git diff --check

If Playwright is installed outside the project, set NODE_PATH to its node_modules
directory. No new repository package/dependency is needed for the static page.

Controlled browser fixtures are confined to tests/browser.cjs. Checks cover
EUR/USD, EUR/GBP, USD/JPY, GBP/EUR, swapping, amounts, all four windows, independent
pair failures, percentage arithmetic, €/L formatting, null observations and
chart gaps, latest per-fuel dates, unavailable publication metadata, stale rates,
request races, independent source failures, retries, HTTP/network/JSON/schema
failures, empty windows, keyboard controls, reduced motion, global navigation,
1440/768/375px widths and horizontal overflow. Screenshots go to the OS temporary
directory. Live smoke checks validate actual sources and all history windows.
SIGNALS overview adds entry 07; NEXUS featured cards and ARCHIVE are unchanged.
