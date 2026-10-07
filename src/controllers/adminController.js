import { v4 as uuidv4 } from "uuid";
import {
  iniciarSesionAdmin,
  cerrarSesionAdmin,
  cookieAdmin,
  cookieAdminExpirada,
} from "../services/adminAuth.js";
import { leerPracticantes, modificarPracticantes } from "../services/storage.js";

// Crea errores HTTP centralizados para las operaciones administrativas.
function crearError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Inicia una sesión de administrador y la guarda en una cookie HttpOnly.
export async function loginAdmin(req, res) {
  const { usuario, password } = req.body || {};
  if (typeof usuario !== "string" || typeof password !== "string" || !usuario || !password) {
    throw crearError(400, "Ingresa el usuario y la contraseña.");
  }

  const sesion = await iniciarSesionAdmin(usuario, password, req.ip, req.get("user-agent") || "");
  res.setHeader("Set-Cookie", cookieAdmin(sesion.token, 12 * 60 * 60));
  res.json({ usuario: sesion.usuario, expiraEn: new Date(sesion.expiraEn).toISOString() });
}

// Devuelve la sesión activa para restaurar el panel tras recargar la página.
export async function meAdmin(req, res) {
  res.json({
    usuario: req.admin.usuario,
    expiraEn: new Date(req.admin.expiraEn).toISOString(),
  });
}

// Revoca la sesión y expira la cookie del navegador.
export async function logoutAdmin(req, res) {
  await cerrarSesionAdmin(req);
  res.setHeader("Set-Cookie", cookieAdminExpirada());
  res.status(204).end();
}

// Aprueba una solicitud y registra quién autorizó la meta de horas.
export async function aprobarPracticante(req, res) {
  const { metaHoras } = req.body || {};
  if (typeof metaHoras !== "number" || !Number.isFinite(metaHoras) ||
      metaHoras <= 0 || Math.round(metaHoras * 100) / 100 <= 0) {
    throw crearError(400, "metaHoras debe ser un número mayor que cero.");
  }

  const practicante = await modificarPracticantes((practicantes) => {
    const encontrado = practicantes.find((item) => item.id === req.params.id);
    if (!encontrado) throw crearError(404, "No se encontró el practicante.");
    Object.assign(encontrado, {
      estado: "activo",
      metaHoras: Math.round((metaHoras + Number.EPSILON) * 100) / 100,
      aprobadoEn: new Date().toISOString(),
      aprobadoPor: req.admin.usuario,
      actualizadoEn: new Date().toISOString(),
    });
    return encontrado;
  });
  res.json(practicante);
}

// Rechaza una solicitud sin eliminar sus datos ni su historial.
export async function rechazarPracticante(req, res) {
  const practicante = await modificarPracticantes((practicantes) => {
    const encontrado = practicantes.find((item) => item.id === req.params.id);
    if (!encontrado) throw crearError(404, "No se encontró el practicante.");
    Object.assign(encontrado, {
      estado: "rechazado",
      metaHoras: null,
      aprobadoEn: null,
      aprobadoPor: null,
      actualizadoEn: new Date().toISOString(),
    });
    return encontrado;
  });
  res.json(practicante);
}

// Lista las asistencias completas y pendientes de todos los practicantes.
export async function listarAsistencias(_req, res) {
  const practicantes = await leerPracticantes();
  const asistencias = practicantes.flatMap((practicante) =>
    (practicante.registrosAsistencia || []).map((registro) => ({
      ...registro,
      practicanteId: practicante.id,
      nombreCompleto: practicante.nombreCompleto,
      documento: practicante.documento,
      estado: registro.horaSalida ? "completa" : "pendiente_salida",
    })),
  );
  asistencias.sort((a, b) => {
    const estado = Number(Boolean(a.horaSalida)) - Number(Boolean(b.horaSalida));
    return estado || new Date(b.horaEntrada) - new Date(a.horaEntrada);
  });
  res.json(asistencias);
}

// Crea una asistencia manual para completar una marcación omitida.
export async function crearAsistenciaManual(req, res) {
  const { horaEntrada, horaSalida, descripcion } = req.body || {};
  const errorValidacion = validarFechasAsistencia(horaEntrada, horaSalida, descripcion);
  if (errorValidacion) throw crearError(400, errorValidacion);

  const asistencia = await modificarPracticantes((practicantes) => {
    const practicante = practicantes.find((item) => item.id === req.params.id);
    if (!practicante) throw crearError(404, "No se encontró el practicante.");
    practicante.registrosAsistencia ||= [];
    const registro = {
      id: uuidv4(),
      horaEntrada: new Date(horaEntrada).toISOString(),
      horaSalida: horaSalida ? new Date(horaSalida).toISOString() : null,
      horas: horaSalida ? calcularHoras(horaEntrada, horaSalida) : 0,
      descripcion: descripcion?.trim() || "Registro manual del administrador",
      creadoEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
    };
    if (horaSalida && registro.horas <= 0) {
      throw crearError(400, "La hora de salida debe ser posterior a la entrada.");
    }
    if (!horaSalida && practicante.registrosAsistencia.some((item) => !item.horaSalida)) {
      throw crearError(409, "El practicante ya tiene una asistencia pendiente de salida.");
    }
    practicante.registrosAsistencia.push(registro);
    practicante.horasAcumuladas = redondear(
      practicante.horasAcumuladas + registro.horas,
    );
    practicante.actualizadoEn = new Date().toISOString();
    return { ...registro, practicanteId: practicante.id, nombreCompleto: practicante.nombreCompleto };
  });
  res.status(201).json(asistencia);
}

// Corrige las horas de entrada o salida y ajusta el acumulado.
export async function actualizarAsistencia(req, res) {
  const { horaEntrada, horaSalida, horas, descripcion } = req.body || {};
  const errorValidacion = validarFechasAsistencia(horaEntrada, horaSalida, descripcion, horas);
  if (errorValidacion) throw crearError(400, errorValidacion);

  const asistencia = await modificarPracticantes((practicantes) => {
    const practicante = practicantes.find((item) => item.id === req.params.practicanteId);
    if (!practicante) throw crearError(404, "No se encontró el practicante.");
    const registro = (practicante.registrosAsistencia || [])
      .find((item) => item.id === req.params.asistenciaId);
    if (!registro) throw crearError(404, "No se encontró la asistencia.");

    const horasAnteriores = registro.horas || 0;
    const entrada = new Date(horaEntrada).toISOString();
    const salida = horaSalida ? new Date(horaSalida).toISOString() : null;
    const horasNuevas = salida
      ? (horas === undefined ? calcularHoras(entrada, salida) : redondear(horas))
      : 0;
    if (salida && horasNuevas <= 0) {
      throw crearError(400, "La hora de salida debe ser posterior a la entrada.");
    }
    registro.horaEntrada = entrada;
    registro.horaSalida = salida;
    registro.horas = horasNuevas;
    registro.descripcion = descripcion?.trim() || "";
    registro.actualizadoEn = new Date().toISOString();
    practicante.horasAcumuladas = redondear(
      Math.max(0, practicante.horasAcumuladas - horasAnteriores) + horasNuevas,
    );
    practicante.actualizadoEn = new Date().toISOString();
    return { ...registro, practicanteId: practicante.id, nombreCompleto: practicante.nombreCompleto };
  });
  res.json(asistencia);
}

// Elimina un registro y descuenta del total las horas que ya contabilizaba.
export async function eliminarAsistencia(req, res) {
  await modificarPracticantes((practicantes) => {
    const practicante = practicantes.find((item) => item.id === req.params.practicanteId);
    if (!practicante) throw crearError(404, "No se encontró el practicante.");
    const indice = (practicante.registrosAsistencia || [])
      .findIndex((item) => item.id === req.params.asistenciaId);
    if (indice === -1) throw crearError(404, "No se encontró la asistencia.");
    const [registro] = practicante.registrosAsistencia.splice(indice, 1);
    practicante.horasAcumuladas = redondear(
      Math.max(0, practicante.horasAcumuladas - (registro.horas || 0)),
    );
    practicante.actualizadoEn = new Date().toISOString();
  });
  res.status(204).end();
}

// Valida y normaliza las fechas requeridas para una asistencia.
function validarFechasAsistencia(horaEntrada, horaSalida, descripcion, horas) {
  if (typeof horaEntrada !== "string" || Number.isNaN(Date.parse(horaEntrada))) {
    return "horaEntrada debe ser una fecha y hora válida.";
  }
  if (horaSalida !== undefined && horaSalida !== null &&
      (typeof horaSalida !== "string" || Number.isNaN(Date.parse(horaSalida)))) {
    return "horaSalida debe ser una fecha y hora válida o null.";
  }
  if (descripcion !== undefined && typeof descripcion !== "string") {
    return "descripcion debe ser texto.";
  }
  if (horas !== undefined && (typeof horas !== "number" || !Number.isFinite(horas) || horas < 0)) {
    return "horas debe ser un número igual o mayor que cero.";
  }
  if (!horaSalida && horas !== undefined && horas !== 0) {
    return "No se pueden registrar horas reconocidas sin una hora de salida.";
  }
  return null;
}

// Calcula la duración de una asistencia en horas con dos decimales.
function calcularHoras(entrada, salida) {
  return redondear((new Date(salida).getTime() - new Date(entrada).getTime()) / 3_600_000);
}

// Redondea cantidades horarias para evitar errores de punto flotante.
function redondear(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
