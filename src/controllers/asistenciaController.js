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

// Registra la salida abierta y suma su duración a las horas acumuladas.
export async function marcarSalida(req, res) {
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
    practicante.registrosAsistencia ||= [];
    const registro = [...practicante.registrosAsistencia]
      .reverse()
      .find((item) => !item.horaSalida);
    if (!registro) {
      throw crearError(409, "No tienes una entrada pendiente para registrar la salida.");
    }

    const ahora = new Date();
    const horas = Math.round(
      ((ahora.getTime() - new Date(registro.horaEntrada).getTime()) / 3_600_000 +
        Number.EPSILON) * 100,
    ) / 100;
    if (horas <= 0) throw crearError(400, "No se pudo calcular la duración de la asistencia.");
    registro.horaSalida = ahora.toISOString();
    registro.horas = horas;
    registro.actualizadoEn = ahora.toISOString();
    practicante.horasAcumuladas =
      Math.round((practicante.horasAcumuladas + horas + Number.EPSILON) * 100) / 100;
    practicante.actualizadoEn = ahora.toISOString();
    return { nombreCompleto: practicante.nombreCompleto, registro, horasAcumuladas: practicante.horasAcumuladas };
  });

  res.json(resultado);
}
