const STORAGE_KEY = "control-practicas-preferencias";

function leerPreferencias() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

const preferences = leerPreferencias();

export const state = {
  user: null,
  expiresAt: null,
  practitioners: [],
  attendances: [],
  tab: ["practicantes", "asistencias", "agregar", "ajustes"].includes(location.hash.slice(2))
    ? location.hash.slice(2)
    : "practicantes",
  search: preferences.search || "",
  career: preferences.career || "",
  attendanceRange: preferences.attendanceRange || "month",
  attendancePractitioner: preferences.attendancePractitioner || "",
  attendanceFrom: preferences.attendanceFrom || "",
  attendanceTo: preferences.attendanceTo || "",
  theme: preferences.theme || "system",
  recentActivity: [],
};

// Guarda únicamente preferencias de interfaz, nunca credenciales ni sesiones.
export function savePreferences() {
  const { search, career, attendanceRange, attendancePractitioner, attendanceFrom, attendanceTo, theme } = state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      search, career, attendanceRange, attendancePractitioner, attendanceFrom, attendanceTo, theme,
    }));
  } catch {
    // La interfaz sigue funcionando aunque el navegador bloquee localStorage.
  }
}
