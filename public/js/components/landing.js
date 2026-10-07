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
    buttons.forEach((button) => setLoading(button, true));
    feedback.hidden = true;
    feedback.className = "feedback";
    try {
      const result = action === "entrada"
        ? await api.attendanceIn(documento)
        : await api.attendanceOut(documento);
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
    } catch (problem) {
      const pending = problem.status === 409;
      feedback.classList.add(pending ? "feedback--warning" : "feedback--error");
      feedback.textContent = problem.message;
      feedback.hidden = false;
      toast(problem.message, pending ? "warning" : "error");
    } finally {
      buttons.forEach((button) => setLoading(button, false));
    }
  });

  renderRecent(recentList, recentSection);
}

// Permite enviar una solicitud pública de registro para aprobación administrativa.
function showRegistrationModal() {
  const form = el("form", "form-section");
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
      email: values.get("email").trim(),
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
