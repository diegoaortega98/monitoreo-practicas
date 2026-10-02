import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cerrarPool, query } from "../services/db.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(currentDirectory, "../db/schema.sql");

// Aplica de forma idempotente el esquema PostgreSQL del proyecto.
try {
  const schema = await fs.readFile(schemaPath, "utf8");
  await query(schema);
  console.log("Esquema PostgreSQL inicializado correctamente.");
} catch (error) {
  console.error("No se pudo inicializar PostgreSQL:", error.message);
  process.exitCode = 1;
} finally {
  await cerrarPool();
}
