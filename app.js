(() => {
  "use strict";

  const STORAGE_KEY = "gather.events.v1";
  const CATEGORIES_KEY = "gather.categories.v1";
  const THEME_KEY = "gather.theme.v1";
  const SENTIMENTS = {
    good: { label: "Good", icon: "☀", className: "good" },
    normal: { label: "Normal", icon: "◒", className: "normal" },
    bad: { label: "Bad", icon: "☁", className: "bad" }
  };
  const SEVERITY_LABELS = ["A little", "Somewhat", "Moderately", "Very", "Extremely"];
  const DEFAULT_CATEGORIES = [
    { name: "Social", color: "#e7a681", icon: "✦", tint: "#fff1e9" },
    { name: "Work", color: "#8c79e8", icon: "↗", tint: "#f1efff" },
    { name: "Wellness", color: "#63b69a", icon: "✳", tint: "#eaf7f1" },
    { name: "Learning", color: "#e0b54f", icon: "⌁", tint: "#fff8e7" },
    { name: "Travel", color: "#62a4c8", icon: "⌖", tint: "#eaf5fb" },
    { name: "Personal", color: "#d77e9b", icon: "♡", tint: "#fff0f4" }
  ];
  const $ = (selector) => document.querySelector(selector);
  const storedEvents = loadJson(STORAGE_KEY, []);
  const els = {
    categoryNav: $("#category-nav"), categoryBreakdown: $("#category-breakdown"),
    categoryFilter: $("#category-filter"), categorySelect: $("#event-category"),
    eventList: $("#event-list"), listFooter: $("#list-footer"),
    modalBackdrop: $("#event-modal-backdrop"), eventForm: $("#event-form"),
    formError: $("#form-error"), title: $("#event-title"), date: $("#event-date"),
    notes: $("#event-notes"), sentimentPicker: $("#sentiment-picker"),
    severity: $("#event-severity"), severityOutput: $("#severity-output"),
    chart: $("#activity-chart"), chartEmpty: $("#chart-empty"), toast: $("#toast")
  };
  let events = (Array.isArray(storedEvents) ? storedEvents : []).map(normalizeEvent);
  let categories = loadJson(CATEGORIES_KEY, DEFAULT_CATEGORIES);
  let selectedSentiment = "good";
  let customDialogResolve = null;
  let editingId = null;
  let activeCategory = "all";
  let toastTimeout;

  function loadJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : structuredClone(fallback);
    } catch (error) {
      console.error(`Could not read ${key} from browser storage.`, error);
      return structuredClone(fallback);
    }
  }

  function normalizeEvent(event) {
    if (event && !event.sentiment && Number.isInteger(event.rating)) {
      if (event.rating <= 2) {
        return { ...event, sentiment: "bad", severity: (3 - event.rating) * 2 + 1, rating: undefined };
      }
      if (event.rating >= 4) {
        return { ...event, sentiment: "good", severity: (event.rating - 3) * 2 + 1, rating: undefined };
      }
      return { ...event, sentiment: "normal", severity: 3, rating: undefined };
    }
    return event;
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
    } catch (error) {
      console.error("Could not save event data to browser storage.", error);
      showToast("Couldn't save changes. Your browser storage may be full.");
      return false;
    }
    return true;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function categoryFor(name) {
    return categories.find((category) => category.name === name) || {
      name, color: "#9c98ad", icon: "✦", tint: "#f1f0f5"
    };
  }

  function dateFromISO(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function formatDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Date unknown";
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(dateFromISO(value));
  }

  function formatMonth(date, format = "short") {
    return new Intl.DateTimeFormat(undefined, { month: format }).format(date);
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => els.toast.classList.remove("show"), 2600);
  }

  function renderCategoryControls() {
    const counts = Object.fromEntries(categories.map(({ name }) => [name, events.filter((event) => event.category === name).length]));
    els.categoryNav.innerHTML = categories.map((category) => `
      <a href="#events" class="category-link ${activeCategory === category.name ? "selected" : ""}" data-category="${escapeHtml(category.name)}">
        <span class="category-color" style="background:${escapeHtml(category.color)}"></span>
        <span>${escapeHtml(category.name)}</span><span class="category-link-count">${counts[category.name] || ""}</span>
      </a>`).join("");

    const previousFilter = els.categoryFilter.value || activeCategory;
    els.categoryFilter.innerHTML = `<option value="all">All categories</option>` + categories.map((category) =>
      `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join("");
    els.categoryFilter.value = categories.some((item) => item.name === previousFilter) ? previousFilter : "all";
    els.categorySelect.innerHTML = categories.map((category) => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join("");
  }

  function renderStats() {
    const now = new Date();
    const thisMonth = events.filter((event) => {
      const date = dateFromISO(event.date);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    }).length;
    const average = events.length ? events.reduce((total, event) => {
      const direction = event.sentiment === "good" ? 1 : event.sentiment === "bad" ? -1 : 0;
      return total + direction * event.severity;
    }, 0) / events.length : 0;
    const counts = categories.map((category) => ({
      name: category.name, count: events.filter((event) => event.category === category.name).length
    })).sort((a, b) => b.count - a.count);
    $("#total-events").textContent = events.length;
    $("#month-events").textContent = thisMonth;
    $("#average-rating").textContent = events.length ? `${average > 0 ? "+" : ""}${average.toFixed(1)}` : "—";
    $("#sentiment-summary").textContent = events.length
      ? `${average > 0.25 ? "Mostly positive" : average < -0.25 ? "Mostly negative" : "Mostly neutral"} · scale −5 to +5`
      : "Across all your events";
    $("#top-category").textContent = counts[0]?.count ? counts[0].name : "—";
    $("#top-category-count").textContent = counts[0]?.count ? `${counts[0].count} ${counts[0].count === 1 ? "event" : "events"} logged` : "Build your first highlight";
    $("#sidebar-event-count").textContent = events.length;
    $("#recent-count").textContent = events.length;
  }

  function renderBreakdown() {
    const values = categories.map((category) => ({
      ...category, count: events.filter((event) => event.category === category.name).length
    })).filter(({ count }) => count > 0).sort((a, b) => b.count - a.count);
    if (!values.length) {
      els.categoryBreakdown.innerHTML = `<div class="category-empty">Your categories will come to life as you log events.</div>`;
      return;
    }
    const max = Math.max(...values.map(({ count }) => count));
    els.categoryBreakdown.innerHTML = values.map((category) => `
      <div class="breakdown-row">
        <span class="breakdown-name">${escapeHtml(category.name)}</span>
        <span class="breakdown-track"><span class="breakdown-fill" style="width:${Math.max(8, category.count / max * 100)}%;background:${escapeHtml(category.color)}"></span></span>
        <span class="breakdown-count">${category.count}</span>
      </div>`).join("");
  }

  function visibleEvents() {
    const query = $("#event-search").value.trim().toLowerCase();
    const filterCategory = els.categoryFilter.value;
    return events.filter((event) => {
      const matchesCategory = filterCategory === "all" || event.category === filterCategory;
      const matchesSidebar = activeCategory === "all" || event.category === activeCategory;
      const matchesSearch = !query || `${event.title} ${event.category} ${event.notes || ""}`.toLowerCase().includes(query);
      return matchesCategory && matchesSidebar && matchesSearch;
    }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }

  function renderEvents() {
    const shown = visibleEvents();
    if (!shown.length) {
      const isFiltered = events.length > 0 && (activeCategory !== "all" || els.categoryFilter.value !== "all" || $("#event-search").value.trim());
      els.eventList.innerHTML = `<div class="empty-list"><div class="empty-list-icon">${isFiltered ? "⌕" : "✳"}</div><strong>${isFiltered ? "No matching events" : "Your moments go here"}</strong><p>${isFiltered ? "Try a different search or category filter." : "Big milestones or little joys — start with whatever comes to mind."}</p>${isFiltered ? "" : `<button class="button button-primary" data-empty-add>Log your first event <span aria-hidden="true">↗</span></button>`}</div>`;
      els.listFooter.textContent = "";
      return;
    }
    els.eventList.innerHTML = shown.slice(0, 12).map((event) => {
      const category = categoryFor(event.category);
      const notes = event.notes ? `<div class="event-notes">${escapeHtml(event.notes)}</div>` : "";
      const sentiment = SENTIMENTS[event.sentiment] || SENTIMENTS.normal;
      return `<article class="event-row">
        <div class="event-main"><span class="event-category-icon" style="color:${escapeHtml(category.color)};background:${escapeHtml(category.tint)}">${escapeHtml(category.icon)}</span><div class="event-title-wrap"><div class="event-title">${escapeHtml(event.title)}</div>${notes}</div></div>
        <span class="event-category">${escapeHtml(event.category)}</span><time class="event-date" datetime="${escapeHtml(event.date)}">${escapeHtml(formatDate(event.date))}</time>
        <span class="event-sentiment ${sentiment.className}" aria-label="${sentiment.label}, ${SEVERITY_LABELS[event.severity - 1]}">${sentiment.icon} ${sentiment.label} <small>${event.severity}/5</small></span>
        <span class="event-actions"><button class="event-action" data-edit="${escapeHtml(event.id)}" aria-label="Edit ${escapeHtml(event.title)}" title="Edit">✎</button><button class="event-action" data-delete="${escapeHtml(event.id)}" aria-label="Delete ${escapeHtml(event.title)}" title="Delete">×</button></span>
      </article>`;
    }).join("");
    els.listFooter.textContent = shown.length > 12 ? `Showing 12 of ${shown.length} events` : `Showing ${shown.length} ${shown.length === 1 ? "event" : "events"}`;
  }

  function renderChart() {
    const numberOfMonths = Number($("#chart-period").value);
    const now = new Date();
    const months = Array.from({ length: numberOfMonths }, (_, index) => new Date(now.getFullYear(), now.getMonth() - numberOfMonths + index + 1, 1));
    const counts = months.map((month) => events.filter((event) => {
      const date = dateFromISO(event.date);
      return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
    }).length);
    const width = 680, height = 174, left = 34, right = 12, top = 14, bottom = 26;
    const maxCount = Math.max(4, Math.ceil(Math.max(...counts, 0) / 4) * 4);
    const chartHeight = height - top - bottom, chartWidth = width - left - right;
    const x = (index) => left + (numberOfMonths === 1 ? chartWidth / 2 : index * chartWidth / (numberOfMonths - 1));
    const y = (value) => top + chartHeight - value / maxCount * chartHeight;
    const points = counts.map((count, index) => `${x(index)},${y(count)}`).join(" ");
    const area = `${left},${height - bottom} ${points} ${left + chartWidth},${height - bottom}`;
    const labelStep = numberOfMonths === 6 ? 1 : 2;
    const grid = Array.from({ length: 5 }, (_, index) => {
      const value = maxCount - index * maxCount / 4;
      return `<line class="chart-gridline" x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}"></line><text class="chart-y-label" x="${left - 10}" y="${y(value) + 3}" text-anchor="end">${Math.round(value)}</text>`;
    }).join("");
    const labels = months.map((month, index) => index % labelStep === 0 ? `<text class="chart-label" x="${x(index)}" y="${height - 5}" text-anchor="middle">${escapeHtml(formatMonth(month))}</text>` : "").join("");
    const marks = counts.map((count, index) => `<circle class="chart-point" cx="${x(index)}" cy="${y(count)}" r="3.5"><title>${escapeHtml(formatMonth(months[index], "long"))}: ${count} ${count === 1 ? "event" : "events"}</title></circle>`).join("");
    els.chart.innerHTML = `<defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#a99bf6" stop-opacity=".28"></stop><stop offset="100%" stop-color="#a99bf6" stop-opacity=".02"></stop></linearGradient></defs>${grid}<polygon class="chart-area" points="${area}"></polygon><polyline class="chart-line" points="${points}"></polyline>${marks}${labels}`;
    els.chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
    els.chartEmpty.hidden = events.length > 0;
    els.chart.hidden = events.length === 0;
    els.chart.classList.toggle("is-hidden", events.length === 0);
  }

  function render() {
    renderCategoryControls();
    renderStats();
    renderBreakdown();
    renderEvents();
    renderChart();
  }

  function openModal(event = null) {
    editingId = event?.id ?? null;
    $("#modal-title").textContent = event ? "Edit event" : "Log an event";
    $("#save-event-button").innerHTML = event ? "Save changes <span aria-hidden=\"true\">↗</span>" : "Save event <span aria-hidden=\"true\">↗</span>";
    els.title.value = event?.title || "";
    els.categorySelect.value = event?.category || categories[0]?.name || "";
    els.date.value = event?.date || new Date().toISOString().slice(0, 10);
    els.notes.value = event?.notes || "";
    selectedSentiment = event?.sentiment || "good";
    els.severity.value = event?.severity || 3;
    els.formError.textContent = "";
    renderSentimentPicker();
    els.modalBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => els.title.focus(), 20);
  }

  function closeModal() {
    els.modalBackdrop.hidden = true;
    document.body.style.overflow = "";
    editingId = null;
  }

  function renderSentimentPicker() {
    els.sentimentPicker.innerHTML = Object.entries(SENTIMENTS).map(([value, sentiment]) =>
      `<button type="button" class="sentiment-option ${sentiment.className} ${selectedSentiment === value ? "selected" : ""}" data-sentiment="${value}" role="radio" aria-checked="${selectedSentiment === value}"><span aria-hidden="true">${sentiment.icon}</span>${sentiment.label}</button>`
    ).join("");
    $("#severity-label").textContent = `How ${selectedSentiment}?`;
    const severity = Number(els.severity.value);
    els.severityOutput.textContent = `${SEVERITY_LABELS[severity - 1]} · ${severity}/5`;
    els.severity.style.setProperty("--range-progress", `${(severity - 1) * 25}%`);
  }

  function validEvent(event) {
    const commonFieldsValid = event && typeof event.id === "string" && typeof event.title === "string" &&
      typeof event.category === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event.date) &&
      typeof event.notes === "string" && Number.isFinite(event.createdAt);
    if (!commonFieldsValid) return false;
    if (typeof event.sentiment === "string") {
      return Object.hasOwn(SENTIMENTS, event.sentiment) &&
        Number.isInteger(event.severity) && event.severity >= 1 && event.severity <= 5;
    }
    return Number.isInteger(event.rating) && event.rating >= 1 && event.rating <= 5;
  }

  function exportData() {
    const backup = { format: "gather-events", version: 1, exportedAt: new Date().toISOString(), categories, events };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gather-events-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Your events have been exported.");
  }

  async function importData(file) {
    try {
      const parsed = JSON.parse(await file.text());
      const importedEvents = Array.isArray(parsed) ? parsed : parsed.events;
      if (!Array.isArray(importedEvents) || importedEvents.some((event) => !validEvent(event))) {
        throw new Error("This file doesn't look like a valid Gather event backup.");
      }
      const incomingCategories = Array.isArray(parsed.categories) ? parsed.categories : [];
      if (incomingCategories.some((category) => !category || typeof category.name !== "string" ||
          typeof category.color !== "string" || typeof category.tint !== "string" || typeof category.icon !== "string")) {
        throw new Error("The backup contains an invalid category.");
      }
      const replace = await showCustomDialog({
        title: "Replace your events?",
        message: `Import ${importedEvents.length} event${importedEvents.length === 1 ? "" : "s"}? This will replace the events currently saved in this browser.`,
        confirmLabel: "Import backup",
        destructive: true
      });
      if (!replace) return;
      const previousEvents = events;
      const previousCategories = categories;
      events = importedEvents.map(normalizeEvent);
      if (incomingCategories.length) categories = incomingCategories;
      if (!saveData()) {
        events = previousEvents;
        categories = previousCategories;
        return;
      }
      activeCategory = "all";
      render();
      showToast(`${events.length} events imported successfully.`);
    } catch (error) {
      console.error("Could not import event backup.", error);
      showToast(error instanceof SyntaxError ? "That file isn't valid JSON." : error.message || "Couldn't import that file.");
    }
  }

  async function addCategory() {
    const name = await showCustomDialog({
      title: "Add a category",
      message: "Create a category to organize your events.",
      inputLabel: "Category name",
      inputPlaceholder: "e.g. Hobbies",
      confirmLabel: "Add category"
    });
    if (name === null) return;
    const normalized = name.trim();
    if (!normalized || normalized.length > 30) {
      showToast("Category names must be between 1 and 30 characters.");
      return;
    }
    if (categories.some((category) => category.name.toLowerCase() === normalized.toLowerCase())) {
      showToast("That category already exists.");
      return;
    }
    const palette = ["#8975e7", "#e49a74", "#5cae91", "#d7ae4c", "#5899bd", "#d27895", "#65a7a0", "#a66dc2"];
    const color = palette[categories.length % palette.length];
    categories.push({ name: normalized, color, icon: "✦", tint: `${color}18` });
    if (!saveData()) {
      categories.pop();
      return;
    }
    render();
  }

  $("#today-label").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date());
  $("#date-range-label").textContent = `Your all-time activity · ${new Date().getFullYear()}`;

  function applyTheme(theme) {
    const dark = theme === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]').content = dark ? "#171722" : "#f6f7fb";
    $("#theme-toggle").setAttribute("aria-pressed", String(dark));
    $("#theme-toggle").title = `Switch to ${dark ? "light" : "dark"} mode`;
    $(".theme-toggle-icon").textContent = dark ? "☀" : "☾";
    $(".theme-toggle-label").textContent = dark ? "Light mode" : "Dark mode";
  }

  function resolveCustomDialog(value) {
    const backdrop = $("#custom-dialog-backdrop");
    backdrop.hidden = true;
    document.body.style.overflow = "";
    const resolve = customDialogResolve;
    customDialogResolve = null;
    if (resolve) resolve(value);
  }

  function showCustomDialog({ title, message, inputLabel = "", inputPlaceholder = "", confirmLabel = "Confirm", destructive = false }) {
    const backdrop = $("#custom-dialog-backdrop");
    const input = $("#custom-dialog-input");
    $("#custom-dialog-title").textContent = title;
    $("#custom-dialog-message").textContent = message;
    $("#custom-dialog-confirm").textContent = confirmLabel;
    $("#custom-dialog-confirm").classList.toggle("button-danger", destructive);
    $("#custom-dialog-cancel").hidden = false;
    $("#custom-dialog-input-label").textContent = inputLabel;
    $("#custom-dialog-input-label").hidden = !inputLabel;
    $("#custom-dialog-error").hidden = true;
    $("#custom-dialog-error").textContent = "";
    input.hidden = !inputLabel;
    input.value = "";
    input.setCustomValidity("");
    input.placeholder = inputPlaceholder;
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
    const result = new Promise((resolve) => { customDialogResolve = resolve; });
    setTimeout(() => (inputLabel ? input : $("#custom-dialog-confirm")).focus(), 20);
    return result;
  }

  function closeCustomDialog() {
    resolveCustomDialog(null);
  }

  let storedTheme = "light";
  try {
    storedTheme = localStorage.getItem(THEME_KEY) || "light";
  } catch (error) {
    console.error("Could not read theme preference from browser storage.", error);
  }
  applyTheme(storedTheme === "dark" ? "dark" : "light");
  $("#theme-toggle").addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch (error) {
      console.error("Could not save theme preference.", error);
      showToast("Theme changed, but couldn't save your preference.");
    }
    applyTheme(nextTheme);
  });

  $("#custom-dialog-confirm").addEventListener("click", () => {
    const input = $("#custom-dialog-input");
    if (!input.hidden && !input.value.trim()) {
      $("#custom-dialog-error").textContent = "Enter a category name.";
      $("#custom-dialog-error").hidden = false;
      input.focus();
      return;
    }
    $("#custom-dialog-error").hidden = true;
    resolveCustomDialog(input.hidden ? true : input.value.trim());
  });
  $("#custom-dialog-cancel").addEventListener("click", closeCustomDialog);
  $("#custom-dialog-close").addEventListener("click", closeCustomDialog);
  $("#custom-dialog-backdrop").addEventListener("click", (event) => {
    if (event.target === $("#custom-dialog-backdrop")) closeCustomDialog();
  });
  $("#custom-dialog-input").addEventListener("input", () => {
    $("#custom-dialog-error").hidden = true;
  });

  $("#open-event-modal").addEventListener("click", () => openModal());
  $("#add-category-button").addEventListener("click", addCategory);
  $("#export-button").addEventListener("click", exportData);
  $("#import-button").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) importData(file);
    event.target.value = "";
  });
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModal));
  els.modalBackdrop.addEventListener("click", (event) => {
    if (event.target === els.modalBackdrop) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#custom-dialog-backdrop").hidden) closeCustomDialog();
    else if (event.key === "Escape" && !els.modalBackdrop.hidden) closeModal();
    if (event.key === "Enter" && !$("#custom-dialog-backdrop").hidden &&
        event.target.id === "custom-dialog-input") {
      event.preventDefault();
      $("#custom-dialog-confirm").click();
    }
  });
  els.sentimentPicker.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sentiment]");
    if (!button) return;
    selectedSentiment = button.dataset.sentiment;
    renderSentimentPicker();
  });
  els.severity.addEventListener("input", renderSentimentPicker);
  els.eventForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = els.title.value.trim();
    const date = els.date.value;
    if (!title || !date || !categories.some((category) => category.name === els.categorySelect.value)) {
      els.formError.textContent = "Add an event name, date, and valid category to continue.";
      return;
    }
    const existing = editingId ? events.find((item) => item.id === editingId) : null;
    const updated = {
      id: existing?.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      title, category: els.categorySelect.value, date,
      sentiment: selectedSentiment, severity: Number(els.severity.value), notes: els.notes.value.trim(),
      createdAt: existing?.createdAt || Date.now()
    };
    if (existing) events = events.map((item) => item.id === editingId ? updated : item);
    else events.push(updated);
    if (!saveData()) return;
    closeModal();
    render();
    showToast(existing ? "Event updated." : "Event logged. Nice one!");
  });
  $("#event-search").addEventListener("input", renderEvents);
  els.categoryFilter.addEventListener("change", () => {
    activeCategory = "all";
    renderCategoryControls();
    renderEvents();
  });
  $("#chart-period").addEventListener("change", renderChart);
  els.categoryNav.addEventListener("click", (event) => {
    const link = event.target.closest("[data-category]");
    if (!link) return;
    event.preventDefault();
    activeCategory = activeCategory === link.dataset.category ? "all" : link.dataset.category;
    els.categoryFilter.value = "all";
    renderCategoryControls();
    renderEvents();
  });
  els.eventList.addEventListener("click", async (event) => {
    if (event.target.closest("[data-empty-add]")) {
      openModal();
      return;
    }
    const editButton = event.target.closest("[data-edit]");
    if (editButton) {
      const selected = events.find((item) => item.id === editButton.dataset.edit);
      if (selected) openModal(selected);
      return;
    }
    const deleteButton = event.target.closest("[data-delete]");
    if (deleteButton) {
      const selected = events.find((item) => item.id === deleteButton.dataset.delete);
      if (!selected || !await showCustomDialog({
        title: "Delete this event?",
        message: `“${selected.title}” will be permanently removed from your tracker.`,
        confirmLabel: "Delete event",
        destructive: true
      })) return;
      const previous = events;
      events = events.filter((item) => item.id !== selected.id);
      if (!saveData()) events = previous;
      else {
        render();
        showToast("Event deleted.");
      }
    }
  });

  render();
})();
