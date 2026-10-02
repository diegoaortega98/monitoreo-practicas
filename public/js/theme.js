import { state, savePreferences } from "./state.js";

const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme() {
  const useDark = state.theme === "dark" || (state.theme === "system" && systemTheme.matches);
  document.documentElement.dataset.theme = useDark ? "dark" : "light";
  const button = document.querySelector("#theme-toggle");
  button.setAttribute("aria-label", `Tema: ${state.theme}. Cambiar tema`);
  button.title = `Tema actual: ${state.theme}`;
}

export function setThemePreference(theme) {
  if (!["system", "light", "dark"].includes(theme)) return;
  state.theme = theme;
  savePreferences();
  applyTheme();
}

// Inicializa la preferencia de tema y sincroniza el modo del sistema operativo.
export function initTheme() {
  applyTheme();
  systemTheme.addEventListener("change", () => {
    if (state.theme === "system") applyTheme();
  });
  document.querySelector("#theme-toggle").addEventListener("click", () => {
    const modes = ["system", "light", "dark"];
    setThemePreference(modes[(modes.indexOf(state.theme) + 1) % modes.length]);
  });
}

export function getThemePreference() {
  return state.theme;
}
