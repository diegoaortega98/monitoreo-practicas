import { api } from "../api.js";
import { state } from "../state.js";
import { button, el, formatDate } from "../utils.js";
import { openModal } from "../ui/modal.js";
import { toast } from "../ui/toast.js";

let currentDocument = "";
const buttonContents = new WeakMap();

// Conecta el formulario público de marcación con las rutas de asistencia.
export function initLanding({ onRefresh }) {
  const form = document.querySelector("#clock-form");
  const feedback = document.querySelector("#clock-feedback");
  const recentSection = document.querySelector("#recent-section");
  const recentList = document.querySelector("#recent-list");
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
      showActivitiesModal({
        documento,
        onSubmit: (descripcion) => submitAttendance({
          action,
          documento,
          descripcion,
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

function showActivitiesModal({ documento, onSubmit }) {
  const form = el("form", "form-section");
  const wrapper = el("div", "field");
  const label = el("label", "", "Actividades realizadas");
  const description = document.createElement("textarea");
  description.id = "attendance-activities";
  description.name = "descripcion";
  description.rows = 5;
  description.required = true;
  description.maxLength = 2000;
  description.placeholder = "Describe las tareas que realizaste durante la jornada";
  label.htmlFor = description.id;
  const help = el("span", "field__message", "Este registro es obligatorio para marcar la salida.");
  help.id = "attendance-activities-help";
  description.setAttribute("aria-describedby", help.id);
  wrapper.append(label, description, help);
  form.append(wrapper);

  const submit = button("Guardar actividades y marcar salida", "primary");
  submit.type = "submit";
  const footer = el("div", "inline-actions");
  footer.append(submit);
  const modal = openModal({
    title: "Registrar actividades",
    body: form,
    footer,
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const activity = description.value.trim();
    if (!activity) {
      description.setCustomValidity("Describe al menos una actividad.");
      description.reportValidity();
      description.setCustomValidity("");
      return;
    }
    submit.disabled = true;
    submit.textContent = "Procesando…";
    try {
      const saved = await onSubmit(activity);
      if (saved) modal.close();
    } finally {
      if (submit.isConnected) {
        submit.disabled = false;
        submit.textContent = "Guardar actividades y marcar salida";
      }
    }
  });
}

async function submitAttendance({
  action,
  documento,
  descripcion,
  form,
  buttons,
  feedback,
  recentList,
  recentSection,
  onRefresh,
}) {
  buttons.forEach((button) => setLoading(button, true));
  try {
    const result = action === "entrada"
      ? await api.attendanceIn(documento)
      : await api.attendanceOut(documento, descripcion);
    const record = result.registro;
    const time = formatDate(action === "entrada" ? record.horaEntrada : record.horaSalida);
    const message = action === "entrada"
      ? `Entrada registrada a las ${time}.`
      : `Salida registrada a las ${time}. Se sumaron ${record.horas} horas.`;
    feedback.classList.add("feedback--success");
    feedback.textContent = message;
    feedback.hidden = false;
    addRecent(recentList, action === "entrada" ? "Entrada" : "Salida", time, record.horas, documento);
    recentSection.hidden = false;
    form.reset();
    toast(message, "success");
    await onRefresh();
    return true;
  } catch (problem) {
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
