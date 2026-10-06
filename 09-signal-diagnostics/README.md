# Signal Diagnostics

Experiment 09 converts a measured 4–20 mA or 0–10 V signal into an engineering value and reports the signal's percentage of span and a diagnostic status. The engineering minimum, maximum, and unit are configurable. Values outside the signal range are extrapolated rather than clamped.

## What diagnostics can and cannot tell you

The status compares a supplied signal reading with nominal signal limits and editable example thresholds. It can flag a reading as below range, normal, above range, or possibly fault-level. It cannot identify the root cause, verify wiring, prove that a sensor is healthy, or replace electrical measurements and equipment documentation.

## 4–20 mA live-zero diagnostics

The nominal 4 mA lower endpoint is a live zero: it is above zero current, leaving a region below the normal operating span that can be useful for indicating a very low current or possible loop fault. The example low-fault threshold defaults to 3.6 mA, and the high-fault threshold defaults to 21.0 mA. Both are editable examples, not universal limits. Exact fault limits depend on the transmitter, PLC, controller, input module, and configuration. Always check the connected equipment specifications.

Readings below 4 mA but above the configured low threshold, or above 20 mA but below the high threshold, are shown as warnings. Readings at/beyond those configured fault thresholds are labeled possible faults, not definitive diagnoses.

## 0–10 V diagnostics

Voltage mode marks readings below 0 V or above 10 V as warnings and readings within the nominal span as normal. Voltage input fault detection is generally less standardized than 4–20 mA loop diagnostics, so this tool does not apply universal voltage fault thresholds.

## Examples

- With a 0–100 °C engineering range, 12 mA is 50% of the 4–20 mA span and scales to 50 °C.
- 3.5 mA is below the default 3.6 mA example threshold and is flagged as a possible very-low-current loop fault. Use the limits specified by the devices in your system instead.
- With a −50 to 150 °C range, 2 mA is −12.5% of the 4–20 mA span and extrapolates to −75 °C. The tool keeps the calculated value and reports the signal as a possible low-current loop fault using the example threshold.
- At 5 V, a 0–10 V signal is at 50% of span. Values outside 0–10 V remain extrapolated and receive a warning.