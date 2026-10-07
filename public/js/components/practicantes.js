import { state, savePreferences } from "../state.js";
import { badge, button, debounce, el, icon, progressClass } from "../utils.js";
import { tableSkeleton } from "../ui/skeleton.js";

// Construye filtros y una tabla adaptable con acciones administrativas.
export function renderPractitioners({ practitioners, attendances = [], onAction, onNew, highlightId = "" }) {
  const section = el("section", "tab-panel");
  const toolbar = el("div", "toolbar");
  const filters = el("div", "toolbar__filters");
  const searchWrap = el("div", "field");
  const searchLabel = el("label", "", "Buscar practicante");
  searchLabel.htmlFor = "practitioner-search";
  const searchControl = el("div", "field__control");
  searchControl.append(icon("search", "field__icon"));
  const search = document.createElement("input");
  search.id = "practitioner-search";
  search.type = "search";
  search.placeholder = "Nombre o documento";
  search.value = state.search;
  search.setAttribute("aria-label", "Buscar por nombre o documento");
  searchControl.append(search);
  searchWrap.append(searchLabel, searchControl);

  const careerWrap = el("div", "field");
  const careerLabel = el("label", "", "Filtrar por carrera");
  careerLabel.htmlFor = "career-filter";
  const career = document.createElement("select");
  career.id = "career-filter";
  const all = el("option", "", "Todas las carreras");
  all.value = "";
  career.append(all);
  [...new Set(practitioners.map((person) => person.carrera).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"))
    .forEach((name) => {
      const option = el("option", "", name);
      option.value = name;
      career.append(option);
    });
  career.value = state.career;
  careerWrap.append(careerLabel, career);
  filters.append(searchWrap, careerWrap);

  const actions = el("div", "toolbar__actions");
  const addButton = button("Nuevo practicante", "primary");
  addButton.prepend(icon("plus"));
  addButton.addEventListener("click", onNew);
  actions.append(addButton);
  toolbar.append(filters, actions);

  const count = el("p", "field__message", `${practitioners.length} practicante${practitioners.length === 1 ? "" : "s"} registrado${practitioners.length === 1 ? "" : "s"}`);
  const wrap = el("div", "table-wrap table-wrap--responsive");
  const table = el("table", "data-table");
  const head = el("thead");
  const header = el("tr");
  ["Nombre", "Documento", "Carrera", "Semestres", "Horas / meta", "Estado", "Asistencia hoy", "Acciones"].forEach((label, index) => {
    const cell = el("th", "", label);
    cell.scope = "col";
    if (index === 2 || index === 3) cell.dataset.priority = "low";
    header.append(cell);
  });
  head.append(header);
  const body = el("tbody");
  const filteredRows = [];

  practitioners.forEach((person) => {
    const row = el("tr");
    const percent = person.metaHoras > 0
      ? Math.min(100, Math.max(0, (Number(person.horasAcumuladas || 0) / Number(person.metaHoras)) * 100))
      : 0;
    const name = el("td");
    name.dataset.label = "Nombre";
    name.append(el("strong", "", person.nombreCompleto));
    const documentCell = el("td", "", person.documento);
    documentCell.dataset.label = "Documento";
    const careerCell = el("td", "", person.carrera);
    careerCell.dataset.label = "Carrera";
    careerCell.dataset.priority = "low";
    const semesters = el("td", "", person.semestresCursados);
    semesters.dataset.label = "Semestres";
    semesters.dataset.priority = "low";
    const progressCell = el("td");
    progressCell.dataset.label = "Horas / meta";
    const progress = el("div", "progress");
    const labels = el("div", "progress__meta");
    labels.append(
      el("span", "", `${Number(person.horasAcumuladas || 0).toFixed(1)} h`),
      el("span", "", `${Number(person.metaHoras).toFixed(0)} h`),
    );
    const track = el("div", "progress__track");
    const fill = el("div", `progress__fill ${progressClass(percent)}`);
    fill.style.width = `${percent}%`;
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(Math.round(percent)));
    track.setAttribute("aria-label", `Progreso de ${person.nombreCompleto}: ${percent.toFixed(1)} por ciento`);
    track.append(fill);
    progress.append(labels, track);
    progressCell.append(progress);
    const status = el("td");
    status.dataset.label = "Estado";
    status.append(badge(percent >= 100 ? "Completado" : "En práctica", percent >= 100 ? "success" : "info", "sm"));
    const todayAttendance = getTodayAttendance(attendances, person.id);
    const attendanceStatus = el("td");
    attendanceStatus.dataset.label = "Asistencia hoy";
    attendanceStatus.append(
      badge(
        todayAttendance ? (todayAttendance.horaSalida ? "Salida marcada" : "En jornada") : "Sin marcación",
        todayAttendance ? (todayAttendance.horaSalida ? "success" : "warning") : "neutral",
        "sm",
      ),
    );
    const actionCell = el("td");
    actionCell.dataset.label = "Acciones";
    const actionBar = el("div", "table-actions");
    [
      ["detail", "Ver", "info"],
      ["edit", "Editar", "edit"],
      ["delete", "Eliminar", "trash"],
    ].forEach(([action, label, iconName]) => {
      const actionButton = button("", "ghost", "sm");
      actionButton.setAttribute("aria-label", `${label}: ${person.nombreCompleto}`);
      actionButton.title = label;
      actionButton.dataset.action = action;
      actionButton.dataset.id = person.id;
      actionButton.append(icon(iconName));
      actionBar.append(actionButton);
    });
    actionCell.append(actionBar);
    row.append(name, documentCell, careerCell, semesters, progressCell, status, attendanceStatus, actionCell);
    row.dataset.name = `${person.nombreCompleto} ${person.documento}`.toLocaleLowerCase("es-CO");
    row.dataset.career = person.carrera;
    if (person.id === highlightId) row.classList.add("row-highlight");
    body.append(row);
    filteredRows.push(row);
  });

  table.append(head, body);
  wrap.append(table);
  section.append(toolbar, count, wrap);

  if (!practitioners.length) {
    section.replaceChildren(createEmptyState(
      "Aún no hay practicantes",
      "Registra los datos de la primera persona para comenzar a llevar el control de sus horas.",
      "Crear practicante",
      onNew,
    ));
    return section;
  }

  const applyFilter = () => {
    const query = search.value.trim().toLocaleLowerCase("es-CO");
    const selectedCareer = career.value;
    state.search = query;
    state.career = selectedCareer;
    savePreferences();
    let visible = 0;
    filteredRows.forEach((row) => {
      row.hidden = !row.dataset.name.includes(query)
        || Boolean(selectedCareer && row.dataset.career !== selectedCareer);
      if (!row.hidden) visible += 1;
    });
    count.textContent = `${visible} resultado${visible === 1 ? "" : "s"}`;
  };
  search.addEventListener("input", debounce(applyFilter, 300));
  career.addEventListener("change", applyFilter);
  wrap.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) onAction(actionButton.dataset.action, actionButton.dataset.id);
  });
  applyFilter();
  return section;
}

function getTodayAttendance(attendances, practitionerId) {
  const now = new Date();
  return attendances
    .filter((record) => {
      const entry = new Date(record.horaEntrada);
      return record.practicanteId === practitionerId
        && entry.getFullYear() === now.getFullYear()
        && entry.getMonth() === now.getMonth()
        && entry.getDate() === now.getDate();
    })
    .sort((a, b) => new Date(b.horaEntrada) - new Date(a.horaEntrada))[0] || null;
}

// Crea el formulario compatible con los campos que realmente acepta la API.
export function renderPractitionerForm(person = null, onSubmit) {
  const form = el("form", "form-section");
  const grid = el("div", "form-grid form-grid--2");
  const fields = [
    ["nombreCompleto", "Nombre completo", "text", person?.nombreCompleto || "", "Nombre y apellidos"],
    ["documento", "Número de documento", "text", person?.documento || "", "Identificación"],
    ["carrera", "Carrera o estudio", "text", person?.carrera || "", "Programa de formación"],
    ["semestresCursados", "Semestres cursados", "number", person?.semestresCursados ?? "", "0"],
    ["contactoEmergencia", "Contacto de emergencia", "text", person?.contactoEmergencia || "", "Nombre de contacto"],
    ["telefono", "Número de teléfono", "tel", person?.telefono || "", "Teléfono"],
    ["metaHoras", "Meta de horas", "number", person?.metaHoras ?? "", "Horas requeridas"],
  ];
  if (person) {
    fields.push([
      "horasAcumuladas",
      "Horas acumuladas",
      "number",
      person.horasAcumuladas ?? 0,
      "Horas realizadas",
    ]);
  }
  fields.forEach(([name, labelText, type, value, placeholder]) => {
    const group = el("div", "field");
    const label = el("label", "", labelText);
    const id = `practitioner-${name}`;
    label.htmlFor = id;
    const input = document.createElement("input");
    input.id = id;
    input.name = name;
    input.type = type;
    input.value = value;
    input.placeholder = placeholder;
    input.required = true;
    input.autocomplete = name === "documento" ? "off" : "on";
    if (name === "semestresCursados") {
      input.min = "0";
      input.step = "1";
      input.inputMode = "numeric";
    }
    if (name === "metaHoras") {
      input.min = "0.01";
      input.step = "0.01";
    }
    if (name === "horasAcumuladas") {
      input.min = "0";
      input.step = "0.01";
    }
    const message = el("span", "field__message");
    message.id = `${id}-message`;
    input.setAttribute("aria-describedby", message.id);
    group.append(label, input, message);
    grid.append(group);
  });

  const note = el(
    "p",
    "field__message",
    person
      ? "Puedes corregir los datos personales, la meta y las horas acumuladas."
      : "El contacto de emergencia se guarda junto con los demás datos del practicante.",
  );
  const actions = el("div", "inline-actions");
  const save = button(person ? "Guardar cambios" : "Registrar practicante", "primary");
  save.type = "submit";
  const error = el("p", "field__message field__message--error");
  error.setAttribute("role", "alert");
  actions.append(save);
  form.append(grid, note, error, actions);
  form.addEventListener("input", debounce((event) => validateField(event.target), 300));
  form.addEventListener("blur", (event) => validateField(event.target), true);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const payload = {
      nombreCompleto: data.get("nombreCompleto").trim(),
      documento: String(data.get("documento") || "").trim().replace(/[\s.-]+/g, "").toUpperCase(),
      carrera: data.get("carrera").trim(),
      semestresCursados: Number(data.get("semestresCursados")),
      contactoEmergencia: data.get("contactoEmergencia").trim(),
      telefono: data.get("telefono").trim(),
      metaHoras: Number(data.get("metaHoras")),
    };
    if (person) payload.horasAcumuladas = Number(data.get("horasAcumuladas"));
    save.disabled = true;
    save.replaceChildren(el("span", "button__spinner"), el("span", "", "Guardando…"));
    try {
      await onSubmit(payload);
    } catch (problem) {
      error.textContent = problem.message;
      error.classList.add("shake");
    } finally {
      if (save.isConnected) {
        save.disabled = false;
        save.textContent = person ? "Guardar cambios" : "Registrar practicante";
      }
    }
  });
  return form;
}

export function createEmptyState(title, description, actionText = "", onAction = null) {
  const empty = el("div", "empty-state");
  const symbol = el("span", "empty-state__icon");
  symbol.append(icon("people"));
  empty.append(symbol, el("h3", "", title), el("p", "", description));
  if (actionText && onAction) {
    const action = button(actionText, "primary");
    action.addEventListener("click", onAction);
    empty.append(action);
  }
  return empty;
}

function validateField(input) {
  if (!(input instanceof HTMLInputElement)) return;
  const valid = input.checkValidity();
  input.setAttribute("aria-invalid", String(!valid));
  const message = document.querySelector(`#${CSS.escape(input.id)}-message`);
  if (message) message.textContent = valid ? "" : input.validationMessage;
}

export function practitionerLoading() {
  return tableSkeleton(6);
}
