const R0 = 100;
const A = 3.9083e-3;
const B = -5.775e-7;
const C = -4.183e-12;
const MIN_TEMPERATURE = -200;
const MAX_TEMPERATURE = 850;

const resistanceInput = document.getElementById("resistanceInput");
const temperatureInput = document.getElementById("temperatureInput");
const temperatureResult = document.getElementById("temperatureResult");
const resistanceResult = document.getElementById("resistanceResult");
const resistanceMessage = document.getElementById("resistanceMessage");
const temperatureMessage = document.getElementById("temperatureMessage");

function resistanceAtTemperature(temperature) {
    const quadraticScale = 1 + A * temperature + B * temperature ** 2;

    if (temperature >= 0) {
        return R0 * quadraticScale;
    }

    return R0 * (quadraticScale + C * (temperature - 100) * temperature ** 3);
}

function formatValue(value) {
    const roundedZero = Math.abs(value) < 0.005 ? 0 : value;
    return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(roundedZero);
}

function temperatureAtResistance(resistance) {
    let low = MIN_TEMPERATURE;
    let high = MAX_TEMPERATURE;

    for (let iteration = 0; iteration < 80; iteration += 1) {
        const midpoint = (low + high) / 2;

        if (resistanceAtTemperature(midpoint) < resistance) {
            low = midpoint;
        } else {
            high = midpoint;
        }
    }

    return (low + high) / 2;
}

function convertResistanceToTemperature() {
    const rawResistance = resistanceInput.value.trim();
    const resistance = Number(rawResistance);
    const minimumResistance = resistanceAtTemperature(MIN_TEMPERATURE);
    const maximumResistance = resistanceAtTemperature(MAX_TEMPERATURE);

    temperatureResult.textContent = "—";
    resistanceMessage.textContent = "";

    if (rawResistance === "" || !Number.isFinite(resistance)) {
        resistanceMessage.textContent = "Enter a valid resistance in ohms.";
        return;
    }

    const boundaryRoundingTolerance = 0.005;
    if (resistance < minimumResistance - boundaryRoundingTolerance ||
        resistance > maximumResistance + boundaryRoundingTolerance) {
        resistanceMessage.textContent = `Outside the supported range of ${formatValue(minimumResistance)} to ${formatValue(maximumResistance)} Ω (−200 to 850 °C).`;
        return;
    }

    const supportedResistance = Math.min(maximumResistance, Math.max(minimumResistance, resistance));
    temperatureResult.textContent = `${formatValue(temperatureAtResistance(supportedResistance))} °C`;
}

function convertTemperatureToResistance() {
    const rawTemperature = temperatureInput.value.trim();
    const temperature = Number(rawTemperature);

    resistanceResult.textContent = "—";
    temperatureMessage.textContent = "";

    if (rawTemperature === "" || !Number.isFinite(temperature)) {
        temperatureMessage.textContent = "Enter a valid temperature in °C.";
        return;
    }

    if (temperature < MIN_TEMPERATURE || temperature > MAX_TEMPERATURE) {
        temperatureMessage.textContent = "Outside the supported range of −200 to 850 °C.";
        return;
    }

    resistanceResult.textContent = `${formatValue(resistanceAtTemperature(temperature))} Ω`;
}

document.getElementById("resistanceRange").textContent =
    `${formatValue(resistanceAtTemperature(MIN_TEMPERATURE))} to ${formatValue(resistanceAtTemperature(MAX_TEMPERATURE))} Ω`;

resistanceInput.addEventListener("input", convertResistanceToTemperature);
temperatureInput.addEventListener("input", convertTemperatureToResistance);

convertResistanceToTemperature();
convertTemperatureToResistance();