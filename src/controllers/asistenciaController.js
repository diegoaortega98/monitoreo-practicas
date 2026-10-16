import { randomUUID } from "node:crypto";
import { modificarPracticantes } from "../services/storage.js";
import { normalizarDocumento } from "../utils/validators.js";

// Informa errores con el estado HTTP apropiado al middleware central.
function crearError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Busca al practicante por documento y registra su hora de entrada.
export async function marcarEntrada(req, res) {
  const { documento } = req.body || {};
  const documentoNormalizado = normalizarDocumento(documento);
  if (!documentoNormalizado) {
    throw crearError(400, "Ingresa el número de documento.");
  }

  const resultado = await modificarPracticantes((practicantes) => {
    const practicante = practicantes.find(
      (item) => normalizarDocumento(item.documento) === documentoNormalizado,
    );
    if (!practicante) throw crearError(404, "No se encontró un practicante con ese documento.");
    validarEstadoPracticante(practicante);
    practicante.registrosAsistencia ||= [];
    if (practicante.registrosAsistencia.some((registro) => !registro.horaSalida)) {
      throw crearError(
        409,
        "Tienes una salida pendiente. El administrador debe corregirla antes de marcar otra entrada.",
      );
    }

    const ahora = new Date().toISOString();
    const registro = {
      id: randomUUID(),
      horaEntrada: ahora,
      horaSalida: null,
      horas: 0,
      descripcion: "",
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    practicante.registrosAsistencia.push(registro);
    practicante.actualizadoEn = ahora;
    return { nombreCompleto: practicante.nombreCompleto, registro };
  });

  res.status(201).json(resultado);
}

// Impide marcar asistencia mientras la solicitud no esté aprobada.
function validarEstadoPracticante(practicante) {
  if (practicante.estado === "pendiente") {
    throw crearError(403, "Tu registro está pendiente de aprobación. Contacta al administrador.");
  }
  if (practicante.estado === "rechazado") {
    throw crearError(403, "Tu registro fue rechazado. Contacta al administrador.");
  }
  if (practicante.estado && practicante.estado !== "activo") {
    throw crearError(403, "Tu registro no está habilitado para marcar asistencia. Contacta al administrador.");
  }
}
