import { button, el } from "../utils.js";
import { openModal } from "./modal.js";

// Sustituye confirm() nativo con una confirmación accesible y explícita.
export function confirmAction({ title, message, confirmText = "Continuar", danger = true }) {
  return new Promise((resolve) => {
    let decided = false;
    const body = el("p", "", message);
    const cancel = button("Cancelar", "secondary");
    const accept = button(confirmText, danger ? "danger" : "primary");
    const footer = el("div", "inline-actions");
    footer.append(cancel, accept);
    const modal = openModal({
      title,
      body,
      footer,
      onClose: () => {
        if (!decided) resolve(false);
      },
    });
    const finish = (answer) => {
      decided = true;
      modal.close();
      resolve(answer);
    };
    cancel.addEventListener("click", () => finish(false));
    accept.addEventListener("click", () => finish(true));
  });
}
