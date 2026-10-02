import { api } from "../api.js";
import { el, icon } from "../utils.js";
import { openModal } from "../ui/modal.js";
import { toast } from "../ui/toast.js";

let retryUntil = 0;
let retryTimer = null;
let activeUser = null;
let activeExpiry = null;

// Configura el acceso oculto del administrador y las acciones del encabezado.
export function initHeader({ onAuthenticated, onLogout }) {
  document.querySelector("#admin-access-toggle").addEventListener("click", () => showLogin(onAuthenticated));
  document.querySelector("#header-logout").addEventListener("click", onLogout);
  const chip = document.querySelector("#user-chip");
  const menu = document.querySelector("#user-menu");
  chip.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    chip.setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.querySelector("#profile-menu-item").addEventListener("click", () => {
    menu.hidden = true;
    chip.setAttribute("aria-expanded", "false");
    showProfile();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".header-user-menu")) {
      menu.hidden = true;
      chip.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      menu.hidden = true;
      chip.setAttribute("aria-expanded", "false");
      chip.focus();
    }
  });
}

// Actualiza el identificador de sesión mostrado en el encabezado.
export function updateHeaderUser(user, expiresAt = null) {
  const chip = document.querySelector("#user-chip");
  const login = document.querySelector("#admin-access-toggle");
  const menu = document.querySelector("#user-menu");
  chip.hidden = !user;
  login.hidden = Boolean(user);
  menu.hidden = true;
  activeUser = user;
  activeExpiry = expiresAt;
  chip.replaceChildren();
  if (user) {
    const avatar = el("span", "avatar", (user[0] || "A").toLocaleUpperCase("es-CO"));
    const details = el("span", "user-chip__details", `${user} · Administrador`);
    chip.append(avatar, details, icon("info"));
  }
}

function showProfile() {
  const body = el("div", "session-info");
  body.append(
    profileRow("Usuario", activeUser || "Administrador"),
    profileRow("Rol", "Administrador"),
    profileRow(
      "Expira",
      activeExpiry
        ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(activeExpiry))
        : "La API no informa la expiración al restaurar una sesión.",
    ),
  );
  openModal({ title: "Perfil de sesión", body });
}

function profileRow(label, value) {
  const row = el("div", "session-info__row");
  row.append(el("span", "", label), el("strong", "", value));
  return row;
}

function showLogin(onAuthenticated) {
  const body = el("form", "form-section");
  body.noValidate = false;

  const user = createField("login-user", "Usuario", "usuario", "text", "username");
  const pass = createField("login-password", "Contraseña", "password", "password", "current-password");
  const reveal = el("button", "button button--ghost button--sm", "Mostrar");
  reveal.type = "button";
  reveal.setAttribute("aria-label", "Mostrar contraseña");
  reveal.addEventListener("click", () => {
    const visible = pass.input.type === "password";
    pass.input.type = visible ? "text" : "password";
    reveal.textContent = visible ? "Ocultar" : "Mostrar";
    reveal.setAttribute("aria-label", visible ? "Ocultar contraseña" : "Mostrar contraseña");
  });
  pass.control.append(reveal);
  const error = el("p", "field__message field__message--error");
  error.id = "login-error";
  error.setAttribute("role", "alert");
  const forgot = el("button", "button button--ghost button--sm", "¿Olvidaste tu contraseña?");
  forgot.type = "button";
  forgot.addEventListener("click", () => toast("La recuperación de contraseña no está disponible en esta API.", "info"));
  const submit = el("button", "button button--primary button--full button--lg", "Ingresar");
  submit.type = "submit";
  const sessionNote = el("p", "field__message", "La sesión permanece activa hasta 12 horas.");
  body.append(user.wrapper, pass.wrapper, sessionNote, forgot, error, submit);
  const modal = openModal({ title: "Acceso administrador", body });
  const form = modal.body.querySelector("form");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (Date.now() < retryUntil) return;
    error.textContent = "";
    submit.disabled = true;
    submit.replaceChildren(el("span", "button__spinner"), el("span", "", "Validando…"));
    try {
      const session = await api.login({
        usuario: user.input.value.trim(),
        password: pass.input.value,
      });
      retryUntil = 0;
      modal.close();
      onAuthenticated(session);
      toast("Sesión administrativa iniciada.", "success");
    } catch (problem) {
      error.textContent = problem.message;
      form.classList.remove("shake");
      requestAnimationFrame(() => form.classList.add("shake"));
      user.input.setAttribute("aria-invalid", "true");
      pass.input.setAttribute("aria-invalid", "true");
      if (problem.status === 429) startRateLimitCountdown(error, submit);
    } finally {
      if (modal.dialog.isConnected && Date.now() >= retryUntil) {
        submit.disabled = false;
        submit.textContent = "Ingresar";
      }
    }
  });
  if (Date.now() < retryUntil) startRateLimitCountdown(error, submit);
}

function createField(id, label, name, type, autocomplete) {
  const wrapper = el("div", "field");
  const caption = el("label", "", label);
  caption.htmlFor = id;
  const control = el("div", "field__control");
  const input = document.createElement("input");
  input.id = id;
  input.name = name;
  input.type = type;
  input.autocomplete = autocomplete;
  input.required = true;
  input.setAttribute("aria-describedby", "login-error");
  const fieldIcon = el("span", "field__icon");
  fieldIcon.append(icon(name === "usuario" ? "user" : "lock"));
  control.append(fieldIcon, input);
  wrapper.append(caption, control);
  return { wrapper, control, input };
}

function startRateLimitCountdown(target, submit) {
  if (retryUntil <= Date.now()) retryUntil = Date.now() + 15 * 60 * 1000;
  window.clearInterval(retryTimer);
  submit.disabled = true;
  const update = () => {
    const remaining = Math.max(0, retryUntil - Date.now());
    if (!remaining) {
      window.clearInterval(retryTimer);
      retryUntil = 0;
      submit.disabled = false;
      target.textContent = "Ya puedes volver a intentarlo.";
      return;
    }
    const seconds = Math.ceil(remaining / 1000);
    target.textContent = `Demasiados intentos. Intenta de nuevo en ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}.`;
  };
  update();
  retryTimer = window.setInterval(update, 1000);
}
