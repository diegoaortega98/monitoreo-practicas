import { el } from "../utils.js";

// Renderiza filas placeholder durante la lectura de la API.
export function tableSkeleton(count = 5) {
  const wrap = el("div", "table-wrap");
  const rows = document.createDocumentFragment();
  for (let index = 0; index < count; index += 1) {
    const row = el("div", "skeleton skeleton--row");
    row.setAttribute("aria-hidden", "true");
    rows.append(row);
  }
  wrap.append(rows);
  wrap.setAttribute("aria-label", "Cargando registros");
  return wrap;
}

export function cardSkeleton() {
  const node = el("div", "card skeleton skeleton--card");
  node.setAttribute("aria-hidden", "true");
  return node;
}
