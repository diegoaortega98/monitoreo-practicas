import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cerrarPool } from "../services/db.js";
import { importarDesdeJson } from "../services/storage.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = path.resolve(currentDirectory, "../../data/practicantes.json");

// Copia los practicantes y sus historiales sin sobrescribir una base con datos.
try {
  const contents = await fs.readFile(jsonPath, "utf8");
  const practitioners = JSON.parse(contents);
  await importarDesdeJson(practitioners);
  console.log(`Importación terminada: ${practitioners.length} practicante(s).`);
} catch (error) {
  console.error("No se pudo migrar practicantes.json:", error.message);
  process.exitCode = 1;
} finally {
  await cerrarPool();
}
