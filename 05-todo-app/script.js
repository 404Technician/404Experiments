const taskInput = document.getElementById("taskInput");
const addButton = document.getElementById("addButton");
const taskList = document.getElementById("taskList");
const message = document.getElementById("message");

let tasks = JSON.parse(localStorage.getItem("tasks")) || [];

addButton.addEventListener("click", addTask);

function addTask() {
    const taskText = taskInput.value.trim();

    if (taskText === "") {
        message.textContent = "Please enter a task.";
        return;
    }

    message.textContent = "";

    const task = {
        id: Date.now(),
        text: taskText
    };

    tasks.push(task);

    saveTasks();
    renderTasks();

    taskInput.value = "";
}

function saveTasks() {
    localStorage.setItem("tasks", JSON.stringify(tasks));
}

function renderTasks() {
    taskList.innerHTML = "";

    tasks.forEach(task => {
        const listItem = document.createElement("li");
        listItem.textContent = task.text;

        taskList.appendChild(listItem);
    });
}

renderTasks();