const signalType = document.getElementById("signalType");
const engineeringMinimum = document.getElementById("engineeringMinimum");
const engineeringMaximum = document.getElementById("engineeringMaximum");
const engineeringUnit = document.getElementById("engineeringUnit");
const measuredSignal = document.getElementById("measuredSignal");
const lowFaultThreshold = document.getElementById("lowFaultThreshold");
const highFaultThreshold = document.getElementById("highFaultThreshold");
const currentThresholds = document.getElementById("currentThresholds");
const signalUnit = document.getElementById("signalUnit");
const engineeringResult = document.getElementById("engineeringResult");
const spanResult = document.getElementById("spanResult");
const statusBadge = document.getElementById("statusBadge");
const diagnosticExplanation = document.getElementById("diagnosticExplanation");
const validationMessage = document.getElementById("validationMessage");

const signalRanges = {
    current: { minimum: 4, maximum: 20, unit: "mA" },
    voltage: { minimum: 0, maximum: 10, unit: "V" }
};

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });

function formatValue(value) {
    const roundedZero = Math.abs(value) < 0.00005 ? 0 : value;
    return numberFormatter.format(roundedZero);
}

function setStatus(status, explanation) {
    statusBadge.textContent = status;
    statusBadge.className = `status-badge status-${status.toLowerCase()}`;
    diagnosticExplanation.textContent = explanation;
}

function updateSignalType() {
    const isCurrent = signalType.value === "current";
    const range = signalRanges[signalType.value];
    signalUnit.textContent = range.unit;
    currentThresholds.hidden = !isCurrent;
    measuredSignal.setAttribute("aria-label", `Measured signal in ${range.unit}`);
    measuredSignal.value = isCurrent ? "12" : "5";
    calculateDiagnostics();
}

function calculateDiagnostics() {
    const range = signalRanges[signalType.value];
    const minimum = Number(engineeringMinimum.value);
    const maximum = Number(engineeringMaximum.value);
    const signal = Number(measuredSignal.value);
    const unit = engineeringUnit.value.trim();

    engineeringResult.textContent = "—";
    spanResult.textContent = "—";
    validationMessage.textContent = "";

    if (engineeringMinimum.value.trim() === "" || engineeringMaximum.value.trim() === "" ||
        !Number.isFinite(minimum) || !Number.isFinite(maximum)) {
        setStatus("Warning", "Enter finite engineering minimum and maximum values.");
        validationMessage.textContent = "Engineering limits must be valid numbers.";
        return;
    }

    if (minimum >= maximum) {
        setStatus("Warning", "The engineering range is invalid, so no scaled value can be calculated.");
        validationMessage.textContent = "Engineering minimum must be less than engineering maximum.";
        return;
    }

    if (unit === "") {
        setStatus("Warning", "Enter an engineering unit before interpreting the scaled value.");
        validationMessage.textContent = "Engineering unit cannot be empty.";
        return;
    }

    if (measuredSignal.value.trim() === "" || !Number.isFinite(signal)) {
        setStatus("Warning", "Enter a valid measured signal value.");
        validationMessage.textContent = `Measured signal must be a valid value in ${range.unit}.`;
        return;
    }

    const percentage = ((signal - range.minimum) / (range.maximum - range.minimum)) * 100;
    const engineeringValue = minimum + (percentage / 100) * (maximum - minimum);
    engineeringResult.textContent = `${formatValue(engineeringValue)} ${unit}`;
    spanResult.textContent = `${formatValue(percentage)}%`;

    if (signalType.value === "current") {
        const lowFault = Number(lowFaultThreshold.value);
        const highFault = Number(highFaultThreshold.value);

        if (lowFaultThreshold.value.trim() === "" || highFaultThreshold.value.trim() === "" ||
            !Number.isFinite(lowFault) || !Number.isFinite(highFault)) {
            setStatus("Warning", "Enter valid configurable 4–20 mA fault thresholds.");
            validationMessage.textContent = "Fault thresholds must be valid numbers.";
            return;
        }

        if (lowFault >= range.minimum || highFault <= range.maximum || lowFault >= highFault) {
            setStatus("Warning", "The fault thresholds must be below 4 mA and above 20 mA respectively.");
            validationMessage.textContent = "Use a low-fault threshold below 4 mA and a high-fault threshold above 20 mA.";
            return;
        }

        if (signal <= lowFault) {
            setStatus("Fault", `Very low current: at or below the configured ${formatValue(lowFault)} mA example threshold. Possible loop fault; check device-specific limits.`);
        } else if (signal < range.minimum) {
            setStatus("Warning", "Below normal 4–20 mA range (below 4 mA) but above the configured low-fault threshold.");
        } else if (signal <= range.maximum) {
            setStatus("Normal", "Within the nominal 4–20 mA operating range.");
        } else if (signal < highFault) {
            setStatus("Warning", "Above normal 4–20 mA range (above 20 mA) but below the configured high-fault threshold.");
        } else {
            setStatus("Fault", `Very high current: at or above the configured ${formatValue(highFault)} mA example threshold. Possible fault; check device-specific limits.`);
        }
        return;
    }

    if (signal < range.minimum) {
        setStatus("Warning", "Below the nominal 0–10 V range. Voltage fault thresholds vary by input hardware and are not inferred here.");
    } else if (signal <= range.maximum) {
        setStatus("Normal", "Within the nominal 0–10 V range. Voltage input fault detection is less standardized than 4–20 mA loop diagnostics.");
    } else {
        setStatus("Warning", "Above the nominal 0–10 V range. Check the configured input limits and hardware specifications.");
    }
}

signalType.addEventListener("change", updateSignalType);
[engineeringMinimum, engineeringMaximum, engineeringUnit, measuredSignal, lowFaultThreshold, highFaultThreshold]
    .forEach(input => input.addEventListener("input", calculateDiagnostics));

calculateDiagnostics();