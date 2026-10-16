import {
  actualizarActividad,
  agregarEvidencia,
  crearActividad,
  finalizarJornada,
  firmarCarga,
  listarActividades,
  obtenerJornada,
  revisarActividad,
  verificarCargaCloudinary,
} from "../services/activities.js";
import { normalizarDocumento } from "../utils/validators.js";

function crearError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validarDocumento(body) {
  const documento = normalizarDocumento(body?.documento);
  if (!documento) throw crearError(400, "Ingresa el número de documento.");
  return documento;
}

function validarDescripcion(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw crearError(400, "Describe la actividad realizada.");
  }
  if (value.trim().length > 2000) {
    throw crearError(400, "La descripción no puede superar los 2000 caracteres.");
  }
  return value.trim();
}

export async function obtenerJornadaPractica(req, res) {
  const documento = validarDocumento(req.query);
  res.json(await obtenerJornada(documento));
}

export async function crearActividadPractica(req, res) {
  const documento = validarDocumento(req.body);
  const actividad = await crearActividad(documento, validarDescripcion(req.body?.descripcion));
  res.status(201).json(actividad);
}

export async function editarActividadPractica(req, res) {
  const documento = validarDocumento(req.body);
  res.json(await actualizarActividad(
    documento,
    req.params.id,
    validarDescripcion(req.body?.descripcion),
  ));
}

export async function firmarEvidenciaPractica(req, res) {
  const documento = validarDocumento(req.body);
  const { resourceType } = req.body || {};
  if (!["image", "video"].includes(resourceType)) {
    throw crearError(400, "El tipo de evidencia debe ser imagen o video.");
  }
  res.json(await firmarCarga(documento, req.params.id, resourceType));
}

export async function guardarEvidenciaPractica(req, res) {
  const documento = validarDocumento(req.body);
  const { publicId, resourceType, nombre } = req.body || {};
  if (!["image", "video"].includes(resourceType) ||
      typeof nombre !== "string" || !nombre.trim() || nombre.length > 255 ||
      typeof publicId !== "string") {
    throw crearError(400, "Los datos de la evidencia no son válidos.");
  }
  const evidence = await verificarCargaCloudinary(
    documento,
    req.params.id,
    publicId,
    resourceType,
  );
  evidence.nombre = nombre.trim();
  res.status(201).json(await agregarEvidencia(documento, req.params.id, evidence));
}

export async function enviarJornada(req, res) {
  const documento = validarDocumento(req.body);
  res.json(await finalizarJornada(documento));
}

export async function listarActividadesAdmin(_req, res) {
  res.json(await listarActividades());
}

export async function revisarActividadAdmin(req, res) {
  const { estado, comentario } = req.body || {};
  if (!["aprobada", "observada"].includes(estado)) {
    throw crearError(400, "El estado de revisión debe ser aprobada u observada.");
  }
  if (typeof comentario !== "string" || comentario.trim().length > 1000 ||
      (estado === "observada" && !comentario.trim())) {
    throw crearError(400, "Incluye un comentario de hasta 1000 caracteres para observar la actividad.");
  }
  res.json(await revisarActividad(
    req.params.id,
    estado,
    comentario.trim(),
    req.admin.usuario,
  ));
}
