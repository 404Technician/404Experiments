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

These are nominal sensor calculations. Real field accuracy also depends on transmitter/input accuracy, cable resistance balance, sensor tolerance, and wiring quality.

## Measurement configurations and lead compensation

- **2-wire:** Both conductors are in series with the RTD. Their combined resistance adds to the measured resistance and, if left uncorrected, appears as a higher temperature. The converter's optional lead input is the **total resistance of both leads**; selecting 2-wire subtracts that entered value from the measured resistance before applying the IEC 60751 inverse. Leave the field blank or enter zero for no correction. This is a software estimate, not an electrical compensation circuit, and it is only as accurate as the lead-resistance estimate.
- **3-wire:** A proper instrument compensates lead resistance through its 3-wire measurement circuit, assuming the relevant lead resistances are approximately equal. The converter explains this mode but does not claim to reproduce the circuit or apply software lead correction.
- **4-wire:** A proper Kelvin measurement separates current and voltage-sensing paths, effectively removing lead resistance from the measured sensor resistance. The converter does not apply a manual correction in 4-wire mode.

### 2-wire example

At 100 °C, a nominal PT100 is approximately 138.51 Ω. With 1.0 Ω total lead resistance, the instrument reads approximately 139.51 Ω. Without correction, that reads as approximately 102.64 °C. Subtracting the estimated 1.0 Ω restores the calculated temperature to 100.00 °C.

Manual compensation cannot replace suitable wiring or a proper 3-wire/4-wire measurement. Actual accuracy depends on the lead estimate and cable resistance balance as well as sensor tolerance, wiring quality, and transmitter/input accuracy.