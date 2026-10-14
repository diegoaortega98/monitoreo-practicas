import "../config/loadEnv.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cerrarPool, getClient } from "../services/db.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = path.resolve(currentDirectory, "../../data/practicantes.json");

try {
  const contents = await fs.readFile(jsonPath, "utf8");
  const practitioners = JSON.parse(contents);
  if (!Array.isArray(practitioners)) {
    throw new TypeError("El archivo de importación debe contener un arreglo JSON.");
  }

  const client = await getClient();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const { rows } = await client.query("SELECT documento FROM practicantes;");
    const existingDocuments = new Set(rows.map(({ documento }) => documento));
    let agregados = 0;
    let omitidos = 0;

    for (const person of practitioners) {
      if (existingDocuments.has(person.documento)) {
        omitidos++;
        continue;
      }

      await client.query(
        `INSERT INTO practicantes (
          id, nombre_completo, documento, carrera, semestres_cursados,
          contacto_emergencia, telefono, meta_horas, horas_acumuladas,
          estado, aprobado_en, aprobado_por, email, creado_en, actualizado_en
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        );`,
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
          person.creadoEn,
          person.actualizadoEn,
        ],
      );

      for (const attendance of person.registrosAsistencia ?? []) {
        await client.query(
          `INSERT INTO asistencias (
            id, practicante_id, hora_entrada, hora_salida, horas, descripcion,
            tipo, ajustado_por, creado_en, actualizado_en
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
          [
            attendance.id,
            person.id,
            attendance.horaEntrada,
            attendance.horaSalida ?? null,
            attendance.horas ?? 0,
            attendance.descripcion ?? "",
            attendance.tipo ?? "normal",
            attendance.ajustadoPor ?? null,
            attendance.creadoEn,
            attendance.actualizadoEn,
          ],
        );
      }

      for (const hours of person.registrosHoras ?? []) {
        await client.query(
          `INSERT INTO registros_horas (
            id, practicante_id, fecha, horas, descripcion
          ) VALUES ($1, $2, $3, $4, $5);`,
          [
            hours.id ?? randomUUID(),
            person.id,
            hours.fecha,
            hours.horas,
            hours.descripcion ?? "",
          ],
        );
      }

      existingDocuments.add(person.documento);
      agregados++;
    }

    await client.query("COMMIT");
    transactionStarted = false;
    console.log(`Agregados: ${agregados}, Omitidos: ${omitidos}`);
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    if (error.code === "23505") {
      throw new Error("Conflicto de identificador en la migración");
    }
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error("No se pudo migrar practicantes.json:", error.message);
  process.exitCode = 1;
} finally {
  await cerrarPool();
}
