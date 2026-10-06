const R0 = 100;
const A = 3.9083e-3;
const B = -5.775e-7;
const C = -4.183e-12;
const MIN_TEMPERATURE = -200;
const MAX_TEMPERATURE = 850;

const resistanceInput = document.getElementById("resistanceInput");
const measurementConfig = document.getElementById("measurementConfig");
const leadResistanceInput = document.getElementById("leadResistanceInput");
const temperatureInput = document.getElementById("temperatureInput");
const temperatureResult = document.getElementById("temperatureResult");
const resistanceResult = document.getElementById("resistanceResult");
const resistanceMessage = document.getElementById("resistanceMessage");
const temperatureMessage = document.getElementById("temperatureMessage");
const measuredResistanceResult = document.getElementById("measuredResistanceResult");
const compensatedResistanceResult = document.getElementById("compensatedResistanceResult");
const leadMessage = document.getElementById("leadMessage");

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
    const rawLeadResistance = leadResistanceInput.value.trim();
    const leadResistance = Number(rawLeadResistance);
    const configuration = measurementConfig.value;
    const minimumResistance = resistanceAtTemperature(MIN_TEMPERATURE);
    const maximumResistance = resistanceAtTemperature(MAX_TEMPERATURE);

    temperatureResult.textContent = "—";
    measuredResistanceResult.textContent = "—";
    compensatedResistanceResult.textContent = "—";
    resistanceMessage.textContent = "";
    leadMessage.textContent = "";

    if (rawResistance === "" || !Number.isFinite(resistance)) {
        resistanceMessage.textContent = "Enter a valid resistance in ohms.";
        return;
    }

    if (resistance < 0) {
        resistanceMessage.textContent = "Resistance cannot be negative.";
        return;
    }

    if (configuration === "2-wire" && (!Number.isFinite(leadResistance) || leadResistance < 0)) {
        leadMessage.textContent = "Lead resistance must be zero or a positive value.";
        return;
    }

    const correction = configuration === "2-wire" ? leadResistance : 0;
    const compensatedResistance = resistance - correction;
    measuredResistanceResult.textContent = `${formatValue(resistance)} Ω`;
    compensatedResistanceResult.textContent = `${formatValue(compensatedResistance)} Ω`;

    if (compensatedResistance < 0) {
        resistanceMessage.textContent = "Lead correction exceeds the measured resistance; compensated PT100 resistance cannot be negative.";
        return;
    }

    const boundaryRoundingTolerance = 0.005;
    if (compensatedResistance < minimumResistance - boundaryRoundingTolerance ||
        compensatedResistance > maximumResistance + boundaryRoundingTolerance) {
        resistanceMessage.textContent = `Outside the supported range of ${formatValue(minimumResistance)} to ${formatValue(maximumResistance)} Ω (−200 to 850 °C).`;
        return;
    }

    const supportedResistance = Math.min(maximumResistance, Math.max(minimumResistance, compensatedResistance));
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

function updateConfigurationGuidance() {
    const configuration = measurementConfig.value;
    const leadLabel = document.querySelector(".lead-label");
    const leadHint = document.getElementById("leadHint");
    const guidance = document.getElementById("configurationGuidance");

    if (configuration === "2-wire") {
        leadLabel.textContent = "Total added lead resistance (2-wire correction)";
        leadHint.textContent = "Both lead wires contribute to the measurement error. Enter their combined resistance to estimate a software correction, or leave blank for none.";
        guidance.textContent = "Software correction is an estimate based on the lead resistance you enter; it is not an electrical 2-wire compensation circuit.";
    } else if (configuration === "3-wire") {
        leadLabel.textContent = "Lead resistance (not applied in 3-wire mode)";
        leadHint.textContent = "A real 3-wire instrument compensates when its lead resistances are approximately equal.";
        guidance.textContent = "This setting provides guidance only. Proper 3-wire compensation happens in the measuring circuit; no software correction is applied.";
    } else {
        leadLabel.textContent = "Lead resistance (not applied in 4-wire mode)";
        leadHint.textContent = "A proper 4-wire Kelvin measurement rejects lead resistance electrically.";
        guidance.textContent = "No manual lead correction is applied in 4-wire mode.";
    }

    convertResistanceToTemperature();
}

function updateCompensationExample() {
    const sensorResistance = resistanceAtTemperature(100);
    const measuredResistance = sensorResistance + 1;
    const uncorrectedTemperature = temperatureAtResistance(measuredResistance);

    document.getElementById("exampleSensorResistance").textContent = `${formatValue(sensorResistance)} Ω`;
    document.getElementById("exampleMeasuredResistance").textContent = `${formatValue(measuredResistance)} Ω`;
    document.getElementById("exampleUncorrectedTemperature").textContent = `${formatValue(uncorrectedTemperature)} °C`;
    document.getElementById("exampleCorrectedTemperature").textContent = `${formatValue(temperatureAtResistance(measuredResistance - 1))} °C`;
}

resistanceInput.addEventListener("input", convertResistanceToTemperature);
leadResistanceInput.addEventListener("input", convertResistanceToTemperature);
measurementConfig.addEventListener("change", updateConfigurationGuidance);
temperatureInput.addEventListener("input", convertTemperatureToResistance);

updateConfigurationGuidance();
updateCompensationExample();
convertResistanceToTemperature();
convertTemperatureToResistance();