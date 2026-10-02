import { state } from "../state.js";
import { el } from "../utils.js";

const tabs = ["practicantes", "asistencias", "agregar", "ajustes"];

// Actualiza contadores derivados de las listas de practicantes y asistencias.
export function renderStats() {
  const today = new Date();
  const sameDay = (value) => {
    const date = new Date(value);
    return date.getFullYear() === today.getFullYear()
      && date.getMonth() === today.getMonth()
      && date.getDate() === today.getDate();
  };
  const month = state.attendances
    .filter((item) => {
      const date = new Date(item.horaEntrada);
      return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
    })
    .reduce((total, item) => total + Number(item.horas || 0), 0);
  const manualMonth = state.practitioners.reduce((sum, person) =>
    sum + (person.registrosHoras || []).reduce((hours, record) => {
      const date = new Date(record.fecha);
      return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth()
        ? hours + Number(record.horas || 0)
        : hours;
    }, 0), 0);
  const set = (id, value) => { document.querySelector(id).textContent = value; };
  set("#stat-total", state.practitioners.length);
  set("#stat-active", new Set(state.attendances
    .filter((item) => !item.horaSalida && sameDay(item.horaEntrada))
    .map((item) => item.practicanteId)).size);
  set("#stat-pending", state.attendances.filter((item) => !item.horaSalida).length);
  set("#stat-hours", `${(month + manualMonth).toFixed(1)} h`);
}

// Activa pestañas con teclado y conserva el enlace de navegación en el hash.
export function initDashboardTabs(onSelect) {
  const tablist = document.querySelector("#dashboard-tabs");
  tablist.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]");
    if (tab) onSelect(tab.dataset.tab);
  });
  tablist.addEventListener("keydown", (event) => {
    const current = event.target.closest("[data-tab]");
    if (!current || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...tablist.querySelectorAll("[data-tab]")];
    const index = buttons.indexOf(current);
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? buttons.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[nextIndex].focus();
    onSelect(buttons[nextIndex].dataset.tab);
  });
}

export function activateTab(tabName) {
  state.tab = tabs.includes(tabName) ? tabName : "practicantes";
  history.replaceState(null, "", `#/` + state.tab);
  document.querySelectorAll("#dashboard-tabs [data-tab]").forEach((tab) => {
    const selected = tab.dataset.tab === state.tab;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
}

export function dashboardContent() {
  return el("div", "tab-panel");
}
