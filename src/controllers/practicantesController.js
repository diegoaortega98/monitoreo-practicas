import { v4 as uuidv4 } from "uuid";
import { leerPracticantes, modificarPracticantes } from "../services/storage.js";
import {
  normalizarDocumento,
  validarDatosPracticante,
  validarRegistroHoras,
} from "../utils/validators.js";

// Crea un error HTTP que el middleware central convierte en una respuesta JSON.
function crearError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Busca un practicante por UUID o informa que no existe.
function buscarPorId(practicantes, id) {
  const practicante = practicantes.find((item) => item.id === id);
  if (!practicante) {
    throw crearError(404, "No se encontró el practicante.");
  }
  return practicante;
}

// Calcula las horas faltantes y limita el porcentaje visible entre 0 y 100.
function calcularProgreso(practicante) {
  const metaHoras = practicante.metaHoras;
  const horasAcumuladas = practicante.horasAcumuladas;
  const horasFaltantes = Math.max(0, metaHoras - horasAcumuladas);
  const porcentaje = Math.min(
    100,
    Math.max(0, Math.round((horasAcumuladas / metaHoras) * 10000) / 100),
  );

  return {
    id: practicante.id,
    nombreCompleto: practicante.nombreCompleto,
    metaHoras,
    horasAcumuladas,
    horasFaltantes,
    porcentaje,
    completado: horasFaltantes === 0,
  };
}

// Normaliza los campos de texto para guardar valores sin espacios externos.
function normalizarDatos(datos) {
  return {
    nombreCompleto: datos.nombreCompleto.trim(),
    documento: normalizarDocumento(datos.documento),
    carrera: datos.carrera.trim(),
    semestresCursados: datos.semestresCursados,
    contactoEmergencia: datos.contactoEmergencia?.trim() || "",
    telefono: datos.telefono.trim(),
    metaHoras: datos.metaHoras,
  };
}

// Crea un practicante nuevo y evita documentos duplicados.
export async function crearPracticante(req, res) {
  const errorValidacion = validarDatosPracticante(req.body);
  if (errorValidacion) {
    throw crearError(400, errorValidacion);
  }

  const datos = normalizarDatos(req.body);
  const practicante = await modificarPracticantes((practicantes) => {
    const documentoNormalizado = normalizarDocumento(datos.documento);
    if (practicantes.some((item) => normalizarDocumento(item.documento) === documentoNormalizado)) {
      throw crearError(409, "Ya existe un practicante con ese documento.");
    }

    const ahora = new Date().toISOString();
    const nuevoPracticante = {
      id: uuidv4(),
      ...datos,
      horasAcumuladas: 0,
      registrosHoras: [],
      registrosAsistencia: [],
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    practicantes.push(nuevoPracticante);
    return nuevoPracticante;
  });

  res.status(201).json(practicante);
}

// Devuelve todos los practicantes guardados.
export async function listarPracticantes(_req, res) {
  res.json(await leerPracticantes());
}

// Devuelve un practicante identificado por su UUID.
export async function obtenerPracticante(req, res) {
  const practicantes = await leerPracticantes();
  res.json(buscarPorId(practicantes, req.params.id));
}

// Actualiza los datos personales y la meta sin modificar horas ni historial.
export async function actualizarPracticante(req, res) {
  const errorValidacion = validarDatosPracticante(req.body);
  if (errorValidacion) {
    throw crearError(400, errorValidacion);
  }

  const datos = normalizarDatos(req.body);
  const actualizado = await modificarPracticantes((practicantes) => {
    const practicante = buscarPorId(practicantes, req.params.id);
    const documentoNormalizado = normalizarDocumento(datos.documento);
    if (practicantes.some(
      (item) => item.id !== req.params.id && normalizarDocumento(item.documento) === documentoNormalizado,
    )) {
      throw crearError(409, "Ya existe otro practicante con ese documento.");
    }

    Object.assign(practicante, datos, { actualizadoEn: new Date().toISOString() });
    if (req.body.horasAcumuladas !== undefined) {
      practicante.horasAcumuladas =
        Math.round((req.body.horasAcumuladas + Number.EPSILON) * 100) / 100;
    }
    return practicante;
  });

  res.json(actualizado);
}

// Elimina un practicante y sus registros de horas junto con él.
export async function eliminarPracticante(req, res) {
  await modificarPracticantes((practicantes) => {
    const indice = practicantes.findIndex((item) => item.id === req.params.id);
    if (indice === -1) {
      throw crearError(404, "No se encontró el practicante.");
    }
    practicantes.splice(indice, 1);
  });

  res.status(204).end();
}

// Registra horas trabajadas y actualiza el acumulado de forma atómica.
export async function registrarHoras(req, res) {
  const errorValidacion = validarRegistroHoras(req.body);
  if (errorValidacion) {
    throw crearError(400, errorValidacion);
  }

  const practicante = await modificarPracticantes((practicantes) => {
    const encontrado = buscarPorId(practicantes, req.params.id);
    const registro = {
      fecha: req.body.fecha ? new Date(req.body.fecha).toISOString() : new Date().toISOString(),
      horas: req.body.horas,
      descripcion: req.body.descripcion?.trim() || "",
    };

    encontrado.registrosHoras.push(registro);
    encontrado.horasAcumuladas =
      Math.round((encontrado.horasAcumuladas + registro.horas) * 100) / 100;
    encontrado.actualizadoEn = new Date().toISOString();
    return encontrado;
  });

  res.status(201).json(practicante);
}

// Devuelve únicamente el resumen de progreso del practicante.
export async function obtenerProgreso(req, res) {
  const practicantes = await leerPracticantes();
  res.json(calcularProgreso(buscarPorId(practicantes, req.params.id)));
}
