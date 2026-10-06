const taskInput = document.getElementById("taskInput");
const addButton = document.getElementById("addButton");
const taskList = document.getElementById("taskList");
const message = document.getElementById("message");
const filterButtons = document.querySelectorAll(".filters button");

let tasks = JSON.parse(localStorage.getItem("tasks")) || [];
let currentFilter = "all";
let editingTaskId = null;

addButton.addEventListener("click", addTask);

filterButtons.forEach(button => {
    button.addEventListener("click", () => {
        currentFilter = button.dataset.filter;
        renderTasks();
    });
});

function addTask() {
    const taskText = taskInput.value.trim();

    if (taskText === "") {
        message.textContent = "Please enter a task.";
        return;
    }

    message.textContent = "";

    const task = {
        id: Date.now(),
        text: taskText,
        completed: false
    };

    tasks.push(task);

    saveTasks();
    renderTasks();

    taskInput.value = "";
}

function saveTasks() {
    localStorage.setItem("tasks", JSON.stringify(tasks));
}

function saveEditedTask(task, input) {
    const taskText = input.value.trim();

    if (taskText === "") {
        message.textContent = "Task text cannot be empty.";
        input.focus();
        return;
    }

    task.text = taskText;
    editingTaskId = null;
    message.textContent = "";
    saveTasks();
    renderTasks();
}

function renderTasks() {
    taskList.innerHTML = "";

    const filteredTasks = tasks.filter(task => {
        if (currentFilter === "active") {
            return !task.completed;
        }

        if (currentFilter === "completed") {
            return task.completed;
        }

        return true;
    });

    filteredTasks.forEach(task => {
        const listItem = document.createElement("li");

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = task.completed || false;

        checkbox.addEventListener("change", () => {
            task.completed = checkbox.checked;
            saveTasks();
            renderTasks();
        });

        let taskText;
        if (editingTaskId === task.id) {
            taskText = document.createElement("input");
            taskText.type = "text";
            taskText.value = task.text;
            taskText.setAttribute("aria-label", "Edit task");
        } else {
            taskText = document.createElement("span");
            taskText.textContent = task.text;

            if (task.completed) {
                taskText.style.textDecoration = "line-through";
            }
        }

        const taskActions = document.createElement("div");
        taskActions.className = "task-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.textContent = editingTaskId === task.id ? "Save" : "Edit";

        editButton.addEventListener("click", () => {
            if (editingTaskId === task.id) {
                saveEditedTask(task, taskText);
            } else {
                editingTaskId = task.id;
                message.textContent = "";
                renderTasks();
                const editInput = taskList.querySelector("li input[type='text']");
                editInput.focus();
                editInput.select();
            }
        });

        if (editingTaskId === task.id) {
            taskText.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    saveEditedTask(task, taskText);
                } else if (event.key === "Escape") {
                    editingTaskId = null;
                    message.textContent = "";
                    renderTasks();
                }
            });
        }

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener("click", () => {
            tasks = tasks.filter(item => item.id !== task.id);
            saveTasks();
            renderTasks();
        });

        listItem.appendChild(checkbox);
        listItem.appendChild(taskText);
        taskActions.appendChild(editButton);
        taskActions.appendChild(deleteButton);
        listItem.appendChild(taskActions);

        taskList.appendChild(listItem);
    });
}

renderTasks();