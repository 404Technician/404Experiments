const generateButton = document.getElementById("generateButton");
const palette = document.getElementById("palette");

generateButton.addEventListener("click", generatePalette);

function generatePalette() {
    palette.innerHTML = "";

    for (let i = 0; i < 5; i++) {
        const color = generateRandomColor();

        const colorBox = document.createElement("div");
        colorBox.className = "color";
        colorBox.style.backgroundColor = color;
        colorBox.textContent = color;

        palette.appendChild(colorBox);
    }
}

function generateRandomColor() {
    const number = Math.floor(Math.random() * 16777215);
    return "#" + number.toString(16).padStart(6, "0");
}

generatePalette();