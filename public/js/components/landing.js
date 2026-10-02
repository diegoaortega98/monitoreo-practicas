import { api } from "../api.js";
import { state } from "../state.js";
import { el, formatDate } from "../utils.js";
import { toast } from "../ui/toast.js";

let currentDocument = "";
const buttonContents = new WeakMap();

// Conecta el formulario público de marcación con las rutas de asistencia.
export function initLanding({ onRefresh }) {
  const form = document.querySelector("#clock-form");
  const feedback = document.querySelector("#clock-feedback");
  const recentSection = document.querySelector("#recent-section");
  const recentList = document.querySelector("#recent-list");

  document.querySelector("#clock-document").addEventListener("input", (event) => {
    if (currentDocument && event.target.value.trim() !== currentDocument) {
      currentDocument = event.target.value.trim();
      renderRecent(recentList, recentSection);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const action = event.submitter?.value;
    const documentInput = form.elements.documento;
    const documento = documentInput.value.trim();
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
