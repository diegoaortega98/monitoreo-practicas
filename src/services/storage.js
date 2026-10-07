import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { getClient, query, usaPostgres } from "./db.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.resolve(currentDirectory, "../../data/practicantes.json");
let writeQueue = Promise.resolve();

// Convierte columnas PostgreSQL al modelo camelCase usado por los controladores.
function mapPractitioner(row, attendances, hourRecords) {
  return {
    id: row.id,
    nombreCompleto: row.nombre_completo,
    documento: row.documento,
    carrera: row.carrera,
    semestresCursados: row.semestres_cursados,
    contactoEmergencia: row.contacto_emergencia || "",
    telefono: row.telefono || "",
    email: row.email || null,
    metaHoras: row.meta_horas === null ? null : Number(row.meta_horas),
    horasAcumuladas: Number(row.horas_acumuladas),
    estado: row.estado || "activo",
    aprobadoEn: row.aprobado_en ? new Date(row.aprobado_en).toISOString() : null,
    aprobadoPor: row.aprobado_por || null,
    registrosHoras: hourRecords.get(row.id) || [],
    registrosAsistencia: attendances.get(row.id) || [],
    creadoEn: new Date(row.creado_en).toISOString(),
    actualizadoEn: new Date(row.actualizado_en).toISOString(),
  };
}

// Lee tablas principales y relaciones en un número fijo de consultas.
async function readPostgresPractitioners(client = null) {
  const run = (sql, params = []) => client ? client.query(sql, params) : query(sql, params);
  const [practitionersResult, attendanceResult, hoursResult] = await Promise.all([
    run("SELECT * FROM practicantes ORDER BY creado_en, id"),
    run("SELECT * FROM asistencias ORDER BY hora_entrada, id"),
    run("SELECT * FROM registros_horas ORDER BY fecha, id"),
  ]);

  const attendances = new Map();
  attendanceResult.rows.forEach((row) => {
    const list = attendances.get(row.practicante_id) || [];
    list.push({
      id: row.id,
      horaEntrada: new Date(row.hora_entrada).toISOString(),
      horaSalida: row.hora_salida ? new Date(row.hora_salida).toISOString() : null,
      horas: Number(row.horas),
      descripcion: row.descripcion || "",
      tipo: row.tipo || "normal",
      ajustadoPor: row.ajustado_por || null,
      creadoEn: new Date(row.creado_en).toISOString(),
      actualizadoEn: new Date(row.actualizado_en).toISOString(),
    });
    attendances.set(row.practicante_id, list);
  });

  const hourRecords = new Map();
  hoursResult.rows.forEach((row) => {
    const list = hourRecords.get(row.practicante_id) || [];
    list.push({
      fecha: new Date(row.fecha).toISOString(),
      horas: Number(row.horas),
      descripcion: row.descripcion || "",
    });
    hourRecords.set(row.practicante_id, list);
  });

  return practitionersResult.rows.map((row) => mapPractitioner(row, attendances, hourRecords));
}

// Lee practicantes desde Neon o conserva el modo JSON para desarrollo local.
export async function leerPracticantes() {
  if (usaPostgres()) return readPostgresPractitioners();
  await writeQueue;
  const contents = await fs.readFile(dataFile, "utf8");
  const practitioners = JSON.parse(contents);
  if (!Array.isArray(practitioners)) {
    throw new Error("data/practicantes.json debe contener un arreglo JSON.");
  }
  return practitioners;
}

// Sincroniza la lista modificada dentro de una transacción serializada en PostgreSQL.
async function modifyPostgresPractitioners(modify) {
  const client = await getClient();
  let lockAdquirido = false;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [721946103]);
    lockAdquirido = true;
    const practitioners = await readPostgresPractitioners(client);
    const result = modify(practitioners);
    const ids = practitioners.map((person) => person.id);

    await client.query("BEGIN");
    try {
      if (ids.length) {
        await client.query("DELETE FROM practicantes WHERE NOT (id = ANY($1::uuid[]))", [ids]);
      } else {
        await client.query("DELETE FROM practicantes");
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }

    await client.query("BEGIN");
    for (const person of practitioners) {
      await client.query(
        `INSERT INTO practicantes (
          id, nombre_completo, documento, carrera, semestres_cursados,
          contacto_emergencia, telefono, email, meta_horas, horas_acumuladas,
          estado, aprobado_en, aprobado_por, creado_en, actualizado_en
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          nombre_completo = EXCLUDED.nombre_completo,
          documento = EXCLUDED.documento,
          carrera = EXCLUDED.carrera,
          semestres_cursados = EXCLUDED.semestres_cursados,
          contacto_emergencia = EXCLUDED.contacto_emergencia,
          telefono = EXCLUDED.telefono,
          email = EXCLUDED.email,
          meta_horas = EXCLUDED.meta_horas,
          horas_acumuladas = EXCLUDED.horas_acumuladas,
          estado = EXCLUDED.estado,
          aprobado_en = EXCLUDED.aprobado_en,
          aprobado_por = EXCLUDED.aprobado_por,
          actualizado_en = EXCLUDED.actualizado_en`,
        [
          person.id,
          person.nombreCompleto,
          person.documento,
          person.carrera,
          person.semestresCursados,
          person.contactoEmergencia || null,
          person.telefono || null,
          person.email || null,
          person.metaHoras,
          person.horasAcumuladas || 0,
          person.estado || "activo",
          person.aprobadoEn || null,
          person.aprobadoPor || null,
          person.creadoEn || new Date(),
          person.actualizadoEn || new Date(),
        ],
      );
    }

    if (ids.length) {
      await client.query("DELETE FROM asistencias WHERE practicante_id = ANY($1::uuid[])", [ids]);
      await client.query("DELETE FROM registros_horas WHERE practicante_id = ANY($1::uuid[])", [ids]);
    }
    for (const person of practitioners) {
      for (const record of person.registrosAsistencia || []) {
        await client.query(
          `INSERT INTO asistencias (
            id, practicante_id, hora_entrada, hora_salida, horas, descripcion,
            tipo, ajustado_por, creado_en, actualizado_en
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            record.id || randomUUID(),
            person.id,
            record.horaEntrada,
            record.horaSalida || null,
            record.horas || 0,
            record.descripcion || "",
            record.tipo || "normal",
            record.ajustadoPor || null,
            record.creadoEn || new Date(),
            record.actualizadoEn || new Date(),
          ],
        );
      }
      for (const record of person.registrosHoras || []) {
        await client.query(
          `INSERT INTO registros_horas (id, practicante_id, fecha, horas, descripcion)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            record.id || randomUUID(),
            person.id,
            record.fecha,
            record.horas,
            record.descripcion || "",
          ],
        );
      }
    }

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "42703") {
      const migrationError = new Error(
        "La base de datos no está migrada. Ejecuta 'npm run init-db' para actualizar el esquema.",
      );
      migrationError.status = 503;
      migrationError.exposeMessage = true;
      throw migrationError;
    }
    if (error.code === "23505") {
      error.status = 409;
      error.message = "Ya existe un practicante con ese documento.";
    }
    throw error;
  } finally {
    if (lockAdquirido) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [721946103]);
      } catch (error) {
        client.release(error);
        throw error;
      }
    }
    client.release();
  }
}

// Ejecuta una modificación atómica sin cambiar la interfaz usada por controladores.
export function modificarPracticantes(modify) {
  if (usaPostgres()) return modifyPostgresPractitioners(modify);

  const operation = writeQueue.then(async () => {
    const contents = await fs.readFile(dataFile, "utf8");
    const practitioners = JSON.parse(contents);
    if (!Array.isArray(practitioners)) {
      throw new Error("data/practicantes.json debe contener un arreglo JSON.");
    }
    const result = modify(practitioners);
    const temporaryFile = `${dataFile}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporaryFile, `${JSON.stringify(practitioners, null, 2)}\n`, "utf8");
    await fs.rename(temporaryFile, dataFile);
    return result;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

// Prepara el almacenamiento local JSON o verifica la conectividad con PostgreSQL.
export async function inicializarAlmacenamiento() {
  if (usaPostgres()) {
    await query("SELECT 1");
    return;
  }

  const dataDirectory = path.dirname(dataFile);
  await fs.mkdir(dataDirectory, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.writeFile(dataFile, "[]\n", { encoding: "utf8", flag: "wx" });
  }
}

// Inserta una copia JSON únicamente cuando PostgreSQL todavía está vacío.
export async function importarDesdeJson(jsonPractitioners) {
  if (!usaPostgres()) {
    const error = new Error("Configura DATABASE_URL para importar datos a PostgreSQL.");
    error.status = 503;
    throw error;
  }
  if (!Array.isArray(jsonPractitioners)) {
    throw new TypeError("El archivo de importación debe contener un arreglo JSON.");
  }

  const client = await getClient();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [721946103]);
    const { rows } = await client.query("SELECT COUNT(*)::integer AS total FROM practicantes");
    if (rows[0].total > 0) {
      throw new Error("La importación se canceló: PostgreSQL ya contiene practicantes.");
    }
    for (const person of jsonPractitioners) {
      if (!person.id || !person.nombreCompleto || !person.documento || !person.carrera ||
        !Number.isInteger(person.semestresCursados) ||
        ((person.estado || "activo") === "activo" && !(Number(person.metaHoras) > 0))) {
        throw new Error(`El practicante con documento ${person.documento || "(sin documento)"} no tiene datos válidos.`);
      }
      await client.query(
        `INSERT INTO practicantes (
          id, nombre_completo, documento, carrera, semestres_cursados,
          contacto_emergencia, telefono, email, meta_horas, horas_acumuladas,
          estado, aprobado_en, aprobado_por, creado_en, actualizado_en
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          person.id,
          person.nombreCompleto,
          person.documento,
          person.carrera,
          person.semestresCursados,
          person.contactoEmergencia || null,
          person.telefono || null,
          person.email || null,
          person.metaHoras,
          person.horasAcumuladas || 0,
          person.estado || "activo",
          person.aprobadoEn || null,
          person.aprobadoPor || null,
          person.creadoEn || new Date(),
          person.actualizadoEn || new Date(),
        ],
      );
      for (const record of person.registrosAsistencia || []) {
        await client.query(
          `INSERT INTO asistencias (
            id, practicante_id, hora_entrada, hora_salida, horas, descripcion,
            tipo, ajustado_por, creado_en, actualizado_en
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            record.id || randomUUID(),
            person.id,
            record.horaEntrada,
            record.horaSalida || null,
            record.horas || 0,
            record.descripcion || "",
            record.tipo || "normal",
            record.ajustadoPor || null,
            record.creadoEn || new Date(),
            record.actualizadoEn || new Date(),
          ],
        );
      }
      for (const record of person.registrosHoras || []) {
        const id = record.id || randomUUID();
        await client.query(
          "INSERT INTO registros_horas (id, practicante_id, fecha, horas, descripcion) VALUES ($1,$2,$3,$4,$5)",
          [id, person.id, record.fecha, record.horas, record.descripcion || ""],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
