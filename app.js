"use strict";

const storageKey = "xiaoshi-todo.v1";
const viewNames = { all: "所有任务", today: "今日到期", important: "重要任务" };
const emptyMessages = {
  all: "清单还是空的，添加一项任务吧。",
  today: "今天没有到期的任务。",
  important: "还没有标记为重要的任务。",
  open: "当前视图没有待完成的任务。",
  done: "当前视图没有已完成的任务。"
};
const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" });
const shortDate = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" });
const fullDate = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" });

const byId = (id) => document.getElementById(id);
const entry = byId("task-entry");
const newTitle = byId("new-title");
const taskList = byId("task-list");
const template = byId("task-template");
const editor = byId("editor");
const editorForm = byId("editor-form");
const editTitle = byId("edit-title");
const editDate = byId("edit-date");
const editPriority = byId("edit-priority");
const toast = byId("toast");
const undo = byId("undo");
const viewButtons = document.querySelectorAll("[data-view]");
const filterButtons = document.querySelectorAll("[data-filter]");

let view = "all";
let filter = "all";
let editingId = null;
let recentDeletion = null;
let toastTimer;
let tasks = loadTasks();

function dateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function tomorrowKey() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateKey(tomorrow);
}

function initialTasks() {
  return [
    { id: "sample-1", title: "整理本周待办事项", date: dateKey(), important: true, done: false },
    { id: "sample-2", title: "给项目资料归档", date: tomorrowKey(), important: false, done: false },
    { id: "sample-3", title: "安排下周日程", date: "", important: false, done: false },
    { id: "sample-4", title: "检查今天的日历", date: dateKey(), important: false, done: true }
  ];
}

function readTasks(saved) {
  const parsed = JSON.parse(saved);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((task) => task && typeof task.id === "string" && typeof task.title === "string");
}

function loadTasks() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) return readTasks(saved);
    const defaults = initialTasks();
    localStorage.setItem(storageKey, JSON.stringify(defaults));
    return defaults;
  } catch {
    notify("本机存储不可用");
    return initialTasks();
  }
}

function saveTasks() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(tasks));
  } catch {
    return false;
  }
  return true;
}

function inView(task, name, today) {
  switch (name) {
    case "today": return task.date === today;
    case "important": return task.important;
    default: return true;
  }
}

function inFilter(task) {
  return filter === "all" || Boolean(task.done) === (filter === "done");
}

function updateDate() {
  const now = new Date();
  const today = dateKey(now);
  const date = byId("today-date");
  date.dateTime = today;
  date.textContent = `${shortDate.format(now)} · ${weekday.format(now)}`;
  return today;
}

function renderOverview() {
  const completed = tasks.filter((task) => task.done).length;
  const percent = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  byId("completed-count").textContent = completed;
  byId("total-count").textContent = tasks.length;
  byId("progress").value = percent;
  byId("progress-percent").textContent = `${percent}%`;
}

function renderTask(task, today, tomorrow) {
  const row = template.content.firstElementChild.cloneNode(true);
  row.dataset.taskId = task.id;
  row.classList.toggle("done", Boolean(task.done));
  row.querySelector(".task-title").textContent = task.title;
  const checkbox = row.querySelector("input");
  checkbox.checked = Boolean(task.done);
  checkbox.setAttribute("aria-label", task.title);
  row.querySelector(".priority-badge").hidden = !task.important;
  row.querySelector("[data-action=edit]").setAttribute("aria-label", `编辑：${task.title}`);
  row.querySelector("[data-action=delete]").setAttribute("aria-label", `删除：${task.title}`);

  if (task.date) {
    const date = new Date(`${task.date}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      const label = row.querySelector(".task-date");
      const time = label.querySelector("time");
      const overdue = !task.done && task.date < today;
      const format = task.date.slice(0, 4) === today.slice(0, 4) ? shortDate : fullDate;
      label.hidden = false;
      label.classList.toggle("overdue", overdue);
      time.dateTime = task.date;
      time.textContent = dateLabel(task.date, today, tomorrow, format.format(date), overdue);
    }
  }
  return row;
}

function dateLabel(date, today, tomorrow, formatted, overdue) {
  if (date === today) return "今天";
  if (date === tomorrow) return "明天";
  return overdue ? `逾期 · ${formatted}` : formatted;
}

function render() {
  const today = updateDate();
  const tomorrow = tomorrowKey();
  renderOverview();
  byId("tasks-title").textContent = viewNames[view];

  for (const button of viewButtons) {
    const name = button.dataset.view;
    const current = name === view;
    button.classList.toggle("active", current);
    if (current) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
    button.querySelector(".view-count").textContent = tasks.filter((task) => inView(task, name, today)).length;
  }
  for (const button of filterButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.filter === filter));
  }

  const visible = tasks.filter((task) => inView(task, view, today) && inFilter(task));
  taskList.replaceChildren(...visible.map((task) => renderTask(task, today, tomorrow)));
  byId("empty").hidden = visible.length > 0;
  byId("empty-message").textContent = emptyMessages[filter === "all" ? view : filter];
}

function notify(message, undoable = false) {
  clearTimeout(toastTimer);
  if (!undoable) recentDeletion = null;
  toast.hidden = false;
  byId("toast-message").textContent = message;
  undo.hidden = !undoable;
  toastTimer = setTimeout(() => {
    if (toast.contains(document.activeElement)) newTitle.focus();
    toast.hidden = true;
    recentDeletion = null;
  }, undoable ? 12000 : 3000);
}

function titleValue(input) {
  const title = input.value.trim();
  if (!title) {
    input.setCustomValidity("请输入任务名称。");
    input.reportValidity();
  }
  return title;
}

function taskId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function updateTasks(message, undoable = false) {
  const saved = saveTasks();
  render();
  notify(saved ? message : `${message}，本机保存失败`, undoable);
}

function focusTask(id, selector) {
  const row = Array.from(taskList.children).find((item) => item.dataset.taskId === id);
  (row?.querySelector(selector) ?? newTitle).focus();
}

for (const input of [newTitle, editTitle]) {
  input.addEventListener("input", () => input.setCustomValidity(""));
}

entry.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = titleValue(newTitle);
  if (!title) return;

  tasks.unshift({
    id: taskId(),
    title,
    date: view === "today" ? dateKey() : "",
    important: view === "important",
    done: false
  });
  if (filter === "done") filter = "open";
  entry.reset();
  updateTasks("已添加任务");
  newTitle.focus();
});

for (const button of viewButtons) {
  button.addEventListener("click", () => {
    view = button.dataset.view;
    filter = "all";
    render();
  });
}
for (const button of filterButtons) {
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    render();
  });
}

taskList.addEventListener("change", (event) => {
  const checkbox = event.target;
  const task = tasks.find((item) => item.id === checkbox.closest(".task").dataset.taskId);
  if (!task) return;
  task.done = checkbox.checked;
  updateTasks(task.done ? "已完成任务" : "已恢复为待完成");
  focusTask(task.id, "input");
});

taskList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const id = button.closest(".task").dataset.taskId;
  const index = tasks.findIndex((item) => item.id === id);
  if (index === -1) return;
  const task = tasks[index];

  if (button.dataset.action === "edit") {
    editingId = id;
    editTitle.setCustomValidity("");
    editTitle.value = task.title;
    editDate.value = task.date || "";
    editPriority.checked = Boolean(task.important);
    editor.showModal();
    return;
  }

  const row = button.closest(".task");
  const nextRow = row.nextElementSibling ?? row.previousElementSibling;
  recentDeletion = { task, index };
  tasks.splice(index, 1);
  updateTasks("已删除任务", true);
  focusTask(nextRow?.dataset.taskId, "[data-action=delete]");
});

editor.addEventListener("close", () => { editingId = null; });
for (const button of editor.querySelectorAll("[data-close]")) {
  button.addEventListener("click", () => editor.close());
}
editorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = titleValue(editTitle);
  if (!title) return;
  const task = tasks.find((item) => item.id === editingId);
  editor.close();
  if (!task) {
    notify("该任务已被删除");
    return;
  }
  task.title = title;
  task.date = editDate.value;
  task.important = editPriority.checked;
  updateTasks("已保存修改");
  focusTask(task.id, "[data-action=edit]");
});

undo.addEventListener("click", () => {
  if (!recentDeletion) return;
  const { task, index } = recentDeletion;
  if (!tasks.some((item) => item.id === task.id)) tasks.splice(index, 0, task);
  updateTasks("已恢复任务");
  focusTask(task.id, "input");
});

window.addEventListener("storage", (event) => {
  if (event.key !== storageKey) return;
  try {
    tasks = event.newValue === null ? [] : readTasks(event.newValue);
    render();
  } catch {
    notify("无法读取本机任务");
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && byId("today-date").dateTime !== dateKey()) render();
});

render();
