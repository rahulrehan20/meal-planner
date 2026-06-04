const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner"];

const state = {
  weekStart: startOfWeek(new Date()),
  meals: [],
  assignments: {},
  selectedSlot: null,
};

const plannerGrid = document.querySelector("#plannerGrid");
const weekLabel = document.querySelector("#weekLabel");
const weekRange = document.querySelector("#weekRange");
const mealList = document.querySelector("#mealList");
const mealCount = document.querySelector("#mealCount");
const toast = document.querySelector("#toast");

const mealDialog = document.querySelector("#mealDialog");
const mealForm = document.querySelector("#mealForm");
const mealNameInput = document.querySelector("#mealNameInput");
const mealNotesInput = document.querySelector("#mealNotesInput");

const assignDialog = document.querySelector("#assignDialog");
const assignForm = document.querySelector("#assignForm");
const assignSlotLabel = document.querySelector("#assignSlotLabel");
const mealSelect = document.querySelector("#mealSelect");

document.querySelector("#addMealButton").addEventListener("click", () => {
  mealForm.reset();
  mealDialog.showModal();
  mealNameInput.focus();
});

document.querySelector("#previousWeekButton").addEventListener("click", () => {
  state.weekStart = addDays(state.weekStart, -7);
  render();
});

document.querySelector("#nextWeekButton").addEventListener("click", () => {
  state.weekStart = addDays(state.weekStart, 7);
  render();
});

mealForm.addEventListener("submit", async event => {
  if (event.submitter?.value === "cancel") {
    return;
  }

  event.preventDefault();
  const name = mealNameInput.value.trim();
  const notes = mealNotesInput.value.trim();

  if (!name) {
    return;
  }

  state.meals.push({
    id: crypto.randomUUID(),
    name,
    notes,
    createdAt: new Date().toISOString(),
  });

  await saveData("Meal saved");
  mealDialog.close();
});

assignForm.addEventListener("submit", async event => {
  if (event.submitter?.value === "cancel") {
    return;
  }

  event.preventDefault();
  const slot = state.selectedSlot;
  if (!slot) {
    return;
  }

  const mealId = mealSelect.value;
  if (!mealId) {
    return;
  }

  state.assignments[slot.key] = mealId;
  await saveData("Meal assigned");
  assignDialog.close();
});

async function loadData() {
  try {
    const response = await fetch("api.php");
    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, "Load failed"));
    }

    const data = await response.json();
    state.meals = Array.isArray(data.meals) ? data.meals : [];
    state.assignments = data.assignments && typeof data.assignments === "object" ? data.assignments : {};
    render();
  } catch (error) {
    showToast("Could not load shared data. Check README setup.");
    console.error(error);
    render();
  }
}

async function saveData(message) {
  try {
    const response = await fetch("api.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meals: state.meals,
        assignments: state.assignments,
      }),
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, "Save failed"));
    }

    await response.json();
    render();
    showToast(message);
  } catch (error) {
    showToast(error.message || "Could not save.");
    console.error(error);
  }
}

async function responseErrorMessage(response, fallback) {
  try {
    const data = await response.json();
    if (data && typeof data.error === "string") {
      return data.error;
    }
  } catch {
    // The server may return an HTML/PHP error page instead of JSON.
  }

  return `${fallback}: ${response.status}`;
}

function render() {
  renderWeekHeader();
  renderPlanner();
  renderMeals();
}

function renderWeekHeader() {
  const end = addDays(state.weekStart, 6);
  const todayStart = startOfWeek(new Date());
  const difference = Math.round((state.weekStart - todayStart) / (7 * 24 * 60 * 60 * 1000));

  weekLabel.textContent = difference === 0 ? "Current week" : difference > 0 ? `${difference} week${difference > 1 ? "s" : ""} ahead` : `${Math.abs(difference)} week${Math.abs(difference) > 1 ? "s" : ""} back`;
  weekRange.textContent = `${formatDate(state.weekStart)} - ${formatDate(end)}`;
}

function renderPlanner() {
  plannerGrid.innerHTML = "";
  appendHeader("Day");
  MEAL_TYPES.forEach(appendHeader);

  DAYS.forEach((day, dayIndex) => {
    const date = addDays(state.weekStart, dayIndex);
    const dateKey = toDateKey(date);
    const isToday = dateKey === toDateKey(new Date());
    const dayLabel = document.createElement("div");
    dayLabel.className = `day-label${isToday ? " today-row today-start" : ""}`;
    dayLabel.innerHTML = `<strong>${day}</strong><span>${formatDate(date)}</span>`;
    plannerGrid.append(dayLabel);

    MEAL_TYPES.forEach((mealType, mealIndex) => {
      const key = `${dateKey}:${mealType.toLowerCase()}`;
      const meal = state.meals.find(item => item.id === state.assignments[key]);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `planner-cell${meal ? "" : " empty"}${isToday ? " today-row" : ""}${isToday && mealIndex === MEAL_TYPES.length - 1 ? " today-end" : ""}`;
      button.dataset.key = key;
      button.innerHTML = meal
        ? `<span class="meal-name">${escapeHtml(meal.name)}</span>${meal.notes ? `<span class="meal-notes">${escapeHtml(meal.notes)}</span>` : ""}`
        : `<span class="add-mark">+</span><span class="add-label">Add</span>`;
      button.addEventListener("click", () => openAssignDialog({ key, day, date, mealType, meal }));
      plannerGrid.append(button);
    });
  });
}

function renderMeals() {
  mealCount.textContent = `${state.meals.length} saved`;
  mealList.innerHTML = "";

  if (state.meals.length === 0) {
    return;
  }

  state.meals
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(meal => {
      const card = document.createElement("article");
      card.className = "meal-card";
      card.innerHTML = `<strong>${escapeHtml(meal.name)}</strong>${meal.notes ? `<p>${escapeHtml(meal.notes)}</p>` : ""}`;
      mealList.append(card);
    });
}

function appendHeader(text) {
  const header = document.createElement("div");
  header.className = "planner-header";
  header.textContent = text;
  plannerGrid.append(header);
}

function openAssignDialog(slot) {
  state.selectedSlot = slot;
  assignSlotLabel.textContent = `${slot.day}, ${formatDate(slot.date)} - ${slot.mealType}`;
  mealSelect.innerHTML = "";

  if (state.meals.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Add a meal first";
    mealSelect.append(option);
  } else {
    state.meals
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(meal => {
        const option = document.createElement("option");
        option.value = meal.id;
        option.textContent = meal.name;
        option.selected = meal.id === state.assignments[slot.key];
        mealSelect.append(option);
      });
  }

  assignDialog.showModal();
  mealSelect.focus();
}

function startOfWeek(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
}

loadData();
