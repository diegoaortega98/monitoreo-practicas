import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, usaPostgres } from "./src/services/db.js";
import practicantesRouter from "./src/routes/practicantes.js";
import adminRouter from "./src/routes/admin.js";
import asistenciaRouter from "./src/routes/asistencia.js";
import { inicializarAlmacenamiento } from "./src/services/storage.js";

const app = express();
const puerto = Number(process.env.PORT) || 3000;
const archivoActual = fileURLToPath(import.meta.url);
const directorioPublico = path.join(path.dirname(archivoActual), "public");
const rutasDisponibles = [
  "GET /api/health (público)",
  "POST /api/admin/login (público)",
  "GET /api/admin/me (requiere administrador)",
  "POST /api/admin/logout (requiere administrador)",
  "GET /api/admin/practicantes (requiere administrador)",
  "POST /api/admin/practicantes (requiere administrador)",
  "GET /api/admin/practicantes/:id (requiere administrador)",
  "PUT /api/admin/practicantes/:id (requiere administrador)",
  "DELETE /api/admin/practicantes/:id (requiere administrador)",
  "PATCH /api/admin/practicantes/:id/aprobar (requiere administrador)",
  "PATCH /api/admin/practicantes/:id/rechazar (requiere administrador)",
  "GET /api/admin/asistencias (requiere administrador)",
  "POST /api/admin/practicantes/:id/asistencias (requiere administrador)",
  "PATCH /api/admin/asistencias/:practicanteId/:asistenciaId (requiere administrador)",
  "DELETE /api/admin/asistencias/:practicanteId/:asistenciaId (requiere administrador)",
  "POST /api/asistencia/entrada (público; requiere documento)",
  "POST /api/asistencia/salida (público; requiere documento)",
  "POST /api/practicantes (requiere administrador)",
  "POST /api/practicantes/registro (público)",
  "GET /api/practicantes (requiere administrador)",
  "GET /api/practicantes/:id (requiere administrador)",
  "PUT /api/practicantes/:id (requiere administrador)",
  "DELETE /api/practicantes/:id (requiere administrador)",
  "POST /api/practicantes/:id/horas (requiere administrador)",
  "GET /api/practicantes/:id/progreso (requiere administrador)",
  "POST /api/v1/practicantes/registro (público)",
  "PATCH /api/v1/admin/practicantes/:id/aprobar (requiere administrador)",
  "PATCH /api/v1/admin/practicantes/:id/rechazar (requiere administrador)",
];
const origenesPermitidos = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origen) => origen.trim())
  .filter(Boolean);

app.use(express.json({ limit: "1mb" }));
app.use(cors({
  credentials: true,
  origin(origen, callback) {
    // Los orígenes no permitidos no reciben encabezados CORS; no se bloquea la solicitud same-origin.
    callback(null, !origen || origenesPermitidos.includes(origen));
  },
}));
app.use(cookieParser());
app.use(express.static(directorioPublico));
app.get("/api/health", (_req, res, next) => {
  if (process.env.VERCEL && !usaPostgres()) {
    res.status(503).json({
      ok: false,
      version: "1.0.0",
      hora: new Date().toISOString(),
      error: "DATABASE_URL debe configurarse para activar el almacenamiento persistente en producción.",
      endpoints: rutasDisponibles,
    });
    return;
  }
  const verificarBase = usaPostgres() ? query("SELECT 1") : Promise.resolve();
  verificarBase.then(() => {
    res.json({
      ok: true,
      version: "1.0.0",
      hora: new Date().toISOString(),
      almacenamiento: usaPostgres() ? "postgresql" : "json-local",
      endpoints: rutasDisponibles,
    });
  }).catch(next);
});
app.use("/api", (req, res, next) => {
  if (process.env.VERCEL && !usaPostgres()) {
    res.status(503).json({
      error: "El almacenamiento persistente no está configurado. Agrega DATABASE_URL en Vercel.",
    });
    return;
  }
  next();
});
app.use("/api/admin", adminRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/asistencia", asistenciaRouter);
app.use("/api/practicantes", practicantesRouter);
app.use("/api/v1/practicantes", practicantesRouter);

// Responde con JSON cuando la ruta solicitada no existe.
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

// Centraliza los errores de rutas, validación y lectura/escritura de archivos.
app.use((error, _req, res, _next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El cuerpo de la solicitud debe ser JSON válido." });
  }

  const status = error.status || 500;
  if (status >= 500) {
    console.error("Error interno de la API:", error);
  }

  res.status(status).json({
    error: status >= 500 ? "Ocurrió un error interno." : error.message,
  });
});

// Prepara el archivo de datos antes de aceptar solicitudes.
export async function iniciarServidor() {
  await inicializarAlmacenamiento();
  app.listen(puerto, () => {
    console.log(`API de control de prácticas disponible en http://localhost:${puerto}`);
  });
}

// Arranca el servidor local solo cuando este archivo es el punto de entrada.
if (process.argv[1] && path.resolve(process.argv[1]) === archivoActual) {
  iniciarServidor().catch((error) => {
    console.error("No se pudo iniciar la API:", error);
    process.exitCode = 1;
  });
}

export default app;
