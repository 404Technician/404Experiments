const DEFAULTS = {
    kp: 2,
    ki: 0.15,
    kd: 1,
    setpoint: 10,
    duration: 30
};

const PRESETS = {
    "under-tuned": { kp: 0.35, ki: 0.01, kd: 0, setpoint: 10, duration: 30 },
    aggressive: { kp: 20, ki: 10, kd: 0, setpoint: 10, duration: 30 },
    oscillating: { kp: 100, ki: 20, kd: 0, setpoint: 10, duration: 30 },
    "reasonably-tuned": { kp: 3, ki: 1, kd: 0, setpoint: 10, duration: 30 }
};

const inputElements = {
    kp: document.getElementById("kp"),
    ki: document.getElementById("ki"),
    kd: document.getElementById("kd"),
    setpoint: document.getElementById("setpoint"),
    duration: document.getElementById("duration")
};

const canvas = document.getElementById("responseChart");
const context = canvas.getContext("2d");
const validationMessage = document.getElementById("validationMessage");
let latestSimulation = null;

function getSettings() {
    const settings = {};

    for (const [key, input] of Object.entries(inputElements)) {
        const rawValue = input.value.trim();
        const value = Number(rawValue);
        if (rawValue === "" || !Number.isFinite(value)) {
            throw new Error(`${key.toUpperCase()} must be a finite number.`);
        }
        settings[key] = value;
    }

    if (settings.kp < 0 || settings.ki < 0 || settings.kd < 0) {
        throw new Error("PID gains must be zero or positive.");
    }
    if (settings.kp > 100 || settings.ki > 20 || settings.kd > 50) {
        throw new Error("Keep gains within the sandbox safety limits (Kp ≤ 100, Ki ≤ 20, Kd ≤ 50). ");
    }
    if (settings.duration < 1 || settings.duration > 300) {
        throw new Error("Simulation duration must be between 1 and 300 seconds.");
    }
    if (Math.abs(settings.setpoint) > 100000) {
        throw new Error("Setpoint magnitude must be 100,000 or less for a readable, stable plot.");
    }

    return settings;
}

function simulate(settings) {
    const timeStep = 0.05;
    const steps = Math.ceil(settings.duration / timeStep);
    const processTimeConstant = 3;
    const processGain = 1;
    const derivativeFilter = 0.2;
    const integralLimit = 500;
    const outputLimit = 100;
    const points = [];
    let processValue = 0;
    let integral = 0;
    let previousError = settings.setpoint - processValue;
    let filteredDerivative = 0;

    for (let index = 0; index <= steps; index += 1) {
        const time = Math.min(index * timeStep, settings.duration);
        const error = settings.setpoint - processValue;
        const rawDerivative = index === 0 ? 0 : (error - previousError) / timeStep;
        filteredDerivative += (timeStep / (derivativeFilter + timeStep)) *
            (rawDerivative - filteredDerivative);
        integral = Math.max(-integralLimit, Math.min(integralLimit, integral + error * timeStep));

        const unconstrainedOutput = settings.kp * error + settings.ki * integral + settings.kd * filteredDerivative;
        const output = Math.max(-outputLimit, Math.min(outputLimit, unconstrainedOutput));
        points.push({ time, setpoint: settings.setpoint, process: processValue, output });

        if (index === steps) {
            break;
        }

        const processRate = (processGain * output - processValue) / processTimeConstant;
        processValue += processRate * timeStep;

        if (!Number.isFinite(processValue) || Math.abs(processValue) > 1e9) {
            throw new Error("Simulation became numerically unstable. Reduce the gains and try again.");
        }
        previousError = error;
    }

    return points;
}

function calculateMetrics(points, setpoint) {
    const finalPoint = points[points.length - 1];
    const stepMagnitude = Math.abs(setpoint);
    const tolerance = Math.max(stepMagnitude * 0.02, 0.0001);
    const extreme = setpoint >= 0
        ? Math.max(...points.map(point => point.process))
        : Math.min(...points.map(point => point.process));
    const overshootAmount = setpoint >= 0 ? extreme - setpoint : setpoint - extreme;
    const overshoot = stepMagnitude === 0 ? 0 : Math.max(0, overshootAmount / stepMagnitude * 100);
    let lastOutsideBand = -1;

    for (let index = points.length - 1; index >= 0; index -= 1) {
        if (Math.abs(points[index].process - setpoint) > tolerance) {
            lastOutsideBand = index;
            break;
        }
    }
    const settlingIndex = lastOutsideBand + 1;
    const settlingTime = settlingIndex < points.length ? points[settlingIndex].time : null;

    return {
        overshoot,
        settlingTime,
        finalError: setpoint - finalPoint.process
    };
}

function drawChart(points) {
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(bounds.width, 1);
    const height = Math.max(bounds.height, 1);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    const padding = { left: 52, right: 18, top: 20, bottom: 36 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const duration = points[points.length - 1].time || 1;
    const allValues = points.flatMap(point => [point.setpoint, point.process, point.output]);
    let minimum = Math.min(...allValues);
    let maximum = Math.max(...allValues);
    const span = maximum - minimum || 1;
    minimum -= span * 0.1;
    maximum += span * 0.1;

    const xFor = time => padding.left + (time / duration) * plotWidth;
    const yFor = value => padding.top + ((maximum - value) / (maximum - minimum)) * plotHeight;

    context.font = "12px Arial, sans-serif";
    context.textBaseline = "middle";
    context.strokeStyle = "#e6ebec";
    context.fillStyle = "#667176";
    context.lineWidth = 1;

    for (let tick = 0; tick <= 4; tick += 1) {
        const fraction = tick / 4;
        const y = padding.top + fraction * plotHeight;
        const value = maximum - fraction * (maximum - minimum);
        context.beginPath();
        context.moveTo(padding.left, y);
        context.lineTo(width - padding.right, y);
        context.stroke();
        context.textAlign = "right";
        context.fillText(formatNumber(value), padding.left - 8, y);
    }

    for (let tick = 0; tick <= 4; tick += 1) {
        const time = duration * tick / 4;
        const x = xFor(time);
        context.beginPath();
        context.moveTo(x, padding.top);
        context.lineTo(x, height - padding.bottom);
        context.stroke();
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText(`${formatNumber(time)} s`, x, height - padding.bottom + 9);
    }

    drawSeries(points, "setpoint", "#758187", [5, 4], xFor, yFor);
    drawSeries(points, "process", "#147d78", [], xFor, yFor);
    drawSeries(points, "output", "#d68a19", [], xFor, yFor);
}

function drawSeries(points, key, color, dash, xFor, yFor) {
    context.beginPath();
    context.strokeStyle = color;
    context.lineWidth = key === "process" ? 2.5 : 1.8;
    context.setLineDash(dash);
    points.forEach((point, index) => {
        const x = xFor(point.time);
        const y = yFor(point[key]);
        if (index === 0) {
            context.moveTo(x, y);
        } else {
            context.lineTo(x, y);
        }
    });
    context.stroke();
    context.setLineDash([]);
}

function formatNumber(value) {
    const roundedZero = Math.abs(value) < 0.005 ? 0 : value;
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(roundedZero);
}

function updateMetrics(metrics) {
    document.getElementById("overshootMetric").textContent = `${formatNumber(metrics.overshoot)}%`;
    document.getElementById("settlingMetric").textContent = metrics.settlingTime === null
        ? "Not settled"
        : `${formatNumber(metrics.settlingTime)} s`;
    document.getElementById("finalErrorMetric").textContent = formatNumber(metrics.finalError);
}

function clearSimulationResults() {
    latestSimulation = null;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById("overshootMetric").textContent = "—";
    document.getElementById("settlingMetric").textContent = "—";
    document.getElementById("finalErrorMetric").textContent = "—";
}

function runSimulation() {
    validationMessage.textContent = "";
    document.getElementById("runState").textContent = "Running";
    document.getElementById("runState").classList.remove("error-state");

    try {
        const settings = getSettings();
        const points = simulate(settings);
        if (!points.length || points.some(point => !Object.values(point).every(Number.isFinite))) {
            throw new Error("Simulation produced invalid values. Check the settings and try again.");
        }

        latestSimulation = points;
        drawChart(points);
        updateMetrics(calculateMetrics(points, settings.setpoint));
        document.getElementById("runState").textContent = "Complete";
    } catch (error) {
        clearSimulationResults();
        validationMessage.textContent = error.message;
        document.getElementById("runState").textContent = "Check inputs";
        document.getElementById("runState").classList.add("error-state");
    }
}

function loadPreset(presetName) {
    const values = PRESETS[presetName];
    if (!values) {
        return;
    }

    Object.entries(values).forEach(([key, value]) => {
        inputElements[key].value = value;
    });
    runSimulation();
}

document.getElementById("runButton").addEventListener("click", runSimulation);
document.getElementById("resetButton").addEventListener("click", () => {
    Object.entries(DEFAULTS).forEach(([key, value]) => {
        inputElements[key].value = value;
    });
    document.getElementById("preset").value = "custom";
    runSimulation();
});
document.getElementById("preset").addEventListener("change", event => loadPreset(event.target.value));
Object.values(inputElements).forEach(input => input.addEventListener("input", () => {
    document.getElementById("preset").value = "custom";
    runSimulation();
}));
window.addEventListener("resize", () => {
    if (latestSimulation) {
        drawChart(latestSimulation);
    }
});

runSimulation();