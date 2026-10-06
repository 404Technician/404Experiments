# Signal Converter

Experiment 07 converts between standard 4–20 mA and 0–10 V signals and engineering values. Each conversion has its own engineering minimum, maximum, and unit. Results update as inputs change.

## Features

- Convert 4–20 mA to an engineering value and back
- Convert 0–10 V to an engineering value and back
- Configure negative or positive engineering ranges and units
- Validate missing values and invalid engineering ranges
- Extrapolate values outside the configured range instead of clamping them
- Display results to a maximum of four decimal places

## Scaling formulas

For a signal with lower and upper endpoints `Smin` and `Smax`, and engineering endpoints `Emin` and `Emax`:

- Signal to engineering value: `E = Emin + ((S - Smin) / (Smax - Smin)) × (Emax - Emin)`
- Engineering value to signal: `S = Smin + ((E - Emin) / (Emax - Emin)) × (Smax - Smin)`

For 4–20 mA, `Smin = 4 mA` and `Smax = 20 mA`. For 0–10 V, `Smin = 0 V` and `Smax = 10 V`. The engineering limits must be finite, and the minimum must be less than the maximum. The formulas are not clamped, so values beyond either endpoint produce extrapolated results.

## Example

Scale 4–20 mA to 0–100 °C. At 12 mA:

`E = 0 + ((12 - 4) / (20 - 4)) × (100 - 0) = 50 °C`

The reverse conversion for 50 °C returns 12 mA.