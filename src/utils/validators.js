const camposTexto = [
  ["nombreCompleto", "El nombre completo"],
  ["documento", "El documento"],
  ["carrera", "La carrera o estudio"],
  ["telefono", "El teléfono"],
];

export function normalizarDocumento(documento) {
  if (typeof documento !== "string") return "";
  return documento.trim().replace(/[\s.-]+/g, "").toUpperCase();
}

// Comprueba que el cuerpo sea un objeto JSON y no una lista o un valor nulo.
function esObjeto(datos) {
  return datos !== null && typeof datos === "object" && !Array.isArray(datos);
}

// Valida los campos obligatorios del alta y actualización de practicante.
export function validarDatosPracticante(datos) {
  if (!esObjeto(datos)) {
    return "El cuerpo de la solicitud debe ser un objeto JSON.";
  }

  for (const [campo, etiqueta] of camposTexto) {
    if (typeof datos[campo] !== "string" || normalizarDocumento(datos[campo]) === "") {
      return `${etiqueta} es obligatorio y debe ser texto no vacío.`;
    }
  }

  if (!Number.isInteger(datos.semestresCursados) || datos.semestresCursados < 0) {
    return "semestresCursados debe ser un entero igual o mayor que cero.";
  }

  if (datos.contactoEmergencia !== undefined &&
      typeof datos.contactoEmergencia !== "string") {
    return "contactoEmergencia debe ser texto.";
  }

  if (typeof datos.metaHoras !== "number" ||
      !Number.isFinite(datos.metaHoras) ||
      datos.metaHoras <= 0) {
    return "metaHoras debe ser un número mayor que cero.";
  }

  return null;
}

// Valida un registro de horas y sus campos opcionales.
export function validarRegistroHoras(datos) {
  if (!esObjeto(datos)) {
    return "El cuerpo de la solicitud debe ser un objeto JSON.";
  }

  if (typeof datos.horas !== "number" || !Number.isFinite(datos.horas) || datos.horas <= 0) {
    return "horas debe ser un número mayor que cero.";
  }

  if (datos.fecha !== undefined &&
      (typeof datos.fecha !== "string" || Number.isNaN(Date.parse(datos.fecha)))) {
    return "fecha debe ser una fecha válida.";
  }

  if (datos.descripcion !== undefined && typeof datos.descripcion !== "string") {
    return "descripcion debe ser texto.";
  }

  return null;
}
