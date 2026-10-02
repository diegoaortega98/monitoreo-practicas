import { state } from "../state.js";
import { el } from "../utils.js";
import { setThemePreference } from "../theme.js";

// Presenta ajustes locales e identifica claramente lo que el servidor no expone.
export function renderSettings() {
  const section = el("section", "tab-panel");
  const card = el("article", "card");
  const header = el("div", "card__header");
  header.append(el("h2", "", "Preferencias"));
  const body = el("div", "card__body form-section");

  const themeGroup = el("div", "field");
  const themeLabel = el("label", "", "Tema de la interfaz");
  themeLabel.htmlFor = "theme-preference";
  const theme = document.createElement("select");
  theme.id = "theme-preference";
  [["system", "Según el dispositivo"], ["light", "Claro"], ["dark", "Oscuro"]].forEach(([value, label]) => {
    const option = el("option", "", label);
    option.value = value;
    theme.append(option);
  });
  theme.value = state.theme;
  themeGroup.append(themeLabel, theme);
  theme.addEventListener("change", () => setThemePreference(theme.value));

  const session = el("div", "session-info");
  session.append(
    infoRow("Usuario", state.user || "Administrador"),
    infoRow("Rol", "Administrador"),
    infoRow("Expira", state.expiresAt ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(state.expiresAt)) : "No disponible"),
    infoRow("Dirección IP", "No disponible en esta API"),
  );
  const unsupported = el("p", "field__message", "La API actual no ofrece cierre global de sesiones ni recuperación de contraseña. La sesión activa sí puede cerrarse desde el encabezado.");
  body.append(themeGroup, el("h3", "", "Sesión actual"), session, unsupported);
  card.append(header, body);
  section.append(card);
  return section;
}

function infoRow(label, value) {
  const row = el("div", "session-info__row");
  row.append(el("span", "", label), el("strong", "", value));
  return row;
}
