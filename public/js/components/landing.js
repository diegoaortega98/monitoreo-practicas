import { api } from "../api.js";
import { state } from "../state.js";
import { button, el, formatDate } from "../utils.js";
import { openModal } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
import { showActivitySession } from "./actividades.js";

let currentDocument = "";
const buttonContents = new WeakMap();
const REMINDER_STORAGE_KEY = "control-practicas-asistencia-pendiente";
const REMINDER_DELAY = 5 * 60 * 60 * 1000;
let reminderTimer = null;
let pendingAttendance = null;

// Conecta el formulario público de marcación con las rutas de asistencia.
export function initLanding({ onRefresh }) {
  const form = document.querySelector("#clock-form");
  const feedback = document.querySelector("#clock-feedback");
  const recentSection = document.querySelector("#recent-section");
  const recentList = document.querySelector("#recent-list");
  scheduleAttendanceReminder();
  document.addEventListener("visibilitychange", scheduleAttendanceReminder);
  window.addEventListener("storage", (event) => {
    if (event.key === REMINDER_STORAGE_KEY) {
      pendingAttendance = null;
      scheduleAttendanceReminder();
    }
  });
  const registerActions = el("div", "inline-actions");
  const registerButton = button("Registrarme", "secondary");
  registerActions.append(registerButton);
  form.after(registerActions);
  registerButton.addEventListener("click", showRegistrationModal);

  document.querySelector("#clock-document").addEventListener("input", (event) => {
    const documento = normalizarDocumentoForm(event.target.value);
    if (currentDocument && documento !== currentDocument) {
      currentDocument = documento;
      renderRecent(recentList, recentSection);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const action = event.submitter?.value;
    const documentInput = form.elements.documento;
    const documento = normalizarDocumentoForm(documentInput.value);
    if (!documento || !["entrada", "salida"].includes(action)) return;
    currentDocument = documento;

    const buttons = [...form.querySelectorAll('button[type="submit"]')];
    feedback.hidden = true;
    feedback.className = "feedback";
    if (action === "salida") {
      showActivitySession({
        documento,
        onFinish: (result) => submitAttendance({
          action: "salida",
          documento,
          resultOverride: result,
          form,
          buttons,
          feedback,
          recentList,
          recentSection,
          onRefresh,
        }),
      });
      return;
    }

    await submitAttendance({
      action,
      documento,
      form,
      buttons,
      feedback,
      recentList,
      recentSection,
      onRefresh,
    });
  });

  renderRecent(recentList, recentSection);
}

async function submitAttendance({
  action,
  documento,
  resultOverride,
  form,
  buttons,
  feedback,
  recentList,
  recentSection,
  onRefresh,
}) {
  buttons.forEach((button) => setLoading(button, true));
  try {
    if (action === "entrada") await requestNotificationPermission();
    const result = resultOverride || (action === "entrada"
      ? await api.attendanceIn(documento)
      : await api.attendanceOut(documento));
    const record = result.registro;
    if (action === "entrada") {
      savePendingAttendance(record.horaEntrada);
      scheduleAttendanceReminder();
    } else {
      clearPendingAttendance();
    }
    const time = formatDate(action === "entrada" ? record.horaEntrada : record.horaSalida);
    const message = action === "entrada"
      ? `Entrada registrada a las ${time}.`
      : `Actividades enviadas y salida registrada a las ${time}. Se sumaron ${record.horas} horas.`;
    feedback.classList.add("feedback--success");
    feedback.textContent = message;
    feedback.hidden = false;
    addRecent(recentList, action === "entrada" ? "Entrada" : "Salida", time, record.horas, documento);
    recentSection.hidden = false;
    form.reset();
    if (action === "entrada") form.elements.documento.value = documento;
    toast(message, "success");
    await onRefresh();
    return true;
  } catch (problem) {
    if (action === "entrada" && problem.status === 409) {
      const message = "Ya marcaste entrada hoy. Puedes continuar a marcar salida.";
      feedback.classList.add("feedback--warning");
      feedback.textContent = message;
      feedback.hidden = false;
      toast(message, "warning");
      return false;
    }
    const pending = problem.status === 409;
    feedback.classList.add(pending ? "feedback--warning" : "feedback--error");
    feedback.textContent = problem.message;
    feedback.hidden = false;
    toast(problem.message, pending ? "warning" : "error");
    return false;
  } finally {
    buttons.forEach((button) => setLoading(button, false));
  }
}

async function requestNotificationPermission() {
  if (!("Notification" in window) || Notification.permission !== "default") return;
  try {
    await Notification.requestPermission();
  } catch (error) {
    console.warn("No se pudo solicitar permiso para notificaciones del navegador.", error);
  }
}

function scheduleAttendanceReminder() {
  window.clearTimeout(reminderTimer);
  const pending = readPendingAttendance();
  if (!pending || pending.notified) return;
  const elapsed = Date.now() - Date.parse(pending.horaEntrada);
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    clearPendingAttendance();
    return;
  }
  reminderTimer = window.setTimeout(() => {
    const latest = readPendingAttendance();
    if (!latest || latest.notified) return;
    latest.notified = true;
    writePendingAttendance(latest);
    const message = "Llevas 5 horas desde tu entrada. Recuerda enviar tus actividades y marcar la salida.";
    toast(message, "warning", 10_000);
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        const notification = new Notification("Recordatorio de salida", { body: message });
        notification.addEventListener("click", () => window.focus(), { once: true });
      } catch (error) {
        console.warn("No se pudo mostrar la notificación del navegador.", error);
      }
    }
  }, Math.max(0, REMINDER_DELAY - elapsed));
}

function readPendingAttendance() {
  try {
    const value = JSON.parse(localStorage.getItem(REMINDER_STORAGE_KEY) || "null");
    if (!value || typeof value.horaEntrada !== "string" || typeof value.notified !== "boolean") {
      return pendingAttendance;
    }
    pendingAttendance = value;
    return value;
  } catch (error) {
    console.warn("No se pudo leer el recordatorio de asistencia guardado.", error);
    return pendingAttendance;
  }
}

function savePendingAttendance(horaEntrada) {
  writePendingAttendance({ horaEntrada, notified: false });
}

function writePendingAttendance(value) {
  pendingAttendance = value;
  try {
    localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(value));
  } catch (error) {
    console.warn("No se pudo guardar el recordatorio de asistencia.", error);
  }
}

function clearPendingAttendance() {
  window.clearTimeout(reminderTimer);
  reminderTimer = null;
  pendingAttendance = null;
  try {
    localStorage.removeItem(REMINDER_STORAGE_KEY);
  } catch (error) {
    console.warn("No se pudo borrar el recordatorio de asistencia.", error);
  }
}

// Permite enviar una solicitud pública de registro para aprobación administrativa.
function showRegistrationModal() {
  const form = el("form", "form-section");
  form.id = "registration-form";
  const grid = el("div", "form-grid form-grid--2");
  const fields = [
    ["nombreCompleto", "Nombre completo", "text", true],
    ["documento", "Documento", "text", true],
    ["carrera", "Carrera", "text", true],
    ["semestresCursados", "Semestres cursados", "number", true],
    ["telefono", "Teléfono", "tel", true],
    ["contactoEmergencia", "Contacto de emergencia", "text", true],
    ["email", "Email (opcional)", "email", false],
  ];
  fields.forEach(([name, labelText, type, required]) => {
    const wrapper = el("div", "field");
    const label = el("label", "", labelText);
    const input = document.createElement("input");
    input.type = type;
    input.name = name;
    input.required = required;
    if (name === "semestresCursados") {
      input.min = "0";
      input.step = "1";
      input.inputMode = "numeric";
    }
    label.htmlFor = `registration-${name}`;
    input.id = label.htmlFor;
    wrapper.append(label, input);
    grid.append(wrapper);
  });
  const error = el("p", "field__message field__message--error");
  error.setAttribute("role", "alert");
  const submit = button("Enviar solicitud", "primary");
  submit.type = "submit";
  submit.setAttribute("form", form.id);
  const footer = el("div", "inline-actions");
  footer.append(submit);
  form.append(grid, error);
  const modal = openModal({
    title: "Registro de practicante",
    body: form,
    footer,
    className: "modal--wide",
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const payload = {
      nombreCompleto: values.get("nombreCompleto").trim(),
      documento: normalizarDocumentoForm(values.get("documento")),
      carrera: values.get("carrera").trim(),
      semestresCursados: Number(values.get("semestresCursados")),
      telefono: values.get("telefono").trim(),
      contactoEmergencia: values.get("contactoEmergencia").trim(),
      email: values.get("email").trim() || undefined,
    };
    submit.disabled = true;
    try {
      const result = await api.registrarPracticante(payload);
      form.reset();
      modal.close();
      toast(result.mensaje, "success");
    } catch (problem) {
      error.textContent = problem.message;
      toast(problem.message, problem.status === 409 ? "warning" : "error");
    } finally {
      if (submit.isConnected) submit.disabled = false;
    }
  });
}

function addRecent(list, label, time, hours, documento) {
  state.recentActivity.unshift({ label, time, hours, documento });
  state.recentActivity = state.recentActivity.slice(0, 12);
  renderRecent(list, document.querySelector("#recent-section"));
}

function renderRecent(list, section) {
  list.replaceChildren();
  const records = state.recentActivity.filter((record) => record.documento === currentDocument).slice(0, 3);
  records.forEach((record) => {
    const row = el("article", "recent-item");
    const detail = el("div");
    detail.append(el("strong", "", record.label), el("p", "", record.time));
    row.append(detail, el("span", "badge badge--success", record.label === "Salida" ? `${record.hours} h` : "Sesión activa"));
    list.append(row);
  });
  section.hidden = records.length === 0;
}

function normalizarDocumentoForm(value) {
  return String(value ?? "").trim().replace(/[\s.-]+/g, "").toUpperCase();
}

function setLoading(button, loading) {
  button.disabled = loading;
  if (loading) {
    if (!buttonContents.has(button)) {
      buttonContents.set(button, [...button.childNodes].map((node) => node.cloneNode(true)));
    }
    button.replaceChildren(el("span", "button__spinner"), el("span", "", "Procesando…"));
  } else {
    button.replaceChildren(...buttonContents.get(button).map((node) => node.cloneNode(true)));
  }
}
