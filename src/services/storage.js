import { randomUUID } from "node:crypto";
import { getClient, query } from "./db.js";

export function crearError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function leerPracticantesCon(ejecutarQuery) {
  const [practicantesResult, horasResult, asistenciasResult] = await Promise.all([
    ejecutarQuery(
      `SELECT id, nombre_completo, documento, carrera, semestres_cursados,
              contacto_emergencia, telefono, email, meta_horas, horas_acumuladas,
              estado, aprobado_en, aprobado_por, creado_en, actualizado_en
       FROM practicantes
       ORDER BY creado_en ASC;`,
    ),
    ejecutarQuery(
      `SELECT id, practicante_id, fecha, horas, descripcion
       FROM registros_horas
       ORDER BY fecha ASC;`,
    ),
    ejecutarQuery(
      `SELECT id, practicante_id, hora_entrada, hora_salida, horas, descripcion,
              tipo, ajustado_por
       FROM asistencias
       ORDER BY hora_entrada ASC;`,
    ),
  ]);

  const horasPorPracticante = new Map();
  for (const row of horasResult.rows) {
    const registros = horasPorPracticante.get(row.practicante_id) || [];
    registros.push({
      id: row.id,
      fecha: row.fecha,
      horas: Number(row.horas),
      descripcion: row.descripcion,
    });
    horasPorPracticante.set(row.practicante_id, registros);
  }

  const asistenciasPorPracticante = new Map();
  for (const row of asistenciasResult.rows) {
    const registros = asistenciasPorPracticante.get(row.practicante_id) || [];
    registros.push({
      id: row.id,
      horaEntrada: row.hora_entrada,
      horaSalida: row.hora_salida,
      horas: Number(row.horas),
      descripcion: row.descripcion,
      tipo: row.tipo,
      ajustadoPor: row.ajustado_por,
    });
    asistenciasPorPracticante.set(row.practicante_id, registros);
  }

  return practicantesResult.rows.map((row) => ({
    id: row.id,
    nombreCompleto: row.nombre_completo,
    documento: row.documento,
    carrera: row.carrera,
    semestresCursados: row.semestres_cursados,
    contactoEmergencia: row.contacto_emergencia,
    telefono: row.telefono,
    email: row.email,
    metaHoras: row.meta_horas === null ? null : Number(row.meta_horas),
    horasAcumuladas: Number(row.horas_acumuladas),
    estado: row.estado,
    aprobadoEn: row.aprobado_en,
    aprobadoPor: row.aprobado_por,
    creadoEn: row.creado_en,
    actualizadoEn: row.actualizado_en,
    registrosHoras: horasPorPracticante.get(row.id) || [],
    registrosAsistencia: asistenciasPorPracticante.get(row.id) || [],
  }));
}

export async function leerPracticantes() {
  return leerPracticantesCon(query);
}

async function guardarPracticante(client, person) {
  await client.query(
    `INSERT INTO practicantes (
       id, nombre_completo, documento, carrera, semestres_cursados,
       contacto_emergencia, telefono, meta_horas, horas_acumuladas, estado,
       aprobado_en, aprobado_por, email, creado_en, actualizado_en
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
       COALESCE($14::timestamptz, NOW()), COALESCE($15::timestamptz, NOW())
     )
     ON CONFLICT (id) DO UPDATE SET
       nombre_completo = EXCLUDED.nombre_completo,
       documento = EXCLUDED.documento,
       carrera = EXCLUDED.carrera,
       semestres_cursados = EXCLUDED.semestres_cursados,
       contacto_emergencia = EXCLUDED.contacto_emergencia,
       telefono = EXCLUDED.telefono,
       meta_horas = EXCLUDED.meta_horas,
       horas_acumuladas = EXCLUDED.horas_acumuladas,
       estado = EXCLUDED.estado,
       aprobado_en = EXCLUDED.aprobado_en,
       aprobado_por = EXCLUDED.aprobado_por,
       email = EXCLUDED.email,
       actualizado_en = EXCLUDED.actualizado_en;`,
    [
      person.id,
      person.nombreCompleto,
      person.documento,
      person.carrera,
      person.semestresCursados,
      person.contactoEmergencia ?? null,
      person.telefono ?? null,
      person.metaHoras ?? null,
      person.horasAcumuladas ?? 0,
      person.estado ?? "activo",
      person.aprobadoEn ?? null,
      person.aprobadoPor ?? null,
      person.email ?? null,
      person.creadoEn ?? null,
      person.actualizadoEn ?? null,
    ],
  );

  const horas = person.registrosHoras || [];
  for (const registro of horas) {
    registro.id ||= randomUUID();
    await client.query(
      `INSERT INTO registros_horas (id, practicante_id, fecha, horas, descripcion)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         practicante_id = EXCLUDED.practicante_id,
         fecha = EXCLUDED.fecha,
         horas = EXCLUDED.horas,
         descripcion = EXCLUDED.descripcion;`,
      [registro.id, person.id, registro.fecha, registro.horas, registro.descripcion ?? ""],
    );
  }
  await client.query(
    `DELETE FROM registros_horas
     WHERE practicante_id = $1 AND NOT (id = ANY($2::uuid[]));`,
    [person.id, horas.map(({ id }) => id)],
  );

  const asistencias = person.registrosAsistencia || [];
  for (const registro of asistencias) {
    const ahora = new Date().toISOString();
    await client.query(
      `INSERT INTO asistencias (
         id, practicante_id, hora_entrada, hora_salida, horas, descripcion,
         tipo, ajustado_por, creado_en, actualizado_en
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         COALESCE($9::timestamptz, NOW()), COALESCE($10::timestamptz, NOW())
       )
       ON CONFLICT (id) DO UPDATE SET
         practicante_id = EXCLUDED.practicante_id,
         hora_entrada = EXCLUDED.hora_entrada,
         hora_salida = EXCLUDED.hora_salida,
         horas = EXCLUDED.horas,
         descripcion = EXCLUDED.descripcion,
         tipo = EXCLUDED.tipo,
         ajustado_por = EXCLUDED.ajustado_por,
         actualizado_en = EXCLUDED.actualizado_en;`,
      [
        registro.id,
        person.id,
        registro.horaEntrada,
        registro.horaSalida ?? null,
        registro.horas ?? 0,
        registro.descripcion ?? "",
        registro.tipo ?? "normal",
        registro.ajustadoPor ?? null,
        registro.creadoEn ?? ahora,
        registro.actualizadoEn ?? ahora,
      ],
    );
  }
  await client.query(
    `DELETE FROM asistencias
     WHERE practicante_id = $1 AND NOT (id = ANY($2::uuid[]));`,
    [person.id, asistencias.map(({ id }) => id)],
  );
}

async function enTransaccion(operation) {
  const client = await getClient();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    const result = await operation(client);
    await client.query("COMMIT");
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("No se pudo revertir la transacción PostgreSQL:", rollbackError.message);
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function modificarPracticantes(modifyFn) {
  try {
    return await enTransaccion(async (client) => {
      const practitioners = await leerPracticantesCon((text, params) =>
        client.query(text, params));
      const result = modifyFn(practitioners);
      if (result && typeof result.then === "function") {
        throw new TypeError("La modificación de practicantes debe ser síncrona.");
      }

      const documentos = new Set();
      for (const person of practitioners) {
        if (documentos.has(person.documento)) {
          throw crearError(409, "Ya existe un practicante con ese documento.");
        }
        documentos.add(person.documento);
        await guardarPracticante(client, person);
      }
      return result;
    });
  } catch (error) {
    if (error.code === "23505" && error.constraint === "practicantes_documento_key") {
      throw crearError(409, "Ya existe un practicante con ese documento.");
    }
    throw error;
  }
}

export async function eliminarPracticantePorId(id) {
  const result = await query("DELETE FROM practicantes WHERE id = $1;", [id]);
  if (result.rowCount === 0) {
    throw crearError(404, "No se encontró el practicante.");
  }
}

export async function inicializarAlmacenamiento() {
  await query("SELECT 1;");
}

export async function importarDesdeJson(jsonPractitioners) {
  if (!Array.isArray(jsonPractitioners)) {
    throw new TypeError("El archivo de importación debe contener un arreglo JSON.");
  }

  let importados = 0;
  let omitidos = 0;
  try {
    await enTransaccion(async (client) => {
      const { rows } = await client.query("SELECT id, documento FROM practicantes;");
      const existingById = new Map(rows.map(({ id, documento }) => [id, documento]));
      const existingDocuments = new Set(rows.map(({ documento }) => documento));

      for (const person of jsonPractitioners) {
        if (existingDocuments.has(person.documento)) {
          omitidos++;
          continue;
        }
        if (existingById.has(person.id) &&
            existingById.get(person.id) !== person.documento) {
          throw new Error("La importación se canceló por una colisión de identificador.");
        }

        await guardarPracticante(client, person);
        existingById.set(person.id, person.documento);
        existingDocuments.add(person.documento);
        importados++;
      }
    });
    return { importados, omitidos };
  } catch (error) {
    if (error.code === "23505" &&
        (error.constraint === "practicantes_pkey" ||
         error.constraint === "practicantes_documento_key")) {
      throw new Error("La importación se canceló por una colisión de identificador.");
    }
    throw error;
  }
}
