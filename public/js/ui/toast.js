import { el, icon } from "../utils.js";

const root = document.querySelector("#toast-root");
const activeToasts = new Set();
const toastIcons = { success: "check", error: "alert", warning: "alert", info: "info" };

// Muestra una notificación apilable; el temporizador se pausa mientras está bajo el cursor.
export function toast(message, type = "info", duration = 4000) {
  while (activeToasts.size >= 5) dismiss(activeToasts.values().next().value);
  const item = el("div", `toast toast--${type}`);
  item.setAttribute("role", "status");
  const symbol = icon(toastIcons[type] || "info");
  const text = el("p", "toast__message", message);
  const close = el("button", "toast__close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Cerrar notificación");
  item.append(symbol, text, close);
  root.append(item);
  activeToasts.add(item);

  let remaining = duration;
  let started = Date.now();
  let timer = window.setTimeout(() => dismiss(item), remaining);
  const pause = () => {
    window.clearTimeout(timer);
    remaining -= Date.now() - started;
  };
  const resume = () => {
    started = Date.now();
    timer = window.setTimeout(() => dismiss(item), Math.max(0, remaining));
  };
  item.addEventListener("mouseenter", pause);
  item.addEventListener("mouseleave", resume);
  close.addEventListener("click", () => dismiss(item));
  return item;
}

function dismiss(item) {
  if (!item || !activeToasts.has(item)) return;
  activeToasts.delete(item);
  item.classList.add("toast--out");
  window.setTimeout(() => item.remove(), 220);
}
