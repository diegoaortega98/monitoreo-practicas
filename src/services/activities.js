import { createHash, randomUUID } from "node:crypto";
import { getClient, query } from "./db.js";
import { crearError } from "./storage.js";

const MAX_EVIDENCE_PER_ACTIVITY = 10;

function mapActivity(row) {
  return {
    id: row.id,
    asistenciaId: row.asistencia_id,
    practicanteId: row.practicante_id,
    nombreCompleto: row.nombre_completo,
    documento: row.documento,
    horaEntrada: row.hora_entrada,
    horaSalida: row.hora_salida,
    descripcion: row.descripcion,
    evidencias: row.evidencias || [],
    estado: row.estado,
    comentarioRevision: row.comentario_revision,
    revisadoPor: row.revisado_por,
    revisadoEn: row.revisado_en,
    creadoEn: row.creado_en,
    actualizadoEn: row.actualizado_en,
  };
}

async function obtenerJornadaAbierta(client, documento) {
  const { rows } = await client.query(
    `SELECT a.id AS asistencia_id, a.practicante_id, a.hora_entrada
     FROM asistencias a
     JOIN practicantes p ON p.id = a.practicante_id
     WHERE p.documento = $1 AND p.estado = 'activo' AND a.hora_salida IS NULL
     ORDER BY a.hora_entrada DESC
     LIMIT 1
     FOR UPDATE OF a, p;`,
    [documento],
  );
  if (!rows[0]) {
    throw crearError(409, "No tienes una jornada abierta. Marca la entrada antes de reportar actividades.");
  }
  return rows[0];
}

async function obtenerActividadDeJornada(client, id, documento, estado = "borrador") {
  const { rows } = await client.query(
    `SELECT act.id, act.asistencia_id, act.practicante_id, act.descripcion, act.evidencias
     FROM actividades act
     JOIN asistencias a ON a.id = act.asistencia_id
     JOIN practicantes p ON p.id = act.practicante_id
     WHERE act.id = $1 AND p.documento = $2 AND a.hora_salida IS NULL
       AND act.estado = $3
     FOR UPDATE OF act;`,
    [id, documento, estado],
  );
  if (!rows[0]) {
    throw crearError(404, "No se encontró una actividad editable en tu jornada.");
  }
  return rows[0];
}

export async function obtenerJornada(documento) {
  const { rows: attendanceRows } = await query(
    `SELECT id, practicante_id, hora_entrada
     FROM asistencias
     WHERE practicante_id = (SELECT id FROM practicantes WHERE documento = $1 AND estado = 'activo')
       AND hora_salida IS NULL
     ORDER BY hora_entrada DESC
     LIMIT 1;`,
    [documento],
  );
  const attendance = attendanceRows[0];
  if (!attendance) return null;
  const { rows } = await query(
    `SELECT act.id, act.asistencia_id, act.practicante_id, act.descripcion,
            act.evidencias, act.estado, act.comentario_revision,
            act.revisado_por, act.revisado_en, act.creado_en, act.actualizado_en,
            p.nombre_completo, p.documento, a.hora_entrada, a.hora_salida
     FROM actividades act
     JOIN asistencias a ON a.id = act.asistencia_id
     JOIN practicantes p ON p.id = act.practicante_id
     WHERE act.asistencia_id = $1
     ORDER BY act.creado_en ASC;`,
    [attendance.id],
  );
  return {
    registro: {
      id: attendance.id,
      horaEntrada: attendance.hora_entrada,
    },
    actividades: rows.map(mapActivity),
  };
}

export async function crearActividad(documento, descripcion) {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const attendance = await obtenerJornadaAbierta(client, documento);
    const id = randomUUID();
    const { rows } = await client.query(
      `INSERT INTO actividades (id, asistencia_id, practicante_id, descripcion)
       VALUES ($1, $2, $3, $4)
       RETURNING id, asistencia_id, practicante_id, descripcion, evidencias,
                 estado, comentario_revision, revisado_por, revisado_en,
                 creado_en, actualizado_en;`,
      [id, attendance.asistencia_id, attendance.practicante_id, descripcion],
    );
    await client.query("COMMIT");
    return { ...mapActivity(rows[0]), horaEntrada: attendance.hora_entrada };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function actualizarActividad(documento, id, descripcion) {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    await obtenerActividadDeJornada(client, id, documento);
    const { rows } = await client.query(
      `UPDATE actividades SET descripcion = $3, actualizado_en = NOW()
       WHERE id = $1 AND practicante_id = (
         SELECT id FROM practicantes WHERE documento = $2
       )
       RETURNING id, asistencia_id, practicante_id, descripcion, evidencias,
                 estado, comentario_revision, revisado_por, revisado_en,
                 creado_en, actualizado_en;`,
      [id, documento, descripcion],
    );
    await client.query("COMMIT");
    return mapActivity(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function agregarEvidencia(documento, id, evidence) {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const activity = await obtenerActividadDeJornada(client, id, documento);
    if (activity.evidencias.length >= MAX_EVIDENCE_PER_ACTIVITY) {
      throw crearError(409, `Cada actividad admite hasta ${MAX_EVIDENCE_PER_ACTIVITY} evidencias.`);
    }
    if (activity.evidencias.some((item) => item.publicId === evidence.publicId)) {
      throw crearError(409, "Esta evidencia ya está asociada a la actividad.");
    }
    const { rows } = await client.query(
      `UPDATE actividades SET evidencias = evidencias || $2::jsonb, actualizado_en = NOW()
       WHERE id = $1
       RETURNING id, asistencia_id, practicante_id, descripcion, evidencias,
                 estado, comentario_revision, revisado_por, revisado_en,
                 creado_en, actualizado_en;`,
      [id, JSON.stringify([evidence])],
    );
    await client.query("COMMIT");
    return mapActivity(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listarActividades() {
  const { rows } = await query(
    `SELECT act.id, act.asistencia_id, act.practicante_id, act.descripcion,
            act.evidencias, act.estado, act.comentario_revision,
            act.revisado_por, act.revisado_en, act.creado_en, act.actualizado_en,
            p.nombre_completo, p.documento, a.hora_entrada, a.hora_salida
     FROM actividades act
     JOIN asistencias a ON a.id = act.asistencia_id
     JOIN practicantes p ON p.id = act.practicante_id
     WHERE act.estado <> 'borrador'
     ORDER BY CASE act.estado WHEN 'en_revision' THEN 0 ELSE 1 END,
              act.creado_en DESC;`,
  );
  return rows.map(mapActivity);
}

export async function revisarActividad(id, estado, comentario, usuario) {
  const { rows } = await query(
    `UPDATE actividades
     SET estado = $2, comentario_revision = $3, revisado_por = $4,
         revisado_en = NOW(), actualizado_en = NOW()
     WHERE id = $1 AND estado = 'en_revision'
     RETURNING id, asistencia_id, practicante_id, descripcion, evidencias,
               estado, comentario_revision, revisado_por, revisado_en,
               creado_en, actualizado_en;`,
    [id, estado, comentario, usuario],
  );
  if (!rows[0]) throw crearError(409, "La actividad ya fue revisada o no está disponible.");
  return mapActivity(rows[0]);
}

export async function firmarCarga(documento, id, resourceType) {
  const { rows } = await query(
    `SELECT act.id, jsonb_array_length(act.evidencias) AS cantidad_evidencias
     FROM actividades act
     JOIN asistencias a ON a.id = act.asistencia_id
     JOIN practicantes p ON p.id = act.practicante_id
     WHERE act.id = $1 AND p.documento = $2 AND a.hora_salida IS NULL
       AND act.estado = 'borrador';`,
    [id, documento],
  );
  if (!rows[0]) throw crearError(404, "No se encontró una actividad editable en tu jornada.");
  if (Number(rows[0].cantidad_evidencias) >= MAX_EVIDENCE_PER_ACTIVITY) {
    throw crearError(409, `Cada actividad admite hasta ${MAX_EVIDENCE_PER_ACTIVITY} evidencias.`);
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw crearError(503, "Cloudinary no está configurado. Contacta al administrador.");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `control-practicas/${id}`;
  const publicId = randomUUID();
  const params = { folder, public_id: publicId, timestamp };
  const signatureBase = Object.entries(params)
    .sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const signature = createHash("sha1")
    .update(`${signatureBase}${apiSecret}`)
    .digest("hex");
  return {
    cloudName,
    apiKey,
    timestamp,
    folder,
    publicId,
    resourceType,
    signature,
  };
}

export async function verificarCargaCloudinary(documento, id, publicId, resourceType) {
  const expectedFolder = `control-practicas/${id}/`;
  if (typeof publicId !== "string" ||
      !publicId.startsWith(expectedFolder) ||
      !/^[\w-]+$/.test(publicId.slice(expectedFolder.length)) ||
      !["image", "video"].includes(resourceType)) {
    throw crearError(400, "La referencia de Cloudinary no es válida para esta actividad.");
  }

  const { rows: activities } = await query(
    `SELECT act.id, jsonb_array_length(act.evidencias) AS cantidad_evidencias
     FROM actividades act
     JOIN asistencias a ON a.id = act.asistencia_id
     JOIN practicantes p ON p.id = act.practicante_id
     WHERE act.id = $1 AND p.documento = $2 AND a.hora_salida IS NULL
       AND act.estado = 'borrador';`,
    [id, documento],
  );
  if (!activities[0]) throw crearError(404, "No se encontró una actividad editable en tu jornada.");
  if (Number(activities[0].cantidad_evidencias) >= MAX_EVIDENCE_PER_ACTIVITY) {
    throw crearError(409, `Cada actividad admite hasta ${MAX_EVIDENCE_PER_ACTIVITY} evidencias.`);
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw crearError(503, "Cloudinary no está configurado. Contacta al administrador.");
  }

  const encodedPublicId = publicId.split("/").map(encodeURIComponent).join("/");
  let response;
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/${resourceType}/upload/${encodedPublicId}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch (error) {
    console.error("No se pudo conectar con Cloudinary para validar una evidencia:", error.message);
    throw crearError(502, "No se pudo validar la evidencia con Cloudinary. Intenta de nuevo.");
  }
  if (response.status === 404) {
    throw crearError(400, "Cloudinary no encontró el archivo cargado.");
  }
  if (!response.ok) {
    console.error("Cloudinary rechazó la validación de una evidencia:", response.status);
    throw crearError(502, "Cloudinary no pudo validar la evidencia. Intenta de nuevo.");
  }

  let asset;
  try {
    asset = await response.json();
  } catch {
    throw crearError(502, "Cloudinary devolvió datos inválidos al validar la evidencia.");
  }
  const allowedFormat = resourceType === "image"
    ? /^(jpg|jpeg|png|webp|gif)$/i
    : /^(mp4|webm|mov)$/i;
  const maxBytes = resourceType === "video" ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
  let secureUrl;
  try {
    secureUrl = new URL(asset.secure_url);
  } catch {
    throw crearError(502, "Cloudinary devolvió una URL inválida para la evidencia.");
  }
  if (asset.public_id !== publicId ||
      asset.resource_type !== resourceType ||
      !allowedFormat.test(asset.format || "") ||
      !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || asset.bytes > maxBytes ||
      secureUrl.protocol !== "https:" ||
      secureUrl.hostname !== "res.cloudinary.com" ||
      !secureUrl.pathname.startsWith(`/${cloudName}/`) ||
      !secureUrl.pathname.includes(`/${resourceType}/upload/`)) {
    throw crearError(400, "El archivo cargado no cumple el tipo o tamaño permitido.");
  }
  return {
    publicId: asset.public_id,
    secureUrl: asset.secure_url,
    resourceType: asset.resource_type,
    format: asset.format.toLowerCase(),
    bytes: asset.bytes,
  };
}

export async function finalizarJornada(documento) {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const attendance = await obtenerJornadaAbierta(client, documento);
    const { rows: activities } = await client.query(
      `SELECT id FROM actividades
       WHERE asistencia_id = $1 AND estado = 'borrador'
       FOR UPDATE;`,
      [attendance.asistencia_id],
    );
    if (!activities.length) {
      throw crearError(400, "Crea al menos una actividad antes de marcar la salida.");
    }

    const salida = new Date();
    const horas = Math.round(
      ((salida.getTime() - new Date(attendance.hora_entrada).getTime()) / 3_600_000 +
        Number.EPSILON) * 100,
    ) / 100;
    if (horas <= 0) throw crearError(400, "No se pudo calcular la duración de la asistencia.");

    await client.query(
      `UPDATE actividades
       SET estado = 'en_revision', actualizado_en = $2
       WHERE asistencia_id = $1 AND estado = 'borrador';`,
      [attendance.asistencia_id, salida.toISOString()],
    );
    const { rows: attendanceRows } = await client.query(
      `UPDATE asistencias
       SET hora_salida = $2, horas = $3, actualizado_en = $2
       WHERE id = $1 AND hora_salida IS NULL
       RETURNING id, hora_entrada, hora_salida, horas;`,
      [attendance.asistencia_id, salida.toISOString(), horas],
    );
    if (!attendanceRows[0]) {
      throw crearError(409, "La jornada ya fue cerrada.");
    }
    const { rows: practitionerRows } = await client.query(
      `UPDATE practicantes
       SET horas_acumuladas = horas_acumuladas + $2, actualizado_en = $3
       WHERE id = $1
       RETURNING nombre_completo, horas_acumuladas;`,
      [attendance.practicante_id, horas, salida.toISOString()],
    );
    await client.query("COMMIT");
    return {
      nombreCompleto: practitionerRows[0].nombre_completo,
      registro: {
        id: attendanceRows[0].id,
        horaEntrada: attendanceRows[0].hora_entrada,
        horaSalida: attendanceRows[0].hora_salida,
        horas: Number(attendanceRows[0].horas),
      },
      horasAcumuladas: Number(practitionerRows[0].horas_acumuladas),
      actividadesEnviadas: activities.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
