import { el } from "../utils.js";

let activeModal = null;

// Abre un diálogo accesible y devuelve su contenido y su función de cierre.
export function openModal({ title, body, footer, className = "", labelledBy = "", onClose }) {
  closeModal();
  const previousFocus = document.activeElement;
  const backdrop = el("div", "modal-backdrop");
  const dialog = el("section", `modal ${className}`.trim());
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  const titleId = labelledBy || `dialog-title-${Date.now()}`;
  dialog.setAttribute("aria-labelledby", titleId);
  const heading = el("h2", "", title);
  heading.id = titleId;
  const headingRow = el("div", "modal__header");
  const close = el("button", "icon-button", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Cerrar ventana");
  headingRow.append(heading, close);
  const bodyRegion = el("div", "modal__body");
  if (body) bodyRegion.append(body);
  dialog.append(headingRow, bodyRegion);
  if (footer) {
    const footerRegion = el("div", "modal__footer");
    footerRegion.append(footer);
    dialog.append(footerRegion);
  }
  backdrop.append(dialog);
  document.querySelector("#modal-root").append(backdrop);

  let closed = false;
  const closeThis = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    activeModal = null;
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    onClose?.();
  };
  const onKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeThis();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
    )].filter((node) => node.getClientRects().length);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  close.addEventListener("click", closeThis);
  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop) closeThis();
  });
  document.addEventListener("keydown", onKeydown);
  const removeKeyListener = () => document.removeEventListener("keydown", onKeydown);
  const observer = new MutationObserver(() => {
    if (!backdrop.isConnected) {
      removeKeyListener();
      observer.disconnect();
    }
  });
  observer.observe(document.querySelector("#modal-root"), { childList: true });
  activeModal = { close: closeThis, dialog, body: bodyRegion };
  requestAnimationFrame(() => {
    const focusable = dialog.querySelector("input, button, select, textarea");
    (focusable || dialog).focus();
  });
  return activeModal;
}

export function closeModal() {
  activeModal?.close();
}

export function currentModal() {
  return activeModal;
}
