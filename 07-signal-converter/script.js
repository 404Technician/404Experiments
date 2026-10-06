const numberFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 4
});

function formatResult(value) {
    const roundedZero = Math.abs(value) < 0.00005 ? 0 : value;
    return numberFormatter.format(roundedZero);
}

function calculateConversion(card) {
    const minimumInput = card.querySelector(".engineering-min");
    const maximumInput = card.querySelector(".engineering-max");
    const unitInput = card.querySelector(".engineering-unit");
    const conversionInput = card.querySelector(".conversion-input");
    const inputUnit = card.querySelector(".input-unit");
    const result = card.querySelector(".conversion-result");
    const message = card.querySelector(".validation-message");

    const minimum = Number(minimumInput.value);
    const maximum = Number(maximumInput.value);
    const engineeringUnit = unitInput.value.trim();
    const value = Number(conversionInput.value);
    const direction = card.dataset.direction;
    const signalMinimum = Number(card.dataset.signalMin);
    const signalMaximum = Number(card.dataset.signalMax);
    const signalUnit = card.dataset.signalUnit;

    inputUnit.textContent = direction === "to-engineering" ? signalUnit : engineeringUnit;
    result.textContent = "—";

    if (minimumInput.value.trim() === "" || maximumInput.value.trim() === "" ||
        !Number.isFinite(minimum) || !Number.isFinite(maximum)) {
        message.textContent = "Enter valid engineering minimum and maximum values.";
        return;
    }

    if (minimum >= maximum) {
        message.textContent = "Engineering minimum must be less than engineering maximum.";
        return;
    }

    if (engineeringUnit === "") {
        message.textContent = "Enter an engineering unit, such as °C.";
        return;
    }

    if (conversionInput.value.trim() === "" || !Number.isFinite(value)) {
        message.textContent = "Enter a valid value to convert.";
        return;
    }

    let convertedValue;
    let outputUnit;

    if (direction === "to-engineering") {
        convertedValue = minimum +
            ((value - signalMinimum) / (signalMaximum - signalMinimum)) *
            (maximum - minimum);
        outputUnit = engineeringUnit;
    } else {
        convertedValue = signalMinimum +
            ((value - minimum) / (maximum - minimum)) *
            (signalMaximum - signalMinimum);
        outputUnit = signalUnit;
    }

    result.textContent = `${formatResult(convertedValue)} ${outputUnit}`;
    message.textContent = "";
}

document.querySelectorAll(".converter-card").forEach(card => {
    card.querySelectorAll("input").forEach(input => {
        input.addEventListener("input", () => calculateConversion(card));
    });

    calculateConversion(card);
});