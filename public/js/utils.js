const iconPaths = {
  user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21v-2a8 8 0 0 1 16 0v2"></path>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>',
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
  people: '<path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20"></path><circle cx="9.5" cy="7" r="4"></circle><path d="M17 11a4 4 0 0 0 0-8m4 17v-1.5a4 4 0 0 0-3-3.87"></path>',
  check: '<path d="m5 12 4 4L19 6"></path>',
  alert: '<path d="M12 9v4m0 4h.01"></path><path d="M10.3 3.9 1.8 18.6A1.6 1.6 0 0 0 3.2 21h17.6a1.6 1.6 0 0 0 1.4-2.4L13.7 3.9a2 2 0 0 0-3.4 0Z"></path>',
  search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path>',
  edit: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path>',
  trash: '<path d="M3 6h18m-2 0-.9 14H5.9L5 6m3 0V4h8v2m-5 4v6m3-6v6"></path>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"></path><circle cx="12" cy="12" r="3"></circle>',
  close: '<path d="m18 6-12 12M6 6l12 12"></path>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5"></path><path d="M5 17v4h14v-4"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path>',
  info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5m0-8h.01"></path>',
  sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"></path>',
};

// Crea elementos con texto plano y atributos controlados, sin inyectar datos HTML.
export function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

// Construye iconos SVG desde fragmentos estáticos definidos en este módulo.
export function icon(name, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  if (className) svg.setAttribute("class", className);
  const fragment = document.createRange().createContextualFragment(iconPaths[name] || iconPaths.info);
  svg.append(fragment);
  return svg;
}

// Formatea fecha y hora usando el huso horario local del navegador.
export function formatDate(value, options = {}) {
  if (!value) return "Sin marcar";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha inválida";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(date);
}

// Convierte una fecha ISO a valor local aceptado por input datetime-local.
export function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

// Convierte el valor local de datetime-local a un instante ISO.
export function fromLocalDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

// Retrasa una función para evitar filtrar o buscar en cada tecla.
export function debounce(callback, delay = 300) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

// Crea una etiqueta de estado usando solo las variantes de diseño disponibles.
export function badge(label, variant = "neutral", size = "md") {
  return el("span", `badge badge--${variant}${size === "sm" ? " badge--sm" : ""}`, label);
}

// Devuelve el estado visual del avance de horas según su porcentaje.
export function progressClass(percent) {
  if (percent < 30) return "progress__fill--danger";
  if (percent < 70) return "progress__fill--warning";
  return "";
}

// Genera y descarga CSV escapando comillas y separadores en los datos.
export function downloadCsv(filename, headers, rows) {
  const escape = (value) => {
    const text = String(value ?? "");
    const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  };
  const content = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function button(label, variant = "secondary", size = "md") {
  const node = el("button", `button button--${variant}${size === "md" ? "" : ` button--${size}`}`, label);
  node.type = "button";
  return node;
}
