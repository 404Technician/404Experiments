# Weather Signal: Best, Netherlands

This experiment uses the public Open-Meteo Forecast API to show a 14-day weather forecast for Best, North Brabant, Netherlands.

## Location and request

The location is fixed to Best, North Brabant, Netherlands at latitude `51.51` and longitude `5.39`; the page does not request browser geolocation. It uses the public Forecast endpoint without an API key:

```text
https://api.open-meteo.com/v1/forecast?latitude=51.51&longitude=5.39&daily=weather_code%2Ctemperature_2m_max%2Ctemperature_2m_min%2Capparent_temperature_max%2Capparent_temperature_min%2Cprecipitation_probability_max%2Cprecipitation_sum%2Cwind_speed_10m_max%2Cwind_gusts_10m_max%2Csunrise%2Csunset&timezone=Europe%2FAmsterdam&forecast_days=14&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm
```

The page uses `timezone=Europe/Amsterdam` and `forecast_days=14`, even though Open-Meteo supports up to 16 forecast days. The display intentionally presents only 14 days.

The daily forecast includes WMO weather code, maximum and minimum air temperature, apparent maximum and minimum temperature, maximum precipitation probability, precipitation sum, maximum wind speed and gusts, sunrise, and sunset. Weather codes are translated to readable condition names in the interface.

## Access and changing data

Open-Meteo is queried directly from the browser without an API key or authentication. No API credentials are stored. Forecast values are live and can change between refreshes; the service can be unavailable or return incomplete data, which the page reports without hiding available days.