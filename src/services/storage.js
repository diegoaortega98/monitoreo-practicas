import mongoose from "mongoose";
import { conectarMongo } from "../config/db.js";
import { Practicante } from "../models/Practicante.js";
import { AdminSession } from "../models/AdminSession.js";
import { query } from "./db.js";

function crearError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizarPracticante(practicante) {
  const { _id, __v, ...data } = practicante;
  return {
    ...data,
    contactoEmergencia: data.contactoEmergencia || "",
    telefono: data.telefono || "",
    email: data.email || null,
    metaHoras: data.metaHoras ?? null,
    horasAcumuladas: Number(data.horasAcumuladas || 0),
    estado: data.estado || "activo",
    aprobadoEn: data.aprobadoEn || null,
    aprobadoPor: data.aprobadoPor || null,
    registrosHoras: data.registrosHoras || [],
    registrosAsistencia: data.registrosAsistencia || [],
  };
}

// Conserva el mismo modelo camelCase que consumen los controladores.
export async function leerPracticantes() {
  await conectarMongo();
  const practitioners = await Practicante.find({})
    .sort({ creadoEn: 1, id: 1 })
    .lean();
  return practitioners.map(normalizarPracticante);
}

// Mantiene el contrato basado en una lista mutable con escrituras transaccionales.
export async function modificarPracticantes(modify) {
  await conectarMongo();
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const practitioners = (await Practicante.find({}).session(session).lean())
        .map(normalizarPracticante);
      result = modify(practitioners);
      if (result && typeof result.then === "function") {
        throw new TypeError("La modificación de practicantes debe ser síncrona.");
      }

      await Practicante.deleteMany({}, { session });
      if (practitioners.length) {
        await Practicante.insertMany(practitioners, { session, ordered: true });
      }
    });
    return result;
  } catch (error) {
    if (error.code === 11000) {
      error.status = 409;
      error.message = "Ya existe un practicante con ese documento.";
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

// Elimina un practicante directamente cuando un controlador usa esta operación.
export async function eliminarPracticantePorId(id) {
  await conectarMongo();
  const result = await Practicante.deleteOne({ id });
  if (result.deletedCount === 0) {
    throw crearError(404, "No se encontró el practicante.");
  }
}

// Verifica la conexión PostgreSQL antes de atender solicitudes.
export async function inicializarAlmacenamiento() {
  await query("SELECT 1;");
}

// Importa practicantes que no existan y conserva los documentos ya guardados.
export async function importarDesdeJson(jsonPractitioners) {
  if (!Array.isArray(jsonPractitioners)) {
    throw new TypeError("El archivo de importación debe contener un arreglo JSON.");
  }
  await inicializarAlmacenamiento();

  const session = await mongoose.startSession();
  let importados = 0;
  let omitidos = 0;
  try {
    await session.withTransaction(async () => {
      importados = 0;
      omitidos = 0;
      for (const person of jsonPractitioners) {
        if (!person.id || !person.nombreCompleto || !person.documento || !person.carrera ||
          !Number.isInteger(person.semestresCursados) ||
          ((person.estado || "activo") === "activo" && !(Number(person.metaHoras) > 0))) {
          throw new Error(
            `El practicante con documento ${person.documento || "(sin documento)"} no tiene datos válidos.`,
          );
        }

        const existingById = await Practicante.findOne({ id: person.id })
          .session(session)
          .lean();
        if (existingById && existingById.documento !== person.documento) {
          throw new Error("La importación se canceló por una colisión de identificador.");
        }
        const existingByDocument = await Practicante.findOne({ documento: person.documento })
          .session(session)
          .lean();
        if (existingByDocument) {
          omitidos++;
          continue;
        }
        await Practicante.create([person], { session });
        importados++;
      }
    });
    return { importados, omitidos };
  } finally {
    await session.endSession();
  }
}
