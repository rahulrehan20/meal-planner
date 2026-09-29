const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner"];

const state = {
  weekStart: startOfWeek(new Date()),
  meals: [],
  assignments: {},
  selectedSlot: null,
  expandedMealId: null,
  pendingDeleteMealId: null,
  assignmentSaving: false,
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
const assignedMeals = document.querySelector("#assignedMeals");
const addToSlotControls = document.querySelector("#addToSlotControls");
const addToSlotButton = document.querySelector("#addToSlotButton");

const deleteMealDialog = document.querySelector("#deleteMealDialog");
const deleteMealForm = document.querySelector("#deleteMealForm");
const deleteMealMessage = document.querySelector("#deleteMealMessage");

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
  const mealId = mealSelect.value;
  if (!slot || !mealId) {
    return;
  }

  const assignedIds = getAssignedMealIds(slot.key);
  if (assignedIds.length >= 2 || assignedIds.includes(mealId)) {
    return;
  }

  await updateSlotMeals(slot.key, [...assignedIds, mealId], "Meal added to this day");
});

deleteMealForm.addEventListener("submit", async event => {
  if (event.submitter?.value === "cancel") {
    state.pendingDeleteMealId = null;
    return;
  }

  event.preventDefault();
  const mealId = state.pendingDeleteMealId;
  state.pendingDeleteMealId = null;
  deleteMealDialog.close();

  if (mealId) {
    await deleteMeal(mealId);
  }
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
    return true;
  } catch (error) {
    showToast(error.message || "Could not save.");
    console.error(error);
    return false;
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
      const meals = getAssignedMealIds(key)
        .map(id => state.meals.find(item => item.id === id))
        .filter(Boolean);
      const cell = document.createElement(meals.length ? "div" : "button");
      cell.className = `planner-cell${meals.length ? "" : " empty"}${isToday ? " today-row" : ""}${isToday && mealIndex === MEAL_TYPES.length - 1 ? " today-end" : ""}`;
      cell.dataset.key = key;

      if (meals.length === 0) {
        cell.type = "button";
        cell.setAttribute("aria-label", `${day} ${mealType}: Add meal`);
        cell.innerHTML = `<span class="add-mark">+</span><span class="add-label">Add</span>`;
        cell.addEventListener("click", () => openAssignDialog({ key, day, date, mealType }));
      } else {
        cell.addEventListener("click", () => openAssignDialog({ key, day, date, mealType }));
        meals.forEach(meal => {
          const row = document.createElement("div");
          row.className = `slot-meal-row${hasReferenceLink(meal.notes) ? " has-reference" : ""}`;
          const openButton = document.createElement("button");
          openButton.type = "button";
          openButton.className = "slot-meal-open";
          openButton.innerHTML = `<span class="meal-name">${escapeHtml(meal.name)}</span>`;
          openButton.setAttribute("aria-label", `Change ${day} ${mealType} meals`);
          row.append(openButton);

          if (hasReferenceLink(meal.notes)) {
            const referenceButton = document.createElement("button");
            referenceButton.type = "button";
            referenceButton.className = "reference-button";
            referenceButton.textContent = "🔗";
            referenceButton.title = "View recipe reference";
            referenceButton.setAttribute("aria-label", `View recipe reference for ${meal.name}`);
            referenceButton.addEventListener("click", event => {
              event.stopPropagation();
              showMealReference(meal.id);
            });
            row.append(referenceButton);
          }
          cell.append(row);
        });
      }
      plannerGrid.append(cell);
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
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .forEach(meal => {
      const isExpanded = state.expandedMealId === meal.id;
      const card = document.createElement("article");
      card.className = `meal-card${isExpanded ? " expanded" : ""}`;
      card.dataset.mealId = meal.id;
      card.innerHTML = `
        <button class="meal-delete-button" type="button" aria-label="Delete ${escapeHtml(meal.name)}" title="Delete">x</button>
        <button class="meal-card-toggle" type="button" aria-expanded="${isExpanded}">
          <strong>${escapeHtml(meal.name)}</strong>
          <span class="meal-card-notes">${meal.notes ? linkifyText(meal.notes) : "No notes saved."}</span>
        </button>
      `;
      card.querySelector(".meal-card-toggle").addEventListener("click", () => {
        state.expandedMealId = state.expandedMealId === meal.id ? null : meal.id;
        renderMeals();
      });
      card.querySelectorAll(".meal-card-notes a").forEach(link => {
        link.addEventListener("click", event => event.stopPropagation());
      });
      card.querySelector(".meal-delete-button").addEventListener("click", event => {
        event.stopPropagation();
        openDeleteMealDialog(meal.id);
      });
      mealList.append(card);
    });
}

function hasReferenceLink(notes) {
  return /\b(?:https?:\/\/|www\.|youtube\.com\/|youtu\.be\/)\S+/i.test(notes || "");
}

function showMealReference(mealId) {
  state.expandedMealId = mealId;
  renderMeals();
  const card = Array.from(mealList.children).find(item => item.dataset.mealId === mealId);
  if (!card) {
    return;
  }

  card.classList.add("reference-highlight");
  requestAnimationFrame(() => {
    card.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    card.querySelector(".meal-card-toggle")?.focus({ preventScroll: true });
  });
  setTimeout(() => card.classList.remove("reference-highlight"), 2200);
}

function openDeleteMealDialog(mealId) {
  const meal = state.meals.find(item => item.id === mealId);
  if (!meal) {
    return;
  }

  state.pendingDeleteMealId = mealId;
  deleteMealMessage.textContent = `Delete "${meal.name}"?`;
  deleteMealDialog.showModal();
}

async function deleteMeal(mealId) {
  const previousMeals = state.meals;
  const previousAssignments = { ...state.assignments };
  state.meals = state.meals.filter(item => item.id !== mealId);
  Object.keys(state.assignments).forEach(slotKey => {
    setSlotMealIds(slotKey, getAssignedMealIds(slotKey).filter(id => id !== mealId));
  });

  if (state.expandedMealId === mealId) {
    state.expandedMealId = null;
  }

  if (!await saveData("Meal deleted")) {
    state.meals = previousMeals;
    state.assignments = previousAssignments;
    render();
  }
}

function appendHeader(text) {
  const header = document.createElement("div");
  header.className = "planner-header";
  header.textContent = text;
  plannerGrid.append(header);
}

function getAssignedMealIds(slotKey) {
  const value = state.assignments[slotKey];
  const ids = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return [...new Set(ids.filter(id => typeof id === "string" && id))].slice(0, 2);
}

function setSlotMealIds(slotKey, ids) {
  if (ids.length === 0) {
    delete state.assignments[slotKey];
  } else {
    state.assignments[slotKey] = ids.length === 1 ? ids[0] : ids.slice(0, 2);
  }
}

async function updateSlotMeals(slotKey, ids, message) {
  if (state.assignmentSaving) {
    return;
  }

  const previousIds = getAssignedMealIds(slotKey);
  state.assignmentSaving = true;
  setSlotMealIds(slotKey, ids);
  renderAssignDialog();
  const saved = await saveData(message);
  if (!saved) {
    setSlotMealIds(slotKey, previousIds);
    render();
  }
  state.assignmentSaving = false;
  renderAssignDialog();
}

function renderAssignDialog() {
  const slot = state.selectedSlot;
  if (!slot) {
    return;
  }

  const assignedIds = getAssignedMealIds(slot.key);
  assignedMeals.replaceChildren();

  if (assignedIds.length === 0) {
    const message = document.createElement("p");
    message.className = "slot-message";
    message.textContent = state.meals.length ? "No meals planned for this slot." : "Add a saved meal using the + button first.";
    assignedMeals.append(message);
  }

  assignedIds.forEach(id => {
    const meal = state.meals.find(item => item.id === id);
    const row = document.createElement("div");
    row.className = "assigned-meal-row";
    const name = document.createElement("span");
    name.textContent = meal?.name || "Unavailable meal";
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "button danger";
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove ${name.textContent} from ${slot.day} ${slot.mealType}`);
    removeButton.disabled = state.assignmentSaving;
    removeButton.addEventListener("click", () => {
      updateSlotMeals(slot.key, getAssignedMealIds(slot.key).filter(value => value !== id), "Meal removed from this day");
    });
    row.append(name, removeButton);
    assignedMeals.append(row);
  });

  if (assignedIds.length === 2) {
    const message = document.createElement("p");
    message.className = "slot-message";
    message.textContent = "Two meals planned. Remove one to add another.";
    assignedMeals.append(message);
  }

  const availableMeals = state.meals
    .filter(meal => !assignedIds.includes(meal.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  mealSelect.replaceChildren();
  availableMeals.forEach(meal => {
    const option = document.createElement("option");
    option.value = meal.id;
    option.textContent = meal.name;
    mealSelect.append(option);
  });

  const canAdd = assignedIds.length < 2 && availableMeals.length > 0;
  addToSlotControls.hidden = !canAdd;
  mealSelect.disabled = state.assignmentSaving || !canAdd;
  addToSlotButton.disabled = state.assignmentSaving || !canAdd;
}

function openAssignDialog(slot) {
  state.selectedSlot = slot;
  assignSlotLabel.textContent = `${slot.day}, ${formatDate(slot.date)} - ${slot.mealType}`;
  renderAssignDialog();
  assignDialog.showModal();
  const focusTarget = !mealSelect.disabled ? mealSelect : assignedMeals.querySelector("button") || assignDialog.querySelector('[value="cancel"]');
  focusTarget?.focus();
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

function linkifyText(value) {
  const pattern = /(https?:\/\/[^\s<]+|www\.[^\s<]+|(?:youtube\.com|youtu\.be)\/[^\s<]+)/gi;
  const text = String(value);
  let html = "";
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    html += escapeHtml(text.slice(lastIndex, match.index));
    const rawUrl = match[0];
    const trailing = rawUrl.match(/[),.!?;:]+$/)?.[0] || "";
    const urlText = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
    const href = /^https?:\/\//i.test(urlText) ? urlText : `https://${urlText}`;

    try {
      const url = new URL(href);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        html += escapeHtml(rawUrl);
      } else {
        html += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(urlText)}</a>${escapeHtml(trailing)}`;
      }
    } catch {
      html += escapeHtml(rawUrl);
    }

    lastIndex = pattern.lastIndex;
  }

  html += escapeHtml(text.slice(lastIndex));
  return html;
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
}

loadData();
