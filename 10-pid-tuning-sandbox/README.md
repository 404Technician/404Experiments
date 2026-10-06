# PID Tuning Sandbox

Experiment 10 is an educational browser sandbox for seeing how proportional, integral, and derivative gains affect a simple simulated first-order process. Change Kp, Ki, or Kd to rerun the simulation immediately, choose a preset, or run/reset manually.

## PID terms in simple terms

- **P — Proportional:** reacts to the current difference between setpoint and process value. Increasing Kp generally makes the response stronger and faster, but excessive gain can overshoot or oscillate.
- **I — Integral:** accumulates past error. It can eliminate persistent offset, but too much integral action can cause overshoot or slow recovery.
- **D — Derivative:** reacts to how quickly the error changes. It can add damping in this idealized model, but real derivative action is sensitive to noisy measurements.

## Response metrics

- **Overshoot:** the largest amount the process value rises above the setpoint, as a percentage of the setpoint step.
- **Settling time:** the first time after which the process value remains within ±2% of the step size around the setpoint through the end of the simulation. “Not settled” means it did not stay in that band during the simulated duration.
- **Final error:** setpoint minus process value at the final simulation time; a positive result means the process ended below the setpoint.

## Simplified process model

The sandbox uses a first-order lag model with a fixed process gain and time constant. A discrete PID controller calculates output from current error, accumulated error, and filtered change in error. Integral accumulation and controller output are bounded; gains and setpoint magnitude have sandbox limits, and the simulation checks for non-finite or extreme values so a bad configuration cannot crash the page. The output is plotted on the same scale as setpoint and process value for simple comparison.

This is intentionally simple and is **not a replacement for tuning a real process**. Real HVAC and industrial systems can include transport delays, nonlinearities, actuator limits, sensor noise, changing loads, interactions, and safety constraints. Use validated procedures and equipment guidance for real systems.

## Presets

- **Under-tuned:** deliberately slow response.
- **Aggressive:** high gain to demonstrate a strong, potentially oscillatory response.
- **Oscillating:** high proportional action with little integral or damping.
- **Reasonably tuned:** a moderate example intended to settle smoothly in this simplified model.