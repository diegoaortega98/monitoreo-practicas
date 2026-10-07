import { v4 as uuidv4 } from "uuid";
import { leerPracticantes, modificarPracticantes } from "../services/storage.js";
import {
  normalizarDocumento,
  validarDatosPracticante,
  validarRegistroPublico,
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
  const horasFaltantes = metaHoras == null
    ? null
    : Math.max(0, metaHoras - horasAcumuladas);
  const porcentaje = metaHoras > 0
    ? Math.min(
      100,
      Math.max(0, Math.round((horasAcumuladas / metaHoras) * 10000) / 100),
    )
    : 0;

  return {
    id: practicante.id,
    nombreCompleto: practicante.nombreCompleto,
    metaHoras,
    horasAcumuladas,
    horasFaltantes,
    porcentaje,
    completado: metaHoras > 0 && horasFaltantes === 0,
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
      estado: "activo",
      aprobadoEn: null,
      aprobadoPor: null,
      email: null,
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

// Recibe solicitudes públicas y reabre solicitudes previamente rechazadas.
export async function registrarPracticantePublico(req, res) {
  const errorValidacion = validarRegistroPublico(req.body);
  if (errorValidacion) throw crearError(400, errorValidacion);

  const datos = {
    nombreCompleto: req.body.nombreCompleto.trim(),
    documento: normalizarDocumento(req.body.documento),
    carrera: req.body.carrera.trim(),
    semestresCursados: req.body.semestresCursados,
    contactoEmergencia: req.body.contactoEmergencia.trim(),
    telefono: req.body.telefono.trim(),
    email: req.body.email?.trim() || null,
  };
  const resultado = await modificarPracticantes((practicantes) => {
    const existente = practicantes.find(
      (item) => normalizarDocumento(item.documento) === datos.documento,
    );
    if (existente) {
      const estado = existente.estado || "activo";
      if (estado === "activo") {
        throw crearError(409, "Ya existe un practicante registrado con ese documento.");
      }
      if (estado === "pendiente") {
        throw crearError(409, "Ya hay una solicitud pendiente con ese documento. Espera la aprobación.");
      }
      if (estado !== "rechazado") {
        throw crearError(409, "No se puede registrar una solicitud con ese documento.");
      }
      Object.assign(existente, datos, {
        estado: "pendiente",
        metaHoras: null,
        aprobadoEn: null,
        aprobadoPor: null,
        actualizadoEn: new Date().toISOString(),
      });
      return existente;
    }

    const ahora = new Date().toISOString();
    const nuevoPracticante = {
      id: uuidv4(),
      ...datos,
      estado: "pendiente",
      metaHoras: null,
      aprobadoEn: null,
      aprobadoPor: null,
      horasAcumuladas: 0,
      registrosHoras: [],
      registrosAsistencia: [],
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    practicantes.push(nuevoPracticante);
    return nuevoPracticante;
  });

  res.status(201).json({
    mensaje: "Registro enviado. Espera la aprobación del administrador.",
    practicante: {
      id: resultado.id,
      nombreCompleto: resultado.nombreCompleto,
    },
  });
}

// Devuelve todos los practicantes guardados.
export async function listarPracticantes(_req, res) {
  const practicantes = await leerPracticantes();
  res.json(practicantes.map((practicante) => ({
    ...practicante,
    estado: practicante.estado || "activo",
    aprobadoEn: practicante.aprobadoEn || null,
  })));
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
