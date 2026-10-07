# Weather Signal: Best, Netherlands

This experiment uses the public Open-Meteo Forecast API to show a 14-day weather forecast for Best, North Brabant, Netherlands.

## Location and request

The location is fixed to latitude `51.51` and longitude `5.39`; the page does not request browser geolocation. The request uses `timezone=Europe/Amsterdam`, Celsius, km/h, millimetres, and `forecast_days=14`.

The daily forecast includes WMO weather code, maximum and minimum air temperature, apparent maximum and minimum temperature, maximum precipitation probability, precipitation sum, maximum wind speed and gusts, sunrise, and sunset. Weather codes are translated to readable condition names in the interface.

## Access and changing data

Open-Meteo is queried directly from the browser without an API key or authentication. No API credentials are stored. Forecast values are live and may change between updates; the service can be unavailable or return incomplete data, which the page reports without hiding available days.