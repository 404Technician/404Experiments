# PT100 Converter

Experiment 08 converts PT100 resistance in ohms to temperature in degrees Celsius and converts temperature back to resistance. It uses the IEC 60751 Callendar–Van Dusen (CVD) equation over the nominal range −200 °C to +850 °C.

## What PT100 means

PT describes a platinum resistance temperature detector (RTD). 100 means the sensor has a nominal resistance of 100 Ω at 0 °C (`R0 = 100 Ω`). As temperature changes, the resistance changes predictably, allowing temperature to be calculated from a resistance measurement.

## IEC 60751 Callendar–Van Dusen equations

The converter uses the standard PT100 coefficients:

- `A = 3.9083 × 10⁻³ °C⁻¹`
- `B = −5.775 × 10⁻⁷ °C⁻²`
- `C = −4.183 × 10⁻¹² °C⁻⁴`

For temperatures at or above 0 °C:

`R(T) = R0 × (1 + A×T + B×T²)`

For temperatures below 0 °C:

`R(T) = R0 × (1 + A×T + B×T² + C×(T − 100)×T³)`

Resistance-to-temperature conversion numerically inverts this nonlinear equation using bisection over the supported IEC 60751 temperature range. Values outside the supported resistance or temperature range are reported rather than extrapolated.

## Example

At `T = 0 °C`, the equation gives:

`R(0) = 100 × (1 + 0 + 0) = 100.00 Ω`

## Measurement note

These are nominal sensor calculations. Real measurement accuracy also depends on lead-wire resistance and the measurement configuration: 2-wire measurements include more lead resistance error, while 3-wire and 4-wire configurations compensate for lead resistance to varying degrees.