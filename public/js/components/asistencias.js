import { state, savePreferences } from "../state.js";
import { badge, button, downloadCsv, el, formatDate, icon } from "../utils.js";
import { createEmptyState } from "./practicantes.js";

const rangeLabels = {
  today: "Hoy",
  week: "Esta semana",
  month: "Este mes",
  all: "Todo el historial",
  custom: "Rango personalizado",
};

// Muestra filtros locales y registros administrativos disponibles en la API.
export function renderAttendances({ attendances, practitioners, onAction }) {
  const section = el("section", "tab-panel");
  const toolbar = el("div", "toolbar");
  const filters = el("div", "toolbar__filters");
  const rangeField = makeSelect("Rango de fechas", "attendance-range", Object.entries(rangeLabels).map(([value, label]) => [value, label]), state.attendanceRange);
  const personOptions = [["", "Todos los practicantes"], ...practitioners.map((person) => [person.id, person.nombreCompleto])];
  const personField = makeSelect("Practicante", "attendance-person", personOptions, state.attendancePractitioner);
  filters.append(rangeField.wrapper, personField.wrapper);

  const dateFields = el("div", "toolbar__filters");
  const fromField = makeDate("Desde", "attendance-from", state.attendanceFrom);
  const toField = makeDate("Hasta", "attendance-to", state.attendanceTo);
  dateFields.append(fromField, toField);
  dateFields.hidden = state.attendanceRange !== "custom";

  const actions = el("div", "toolbar__actions");
  const exportButton = button("Exportar CSV", "secondary");
  exportButton.prepend(icon("download"));
  actions.append(exportButton);
  toolbar.append(filters, actions);
  const wrap = el("div", "table-wrap table-wrap--responsive");
  const filtered = filterAttendances(attendances);

  if (!attendances.length) {
    section.append(createEmptyState(
      "Aún no hay asistencias",
      "Cuando se registren entradas y salidas, aparecerán aquí para su revisión.",
    ));
    return section;
  }

  const table = el("table", "data-table");
  const head = el("thead");
  const headRow = el("tr");
  ["Fecha", "Practicante", "Entrada", "Salida", "Horas", "Actividades", "Estado", "Acciones"].forEach((label, index) => {
    const cell = el("th", "", label);
    cell.scope = "col";
    if (index === 3) cell.dataset.priority = "low";
    headRow.append(cell);
  });
  head.append(headRow);
  const body = el("tbody");
  filtered.forEach((record) => {
    const row = el("tr");
    const day = new Date(record.horaEntrada);
    const dateCell = el("td", "", formatDate(record.horaEntrada, { hour: undefined, minute: undefined }));
    dateCell.dataset.label = "Fecha";
    const person = el("td", "", record.nombreCompleto);
    person.dataset.label = "Practicante";
    const entrance = el("td", "", formatDate(record.horaEntrada, { year: undefined, month: "2-digit", day: "2-digit" }));
    entrance.dataset.label = "Entrada";
    const exit = el("td", "", record.horaSalida ? formatDate(record.horaSalida, { year: undefined, month: "2-digit", day: "2-digit" }) : "Pendiente");
    exit.dataset.label = "Salida";
    exit.dataset.priority = "low";
    const hours = el("td", "", `${Number(record.horas || 0).toFixed(2)} h`);
    hours.dataset.label = "Horas";
    const activities = el("td", "", record.descripcion || "—");
    activities.dataset.label = "Actividades";
    const statusCell = el("td");
    statusCell.dataset.label = "Estado";
    statusCell.append(badge(record.horaSalida ? "Completa" : "Pendiente", record.horaSalida ? "success" : "warning", "sm"));
    const actionCell = el("td");
    actionCell.dataset.label = "Acciones";
    const actionBar = el("div", "table-actions");
    const edit = button("✏️", "ghost", "sm");
    edit.dataset.action = "edit";
    edit.dataset.pid = record.practicanteId;
    edit.dataset.aid = record.id;
    edit.setAttribute("aria-label", `Corregir asistencia de ${record.nombreCompleto}`);
    edit.title = "Corregir";
    const remove = button("🗑️", "ghost", "sm");
    remove.dataset.action = "delete";
    remove.dataset.pid = record.practicanteId;
    remove.dataset.aid = record.id;
    remove.setAttribute("aria-label", `Eliminar asistencia de ${record.nombreCompleto}`);
    remove.title = "Eliminar";
    actionBar.append(edit, remove);
    actionCell.append(actionBar);
    row.append(dateCell, person, entrance, exit, hours, activities, statusCell, actionCell);
    row.dataset.day = Number.isNaN(day.getTime()) ? "" : day.toISOString();
    body.append(row);
  });
  table.append(head, body);
  wrap.append(table);
  const noResults = createEmptyState("Sin resultados en este rango", "Ajusta el periodo o el filtro de practicante para ver otros registros.");
  noResults.hidden = filtered.length > 0;
  section.append(toolbar, dateFields, wrap, noResults);
  wrap.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (target) onAction(target.dataset.action, target.dataset.pid, target.dataset.aid);
  });

  const applyFilters = () => {
    state.attendanceRange = rangeField.select.value;
    state.attendancePractitioner = personField.select.value;
    state.attendanceFrom = fromField.input.value;
    state.attendanceTo = toField.input.value;
    savePreferences();
    dateFields.hidden = state.attendanceRange !== "custom";
    const results = filterAttendances(attendances);
    const validIds = new Set(results.map((item) => item.id));
    [...body.rows].forEach((row) => { row.hidden = !validIds.has(row.querySelector("[data-aid]")?.dataset.aid); });
    noResults.hidden = results.length > 0;
  };
  rangeField.select.addEventListener("change", applyFilters);
  personField.select.addEventListener("change", applyFilters);
  fromField.input.addEventListener("change", applyFilters);
  toField.input.addEventListener("change", applyFilters);
  exportButton.addEventListener("click", () => {
    const rows = filterAttendances(attendances).map((record) => [
      formatDate(record.horaEntrada),
      record.nombreCompleto,
      record.documento,
      formatDate(record.horaEntrada),
      formatDate(record.horaSalida),
      Number(record.horas || 0).toFixed(2),
      record.horaSalida ? "Completa" : "Pendiente",
      record.descripcion || "",
    ]);
    downloadCsv(`asistencias-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Fecha", "Practicante", "Documento", "Entrada", "Salida", "Horas", "Estado", "Descripción"], rows);
  });
  return section;
}

function filterAttendances(records) {
  const person = state.attendancePractitioner;
  const now = new Date();
  let start = null;
  let end = null;
  if (state.attendanceRange === "today") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  } else if (state.attendanceRange === "week") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end = new Date(start);
    end.setDate(end.getDate() + 7);
  } else if (state.attendanceRange === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else if (state.attendanceRange === "custom") {
    start = state.attendanceFrom ? new Date(`${state.attendanceFrom}T00:00:00`) : null;
    end = state.attendanceTo ? new Date(`${state.attendanceTo}T23:59:59.999`) : null;
  }
  return records.filter((record) => {
    if (person && record.practicanteId !== person) return false;
    const date = new Date(record.horaEntrada);
    if (start && date < start) return false;
    if (end && date >= end && state.attendanceRange !== "custom") return false;
    if (end && state.attendanceRange === "custom" && date > end) return false;
    return true;
  });
}

function makeSelect(labelText, id, options, selected) {
  const wrapper = el("div", "field");
  const label = el("label", "", labelText);
  label.htmlFor = id;
  const select = document.createElement("select");
  select.id = id;
  options.forEach(([value, text]) => {
    const option = el("option", "", text);
    option.value = value;
    select.append(option);
  });
  select.value = selected;
  wrapper.append(label, select);
  return { wrapper, select };
}

function makeDate(labelText, id, value) {
  const field = el("div", "field");
  const label = el("label", "", labelText);
  label.htmlFor = id;
  const input = document.createElement("input");
  input.type = "date";
  input.id = id;
  input.value = value;
  field.append(label, input);
  return { wrapper: field, input };
}
