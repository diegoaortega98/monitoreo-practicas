import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { query, usaPostgres } from "./db.js";

const COOKIE_NAME = "control_practicas_admin";
const DURACION_SESION_MS = 12 * 60 * 60 * 1000;
const sesiones = new Map();
const intentosLogin = new Map();
const VENTANA_LOGIN_MS = 15 * 60 * 1000;
const MAX_INTENTOS_LOGIN = 5;
let hashPasswordAdmin;

// Compara secretos en tiempo constante para evitar filtrar coincidencias parciales.
function compararSecretos(valor, esperado) {
  const recibido = Buffer.from(valor);
  const correcto = Buffer.from(esperado);
  return recibido.length === correcto.length && timingSafeEqual(recibido, correcto);
}

// Inicia sesión de administrador usando credenciales configuradas en el entorno.
export async function iniciarSesionAdmin(usuario, password, ip = "desconocida", userAgent = "") {
  const adminUsuario = process.env.ADMIN_USER;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminUsuario || !adminPassword) {
    const error = new Error("Configura ADMIN_USER y ADMIN_PASSWORD en el entorno del servidor.");
    error.status = 503;
    throw error;
  }

  const ahora = Date.now();
  const intentosRecientes = (intentosLogin.get(ip) || [])
    .filter((intento) => ahora - intento < VENTANA_LOGIN_MS);
  if (intentosRecientes.length >= MAX_INTENTOS_LOGIN) {
    intentosLogin.set(ip, intentosRecientes);
    const error = new Error("Demasiados intentos. Espera 15 minutos antes de volver a intentar.");
    error.status = 429;
    throw error;
  }

  hashPasswordAdmin ||= bcrypt.hash(adminPassword, 12);
  const hash = await hashPasswordAdmin;
  const usuarioValido = compararSecretos(usuario, adminUsuario);
  const passwordValida = await bcrypt.compare(password, hash);
  if (!usuarioValido || !passwordValida) {
    intentosRecientes.push(ahora);
    intentosLogin.set(ip, intentosRecientes);
    const error = new Error("Usuario o contraseña incorrectos.");
    error.status = 401;
    throw error;
  }

  intentosLogin.delete(ip);
  const token = randomBytes(32).toString("base64url");
  const expiraEn = Date.now() + DURACION_SESION_MS;
  if (usaPostgres()) {
    await query("DELETE FROM sesiones_admin WHERE expira_en <= NOW()");
    await query(
      `INSERT INTO sesiones_admin (token_hash, usuario, expira_en, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [hashToken(token), adminUsuario, new Date(expiraEn), ip, userAgent],
    );
  } else {
    sesiones.set(token, { usuario: adminUsuario, expiraEn });
  }
  return { token, usuario: adminUsuario, expiraEn };
}

// Hashea el token de cookie antes de persistirlo como sesión.
function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

// Lee la sesión del encabezado Cookie y descarta sesiones expiradas.
export async function obtenerSesionAdmin(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;

  if (usaPostgres()) {
    const { rows } = await query(
      `SELECT usuario, expira_en FROM sesiones_admin
       WHERE token_hash = $1 AND expira_en > NOW()`,
      [hashToken(token)],
    );
    if (!rows.length) return null;
    return {
      usuario: rows[0].usuario,
      expiraEn: new Date(rows[0].expira_en).getTime(),
      token,
    };
  }

  const sesion = sesiones.get(token);
  if (!sesion || sesion.expiraEn <= Date.now()) {
    sesiones.delete(token);
    return null;
  }
  return { ...sesion, token };
}

// Revoca la sesión del token de administrador actual.
export async function cerrarSesionAdmin(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return;
  if (usaPostgres()) {
    await query("DELETE FROM sesiones_admin WHERE token_hash = $1", [hashToken(token)]);
  } else {
    sesiones.delete(token);
  }
}

// Construye una cookie HttpOnly con expiración y protección SameSite.
export function cookieAdmin(token, maxAgeSeconds) {
  const partes = [
    `${COOKIE_NAME}=${token}`,
    "Path=/api",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true") {
    partes.push("Secure");
  }
  return partes.join("; ");
}

// Devuelve la cookie de administrador vacía para cerrar sesión en el navegador.
export function cookieAdminExpirada() {
  return cookieAdmin("", 0);
}
