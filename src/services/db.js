import pg from "pg";

const { Pool } = pg;
let pool;

// Crea el pool de Neon solo cuando se configura DATABASE_URL.
function getPool() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    const error = new Error("DATABASE_URL no está configurada.");
    error.status = 503;
    throw error;
  }
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: true },
      max: Number(process.env.PG_POOL_MAX) || 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      allowExitOnIdle: process.env.NODE_ENV !== "production",
    });
    pool.on("error", (error) => {
      console.error("Error inesperado del pool PostgreSQL:", error);
    });
  }
  return pool;
}

// Ejecuta una consulta parametrizada y propaga errores con contexto seguro.
export async function query(sql, params = []) {
  try {
    return await getPool().query(sql, params);
  } catch (error) {
    console.error("Error al consultar PostgreSQL:", {
      code: error.code,
      message: error.message,
    });
    throw error;
  }
}

// Obtiene una conexión exclusiva para ejecutar transacciones.
export async function getClient() {
  try {
    return await getPool().connect();
  } catch (error) {
    console.error("No se pudo obtener una conexión PostgreSQL:", {
      code: error.code,
      message: error.message,
    });
    throw error;
  }
}

export const usaPostgres = () => Boolean(process.env.DATABASE_URL);

export async function cerrarPool() {
  if (pool) {
    const currentPool = pool;
    pool = undefined;
    await currentPool.end();
  }
}
