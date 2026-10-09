const API_BASE = "/api";

// Centraliza fetch, credenciales same-origin y lectura de errores JSON.
export async function request(path, options = {}) {
  const config = {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json", ...options.headers },
    signal: options.signal,
  };

  if (options.body !== undefined) {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE}${path}`, config);
  if (response.status === 204) return null;

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("El servidor devolvió una respuesta que no es JSON.");
  }

  if (!response.ok) {
    const error = new Error(payload.error || `Error de solicitud (${response.status}).`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export const api = {
  login: (body) => request("/admin/login", { method: "POST", body }),
  logout: () => request("/admin/logout", { method: "POST" }),
  me: () => request("/admin/me"),
  health: () => request("/health"),
  practitioners: () => request("/admin/practicantes"),
  practitioner: (id) => request(`/admin/practicantes/${encodeURIComponent(id)}`),
  createPractitioner: (body) => request("/admin/practicantes", { method: "POST", body }),
  updatePractitioner: (id, body) => request(`/admin/practicantes/${encodeURIComponent(id)}`, { method: "PUT", body }),
  deletePractitioner: (id) => request(`/admin/practicantes/${encodeURIComponent(id)}`, { method: "DELETE" }),
  registerHours: (id, body) => request(`/practicantes/${encodeURIComponent(id)}/horas`, { method: "POST", body }),
  attendances: () => request("/admin/asistencias"),
  registrarPracticante: (payload) => request("/v1/practicantes/registro", { method: "POST", body: payload }),
  aprobarPracticante: (id, metaHoras) => request(`/v1/admin/practicantes/${encodeURIComponent(id)}/aprobar`, { method: "PATCH", body: { metaHoras } }),
  rechazarPracticante: (id) => request(`/v1/admin/practicantes/${encodeURIComponent(id)}/rechazar`, { method: "PATCH" }),
  attendanceIn: (documento) => request("/asistencia/entrada", { method: "POST", body: { documento } }),
  attendanceOut: (documento, descripcion) => request("/asistencia/salida", { method: "POST", body: { documento, descripcion } }),
  createManualAttendance: (id, body) => request(`/admin/practicantes/${encodeURIComponent(id)}/asistencias`, { method: "POST", body }),
  updateAttendance: (practitionerId, attendanceId, body) => request(`/admin/asistencias/${encodeURIComponent(practitionerId)}/${encodeURIComponent(attendanceId)}`, { method: "PATCH", body }),
  deleteAttendance: (practitionerId, attendanceId) => request(`/admin/asistencias/${encodeURIComponent(practitionerId)}/${encodeURIComponent(attendanceId)}`, { method: "DELETE" }),
};
