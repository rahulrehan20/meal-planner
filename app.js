const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner"];

const state = {
  weekStart: startOfWeek(new Date()),
  meals: [],
  assignments: {},
  selectedSlot: null,
  editingMealId: null,
  pendingDeleteMealId: null,
  assignmentSaving: false,
  mealSaving: false,
};

const plannerGrid = document.querySelector("#plannerGrid");
const weekLabel = document.querySelector("#weekLabel");
const weekRange = document.querySelector("#weekRange");
const mealList = document.querySelector("#mealList");
const mealCount = document.querySelector("#mealCount");
const toast = document.querySelector("#toast");

const mealDialog = document.querySelector("#mealDialog");
const mealForm = document.querySelector("#mealForm");
const mealDialogTitle = document.querySelector("#mealDialogTitle");
const mealNameInput = document.querySelector("#mealNameInput");
const mealNotesInput = document.querySelector("#mealNotesInput");
const mealDuplicateWarning = document.querySelector("#mealDuplicateWarning");
const saveMealButton = document.querySelector("#saveMealButton");

const assignDialog = document.querySelector("#assignDialog");
const assignForm = document.querySelector("#assignForm");
const assignSlotLabel = document.querySelector("#assignSlotLabel");
const mealSearchInput = document.querySelector("#mealSearchInput");
const mealSelect = document.querySelector("#mealSelect");
const mealSearchMessage = document.querySelector("#mealSearchMessage");
const assignedMeals = document.querySelector("#assignedMeals");
const addToSlotControls = document.querySelector("#addToSlotControls");
const addToSlotButton = document.querySelector("#addToSlotButton");

const deleteMealDialog = document.querySelector("#deleteMealDialog");
const deleteMealForm = document.querySelector("#deleteMealForm");
const deleteMealMessage = document.querySelector("#deleteMealMessage");

document.querySelector("#addMealButton").addEventListener("click", () => {
  state.editingMealId = null;
  mealForm.reset();
  mealDialogTitle.textContent = "Add Meal";
  saveMealButton.textContent = "Save meal";
  updateMealDuplicateWarning();
  mealDialog.showModal();
  mealNameInput.focus();
});

function openEditMealDialog(mealId) {
  const meal = state.meals.find(item => item.id === mealId);
  if (!meal) {
    return;
  }

  state.editingMealId = mealId;
  mealForm.reset();
  mealNameInput.value = meal.name;
  mealNotesInput.value = meal.notes || "";
  mealDialogTitle.textContent = "Edit Meal";
  saveMealButton.textContent = "Save changes";
  updateMealDuplicateWarning();
  mealDialog.showModal();
  mealNameInput.focus();
}

function createMealId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `meal-${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

function normalizedMealName(name) {
  return String(name).trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function findExistingMeal(name) {
  const normalizedName = normalizedMealName(name);
  return normalizedName ? state.meals.find(meal => meal.id !== state.editingMealId && normalizedMealName(meal.name) === normalizedName) : null;
}

function updateMealDuplicateWarning() {
  const existingMeal = findExistingMeal(mealNameInput.value);
  mealDuplicateWarning.hidden = !existingMeal;
  mealDuplicateWarning.textContent = existingMeal
    ? `Already saved as "${existingMeal.name}". Use the existing meal instead.`
    : "";
  mealNameInput.setCustomValidity(existingMeal ? "This meal is already saved." : "");
  mealNameInput.setAttribute("aria-invalid", existingMeal ? "true" : "false");
  saveMealButton.disabled = Boolean(existingMeal) || state.mealSaving;
  return existingMeal;
}

mealNameInput.addEventListener("input", updateMealDuplicateWarning);
mealSearchInput.addEventListener("input", updateMealSearchResults);

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

  if (!name || state.mealSaving || updateMealDuplicateWarning()) {
    return;
  }

  const editingIndex = state.meals.findIndex(meal => meal.id === state.editingMealId);
  if (state.editingMealId && editingIndex === -1) {
    showToast("This meal is no longer available.");
    return;
  }

  const previousMeal = editingIndex >= 0 ? state.meals[editingIndex] : null;
  const meal = {
    id: previousMeal?.id || createMealId(),
    name,
    notes,
    createdAt: previousMeal?.createdAt || new Date().toISOString(),
  };
  state.mealSaving = true;
  saveMealButton.disabled = true;
  if (editingIndex >= 0) {
    state.meals[editingIndex] = meal;
  } else {
    state.meals.push(meal);
  }

  const saved = await saveData(previousMeal ? "Meal updated" : "Meal saved");
  state.mealSaving = false;
  if (saved) {
    mealDialog.close();
  } else {
    if (editingIndex >= 0) {
      state.meals[editingIndex] = previousMeal;
    } else {
      state.meals = state.meals.filter(item => item.id !== meal.id);
    }
    render();
    updateMealDuplicateWarning();
  }
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
          const referenceUrl = getReferenceUrl(meal.notes);
          row.className = `slot-meal-row${referenceUrl ? " has-reference" : ""}`;
          const openButton = document.createElement("button");
          openButton.type = "button";
          openButton.className = "slot-meal-open";
          openButton.innerHTML = `<span class="meal-name">${escapeHtml(meal.name)}</span>`;
          openButton.setAttribute("aria-label", `Change ${day} ${mealType} meals`);
          row.append(openButton);

          if (referenceUrl) {
            const referenceLink = document.createElement("a");
            referenceLink.className = "reference-button";
            referenceLink.href = referenceUrl;
            referenceLink.target = "_blank";
            referenceLink.rel = "noopener noreferrer";
            referenceLink.textContent = "🔗";
            referenceLink.title = "Open recipe reference";
            referenceLink.setAttribute("aria-label", `Open recipe reference for ${meal.name}`);
            referenceLink.addEventListener("click", event => {
              event.stopPropagation();
            });
            row.append(referenceLink);
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
      const card = document.createElement("article");
      card.className = "meal-card";
      card.dataset.mealId = meal.id;
      card.innerHTML = `
        <div class="meal-card-content">
          <strong>${escapeHtml(meal.name)}</strong>
          <span class="meal-card-notes">${meal.notes ? linkifyText(meal.notes) : "No notes saved."}</span>
        </div>
        <button class="meal-card-open" type="button" aria-label="Edit ${escapeHtml(meal.name)}"></button>
        <button class="meal-delete-button" type="button" aria-label="Delete ${escapeHtml(meal.name)}" title="Delete">x</button>
      `;
      card.querySelector(".meal-card-open").addEventListener("click", () => openEditMealDialog(meal.id));
      card.querySelector(".meal-delete-button").addEventListener("click", event => {
        event.stopPropagation();
        openDeleteMealDialog(meal.id);
      });
      mealList.append(card);
    });
}

function getReferenceUrl(notes) {
  const rawUrl = String(notes || "").match(/\b(?:https?:\/\/|www\.|youtube\.com\/|youtu\.be\/)\S+/i)?.[0];
  if (!rawUrl) {
    return null;
  }
  const urlText = rawUrl.replace(/[),.!?;:]+$/, "");
  try {
    const url = new URL(/^https?:\/\//i.test(urlText) ? urlText : `https://${urlText}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
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
  } else {
    mealSearchInput.value = "";
  }
  state.assignmentSaving = false;
  renderAssignDialog();
}

function updateMealSearchResults() {
  const slot = state.selectedSlot;
  if (!slot) {
    return;
  }

  const assignedIds = getAssignedMealIds(slot.key);
  const availableMeals = state.meals
    .filter(meal => !assignedIds.includes(meal.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const query = normalizedMealName(mealSearchInput.value);
  const matchingMeals = availableMeals.filter(meal => normalizedMealName(meal.name).includes(query));
  const previousSelection = mealSelect.value;
  mealSelect.replaceChildren();
  matchingMeals.forEach(meal => {
    const option = document.createElement("option");
    option.value = meal.id;
    option.textContent = meal.name;
    mealSelect.append(option);
  });
  if (matchingMeals.some(meal => meal.id === previousSelection)) {
    mealSelect.value = previousSelection;
  }

  const canAdd = assignedIds.length < 2 && availableMeals.length > 0;
  addToSlotControls.hidden = !canAdd;
  mealSearchMessage.hidden = !canAdd || matchingMeals.length > 0;
  mealSearchInput.disabled = state.assignmentSaving || !canAdd;
  mealSelect.disabled = state.assignmentSaving || !canAdd || matchingMeals.length === 0;
  addToSlotButton.disabled = state.assignmentSaving || !canAdd || matchingMeals.length === 0;
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

  updateMealSearchResults();
}

function openAssignDialog(slot) {
  state.selectedSlot = slot;
  assignSlotLabel.textContent = `${slot.day}, ${formatDate(slot.date)} - ${slot.mealType}`;
  mealSearchInput.value = "";
  renderAssignDialog();
  assignDialog.showModal();
  const focusTarget = !mealSearchInput.disabled ? mealSearchInput : assignedMeals.querySelector("button") || assignDialog.querySelector('[value="cancel"]');
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
