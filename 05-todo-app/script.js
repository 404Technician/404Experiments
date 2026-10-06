const taskInput = document.getElementById("taskInput");
const addButton = document.getElementById("addButton");
const taskList = document.getElementById("taskList");

const message = document.getElementById("message");

function addTask() {
    const taskText = taskInput.value.trim();

    if (taskText === "") {
        message.textContent = "Please enter a task.";
        return;
    }

    message.textContent = "";

    const listItem = document.createElement("li");
    listItem.textContent = taskText;

    taskList.appendChild(listItem);

    taskInput.value = "";
}