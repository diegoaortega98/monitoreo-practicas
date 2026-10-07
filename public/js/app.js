import { api } from "./api.js";
import { state } from "./state.js";
import { el, button, fromLocalDateTime, icon, toLocalDateTime } from "./utils.js";
import { initTheme } from "./theme.js";
import { initHeader, updateHeaderUser } from "./components/header.js";
import { initLanding } from "./components/landing.js";
import { activateTab, initDashboardTabs, renderStats } from "./components/dashboard.js";
import {
  createEmptyState,
  practitionerLoading,
  renderPractitionerForm,
  renderPractitioners,
} from "./components/practicantes.js";
import { renderAttendances } from "./components/asistencias.js";
import { renderSettings } from "./components/ajustes.js";
import { confirmAction } from "./ui/confirm.js";
import { openModal } from "./ui/modal.js";
import { tableSkeleton } from "./ui/skeleton.js";
import { toast } from "./ui/toast.js";

const landing = document.querySelector("#landing");
const dashboard = document.querySelector("#dashboard");
const dashboardContent = document.querySelector("#dashboard-content");
const errorBoundary = document.querySelector("#error-boundary");
let editingId = "";
let highlightId = "";
let pageLoaded = false;
let dashboardLoading = false;

// Conecta los módulos de interfaz y recupera una sesión administrativa existente.
async function bootstrap() {
  initTheme();
  initHeader({ onAuthenticated: handleAuthenticated, onLogout: logout });
  initLanding({ onRefresh: () => dashboard.hidden ? Promise.resolve() : loadDashboard(false) });
  initDashboardTabs(selectTab);
  document.querySelector("#refresh-dashboard").addEventListener("click", () => loadDashboard(true));
  document.querySelector("#reload-page").addEventListener("click", () => location.reload());
  document.addEventListener("keydown", handleShortcuts);
  document.addEventListener("visibilitychange", refreshDashboardIfVisible);
  window.addEventListener("focus", refreshDashboardIfVisible);
  window.setInterval(refreshDashboardIfVisible, 30_000);
  window.addEventListener("hashchange", handleHashChange);
  window.addEventListener("error", showErrorBoundary);
  window.addEventListener("unhandledrejection", showErrorBoundary);
  try {
    const session = await api.me();
    handleAuthenticated(session);
  } catch (error) {
    if (error.status !== 401) toast(error.message, "error");
    showLanding();
  }
}

async function handleAuthenticated(session) {
  state.user = session.usuario || "Administrador";
  state.expiresAt = session.expiraEn || null;
  updateHeaderUser(state.user, state.expiresAt);
  landing.hidden = true;
  dashboard.hidden = false;
  activateTab(state.tab);
  await loadDashboard(true);
}

async function logout() {
  try {
    await api.logout();
    state.user = null;
    state.expiresAt = null;
    state.practitioners = [];
    state.attendances = [];
    updateHeaderUser(null);
    showLanding();
    toast("Sesión cerrada.", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

function showLanding() {
  landing.hidden = false;
  dashboard.hidden = true;
}

// Obtiene los recursos administrativos y muestra skeleton mientras espera.
async function loadDashboard(showLoading) {
  if (dashboardLoading) return;
  dashboardLoading = true;
  if (showLoading || !pageLoaded) {
    dashboardContent.replaceChildren(practitionerLoading());
    pageLoaded = false;
  }
  try {
    const [practitioners, attendances] = await Promise.all([
      api.practitioners(),
      api.attendances(),
    ]);
    state.practitioners = practitioners;
    state.attendances = attendances;
    pageLoaded = true;
    renderStats();
    renderCurrentTab();
  } catch (error) {
    if (error.status === 401) {
      updateHeaderUser(null);
      showLanding();
      toast("La sesión expiró. Inicia sesión de nuevo.", "warning");
      return;
    }
    dashboardContent.replaceChildren(createEmptyState(
      "No se pudo cargar el panel",
      error.message,
      "Reintentar",
      () => loadDashboard(true),
    ));
    toast(error.message, "error");
  } finally {
    dashboardLoading = false;
  }
}

function selectTab(tabName) {
  activateTab(tabName);
  renderCurrentTab();
}

// Dibuja el contenido de la pestaña actual usando las listas ya cargadas.
function renderCurrentTab() {
  if (!pageLoaded) return;
  if (state.tab === "practicantes") {
    dashboardContent.replaceChildren(renderPractitioners({
      practitioners: state.practitioners,
      attendances: state.attendances,
      highlightId,
      onNew: () => selectTab("agregar"),
      onAction: handlePractitionerAction,
    }));
    highlightId = "";
  } else if (state.tab === "asistencias") {
    dashboardContent.replaceChildren(renderAttendances({
      attendances: state.attendances,
      practitioners: state.practitioners,
      onAction: handleAttendanceAction,
    }));
  } else if (state.tab === "agregar") {
    dashboardContent.replaceChildren(renderAddTab());
  } else {
    dashboardContent.replaceChildren(renderSettings());
  }
}

function refreshDashboardIfVisible() {
  if (!dashboard.hidden && document.visibilityState === "visible") {
    loadDashboard(false);
  }
}

function renderAddTab() {
  const person = editingId
    ? state.practitioners.find((item) => item.id === editingId)
    : null;
  const card = el("article", "card");
  const header = el("div", "card__header");
  header.append(el("h2", "", person ? "Editar practicante" : "Nuevo practicante"));
  const body = el("div", "card__body");
  const form = renderPractitionerForm(person, async (payload) => {
    if (editingId) {
      await api.updatePractitioner(editingId, payload);
      toast("Datos del practicante actualizados.", "success");
    } else {
      const created = await api.createPractitioner(payload);
      highlightId = created.id;
      toast("Practicante registrado.", "success");
    }
    editingId = "";
    await loadDashboard(false);
    selectTab("practicantes");
  });
  body.append(form);
  if (person) {
    const cancel = button("Cancelar edición", "secondary");
    cancel.addEventListener("click", () => {
      editingId = "";
      selectTab("practicantes");
    });
    body.append(cancel);
  }
  card.append(header, body);
  return card;
}

async function handlePractitionerAction(action, id) {
  const person = state.practitioners.find((item) => item.id === id);
  if (!person) return;
  if (action === "detail") {
    showPractitionerDetail(person);
  } else if (action === "edit") {
    editingId = id;
    selectTab("agregar");
  } else if (action === "delete") {
    await deletePractitioner(person);
  } else if (action === "approve") {
    showPractitionerApproval(person);
  } else if (action === "reject") {
    await rejectPractitioner(person);
  }
}

// Solicita la meta de horas requerida para aprobar o reactivar un practicante.
function showPractitionerApproval(person) {
  const form = el("form", "form-section");
  form.id = "approval-form";
  const field = el("div", "field");
  const label = el("label", "", "Meta de horas");
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0.01";
  input.step = "0.01";
  input.required = true;
  input.autocomplete = "off";
  label.htmlFor = "approval-meta-hours";
  input.id = label.htmlFor;
  field.append(label, input);
  const error = el("p", "field__message field__message--error");
  error.setAttribute("role", "alert");
  form.append(field, error);
  const save = button(person.estado === "rechazado" ? "Reactivar" : "Aprobar", "primary");
  save.type = "submit";
  save.setAttribute("form", form.id);
  const footer = el("div", "inline-actions");
  footer.append(save);
  const modal = openModal({
    title: `${person.estado === "rechazado" ? "Reactivar" : "Aprobar"} · ${person.nombreCompleto}`,
    body: form,
    footer,
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    save.disabled = true;
    try {
      await api.aprobarPracticante(person.id, Number(input.value.replace(",", ".")));
      modal.close();
      toast(person.estado === "rechazado" ? "Practicante reactivado." : "Solicitud aprobada.", "success");
      await loadDashboard(false);
    } catch (problem) {
      error.textContent = problem.message;
      toast(problem.message, "error");
    } finally {
      if (save.isConnected) save.disabled = false;
    }
  });
}

// Pide confirmación antes de rechazar y conserva el registro en el sistema.
async function rejectPractitioner(person) {
  const accepted = await confirmAction({
    title: "Rechazar solicitud",
    message: `¿Deseas rechazar la solicitud de ${person.nombreCompleto}?`,
    confirmText: "Rechazar",
  });
  if (!accepted) return;
  try {
    await api.rechazarPracticante(person.id);
    toast("Solicitud rechazada.", "success");
    await loadDashboard(false);
  } catch (problem) {
    toast(problem.message, "error");
  }
}

function showPractitionerDetail(person) {
  const body = el("div", "form-section");
  const details = el("div", "form-grid form-grid--2");
  [
    ["Documento", person.documento],
    ["Carrera", person.carrera],
    ["Semestres cursados", person.semestresCursados],
    ["Contacto de emergencia", person.contactoEmergencia || "No registrado"],
    ["Teléfono", person.telefono],
    ["Horas acumuladas", `${Number(person.horasAcumuladas || 0).toFixed(2)} h`],
    ["Meta de horas", `${Number(person.metaHoras).toFixed(2)} h`],
  ].forEach(([label, value]) => {
    const fact = el("div", "session-info__row");
    fact.append(el("span", "", label), el("strong", "", value ?? "—"));
    details.append(fact);
  });
  const historyTitle = el("h3", "", "Historial de asistencias");
  const history = state.attendances
    .filter((record) => record.practicanteId === person.id)
    .sort((a, b) => new Date(b.horaEntrada) - new Date(a.horaEntrada))
    .slice(0, 12);
  const historyList = el("div", "recent-list");
  history.forEach((record) => {
    const row = el("article", "recent-item");
    const information = el("div");
    information.append(
      el("strong", "", new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(new Date(record.horaEntrada))),
      el("p", "", `${formatTime(record.horaEntrada)} – ${record.horaSalida ? formatTime(record.horaSalida) : "Salida pendiente"}`),
    );
    row.append(information, el("span", "badge badge--info", `${Number(record.horas || 0).toFixed(2)} h`));
    historyList.append(row);
  });
  const empty = history.length ? null : createEmptyState("Sin asistencias registradas", "El historial aparecerá aquí después de las primeras marcaciones.");
  const hourAdjustments = (person.registrosHoras || []).slice().reverse();
  const adjustmentTitle = el("h3", "", "Ajustes manuales de horas");
  const adjustmentList = el("div", "recent-list");
  hourAdjustments.slice(0, 12).forEach((record) => {
    const row = el("article", "recent-item");
    const detail = el("div");
    detail.append(
      el("strong", "", new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(new Date(record.fecha))),
      el("p", "", record.descripcion || "Ajuste manual"),
    );
    row.append(detail, el("span", "badge badge--info", `${Number(record.horas || 0).toFixed(2)} h`));
    adjustmentList.append(row);
  });
  if (!hourAdjustments.length) {
    adjustmentList.append(el("p", "field__message", "No hay ajustes manuales registrados."));
  }
  const actions = el("div", "inline-actions");
  const manual = button("Registrar asistencia manual", "secondary");
  manual.prepend(icon("plus"));
  manual.addEventListener("click", () => showManualAttendance(person));
  const hoursButton = button("Ajustar horas", "secondary");
  hoursButton.addEventListener("click", () => showHoursAdjustment(person));
  actions.append(manual, hoursButton);
  body.append(details, historyTitle, empty || historyList, adjustmentTitle, adjustmentList, actions);
  openModal({ title: person.nombreCompleto, body, className: "modal--drawer" });
}

function showHoursAdjustment(person) {
  const form = el("form", "form-section");
  const hours = el("div", "field");
  const hoursLabel = el("label", "", "Horas a agregar");
  hoursLabel.htmlFor = "adjustment-hours";
  const hoursInput = document.createElement("input");
  hoursInput.id = "adjustment-hours";
  hoursInput.type = "number";
  hoursInput.min = "0.01";
  hoursInput.step = "0.01";
  hoursInput.required = true;
  hours.append(hoursLabel, hoursInput);
  const reason = textField("adjustment-reason", "Motivo del ajuste", "");
  reason.input.required = true;
  const error = el("p", "field__message field__message--error");
  error.setAttribute("role", "alert");
  form.append(hours, reason.wrapper, error);
  const save = button("Guardar ajuste", "primary");
  save.type = "submit";
  const footer = el("div", "inline-actions");
  footer.append(save);
  const modal = openModal({ title: `Ajustar horas · ${person.nombreCompleto}`, body: form, footer });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    save.disabled = true;
    try {
      await api.registerHours(person.id, {
        horas: Number(hoursInput.value),
        fecha: new Date().toISOString(),
        descripcion: reason.input.value.trim(),
      });
      modal.close();
      toast("Ajuste de horas registrado.", "success");
      await loadDashboard(true);
    } catch (problem) {
      error.textContent = problem.message;
      toast(problem.message, "error");
      save.disabled = false;
    }
  });
}

async function deletePractitioner(person) {
  const accepted = await confirmAction({
    title: "Eliminar practicante",
    message: `¿Deseas eliminar a ${person.nombreCompleto}? También se eliminará su historial de asistencias.`,
    confirmText: "Eliminar",
  });
  if (!accepted) return;
  const previous = [...state.practitioners];
  state.practitioners = state.practitioners.filter((item) => item.id !== person.id);
  state.attendances = state.attendances.filter((record) => record.practicanteId !== person.id);
  renderStats();
  renderCurrentTab();
  try {
    await api.deletePractitioner(person.id);
    toast("Practicante eliminado.", "success");
  } catch (error) {
    state.practitioners = previous;
    await loadDashboard(false);
    toast(error.message, "error");
  }
}

function handleAttendanceAction(action, practitionerId, attendanceId) {
  const record = state.attendances.find((item) => item.id === attendanceId);
  if (!record) return;
  if (action === "edit") showAttendanceEditor(record);
  if (action === "delete") deleteAttendance(record);
}

function showAttendanceEditor(record) {
  const form = el("form", "form-section");
  const grid = el("div", "form-grid form-grid--2");
  const entry = datetimeField("edit-entry", "Hora de entrada", record.horaEntrada, true);
  const exit = datetimeField("edit-exit", "Hora de salida", record.horaSalida, false);
  const hours = document.createElement("input");
  hours.id = "edit-hours";
  hours.type = "number";
  hours.min = "0.01";
  hours.step = "0.01";
  hours.placeholder = Number(record.horas || 0).toFixed(2);
  const hoursWrapper = el("div", "field");
  const hoursLabel = el("label", "", "Horas reconocidas (opcional)");
  hoursLabel.htmlFor = hours.id;
  hoursWrapper.append(hoursLabel, hours);
  const description = textField("edit-description", "Descripción", record.descripcion || "");
  grid.append(entry.wrapper, exit.wrapper, hoursWrapper, description.wrapper);
  const note = el("p", "field__message", "Déjalo vacío para recalcular las horas según la entrada y salida, o escribe un valor para corregirlas manualmente.");
  const error = el("p", "field__message field__message--error");
  error.setAttribute("role", "alert");
  form.append(grid, note, error);
  const save = button("Guardar corrección", "primary");
  save.type = "submit";
  const footer = el("div", "inline-actions");
  footer.append(save);
  const modal = openModal({ title: `Corregir asistencia · ${record.nombreCompleto}`, body: form, footer, className: "modal--wide" });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    save.disabled = true;
    try {
      await api.updateAttendance(record.practicanteId, record.id, {
        horaEntrada: fromLocalDateTime(entry.input.value),
        horaSalida: exit.input.value ? fromLocalDateTime(exit.input.value) : null,
        horas: hours.value === "" ? undefined : Number(hours.value),
        descripcion: description.input.value.trim(),
      });
      modal.close();
      toast("Asistencia corregida y horas recalculadas.", "success");
      await loadDashboard(true);
    } catch (problem) {
      error.textContent = problem.message;
      toast(problem.message, "error");
      save.disabled = false;
    }
  });
}

async function deleteAttendance(record) {
  const accepted = await confirmAction({
    title: "Eliminar asistencia",
    message: `Se eliminará el registro de ${record.nombreCompleto} y se descontarán ${Number(record.horas || 0).toFixed(2)} horas.`,
    confirmText: "Eliminar registro",
  });
  if (!accepted) return;
  const oldRecords = state.attendances;
  state.attendances = oldRecords.filter((item) => item.id !== record.id);
  renderStats();
  renderCurrentTab();
  try {
    await api.deleteAttendance(record.practicanteId, record.id);
    toast("Asistencia eliminada.", "success");
    await loadDashboard(false);
  } catch (error) {
    state.attendances = oldRecords;
    renderCurrentTab();
    toast(error.message, "error");
  }
}

function showManualAttendance(person) {
  const form = el("form", "form-section");
  const grid = el("div", "form-grid form-grid--2");
  const entry = datetimeField("manual-entry", "Hora de entrada", new Date().toISOString(), true);
  const exit = datetimeField("manual-exit", "Hora de salida (opcional)", "", false);
  const description = textField("manual-description", "Motivo o descripción", "Registro manual del administrador");
  grid.append(entry.wrapper, exit.wrapper, description.wrapper);
  const note = el("p", "field__message", "La API registra la duración calculada entre entrada y salida; no permite ajustar un total de horas sin marcación.");
  const error = el("p", "field__message field__message--error");
  error.setAttribute("role", "alert");
  form.append(grid, note, error);
  const save = button("Guardar asistencia", "primary");
  save.type = "submit";
  const footer = el("div", "inline-actions");
  footer.append(save);
  const modal = openModal({ title: `Asistencia manual · ${person.nombreCompleto}`, body: form, footer });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    save.disabled = true;
    try {
      await api.createManualAttendance(person.id, {
        horaEntrada: fromLocalDateTime(entry.input.value),
        horaSalida: exit.input.value ? fromLocalDateTime(exit.input.value) : null,
        descripcion: description.input.value.trim(),
      });
      modal.close();
      toast("Asistencia manual registrada.", "success");
      await loadDashboard(true);
    } catch (problem) {
      error.textContent = problem.message;
      toast(problem.message, "error");
      save.disabled = false;
    }
  });
}

function datetimeField(id, labelText, value, required) {
  const wrapper = el("div", "field");
  const label = el("label", "", labelText);
  label.htmlFor = id;
  const input = document.createElement("input");
  input.id = id;
  input.type = "datetime-local";
  input.required = required;
  input.value = toLocalDateTime(value);
  wrapper.append(label, input);
  return { wrapper, input };
}

function textField(id, labelText, value) {
  const wrapper = el("div", "field");
  const label = el("label", "", labelText);
  label.htmlFor = id;
  const input = document.createElement("input");
  input.id = id;
  input.type = "text";
  input.value = value;
  wrapper.append(label, input);
  return { wrapper, input };
}

function formatTime(value) {
  return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function handleHashChange() {
  if (!dashboard.hidden) selectTab(location.hash.slice(2));
}

function handleShortcuts(event) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  const typing = target instanceof HTMLElement
    && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);
  if (!typing && event.key === "/" && !dashboard.hidden && state.tab === "practicantes") {
    event.preventDefault();
    document.querySelector("#practitioner-search")?.focus();
  }
  if (!typing && event.key.toLocaleLowerCase() === "g") {
    window.setTimeout(() => {
      if (window.__goKey && !dashboard.hidden) selectTab("practicantes");
      window.__goKey = false;
    }, 800);
    window.__goKey = true;
  } else if (!typing && event.key.toLocaleLowerCase() === "p" && window.__goKey && !dashboard.hidden) {
    selectTab("practicantes");
    window.__goKey = false;
  }
}

function showErrorBoundary() {
  errorBoundary.hidden = false;
}

bootstrap().catch((error) => {
  console.error("No se pudo iniciar la interfaz:", error);
  showErrorBoundary();
});
