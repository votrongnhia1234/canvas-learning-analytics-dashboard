import pkg from "pg";

const { Pool } = pkg;

// Prefer DATABASE_URL; if absent, choose sensible default depending on runtime
const inContainer =
  process.env.DOCKER_CONTAINER === "true" ||
  !!process.env.AIRFLOW_HOME ||
  (() => {
    try {
      return require("fs").existsSync("/.dockerenv");
    } catch (_) {
      return false;
    }
  })();

const defaultHost = inContainer ? "postgres" : "localhost";
const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://postgres:sekret@${defaultHost}:5432/canvas_dwh`;

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  max: 10
});

pool.on("error", (err) => {
  console.error("[db] Unexpected error on idle client", err);
});

export const query = async (text, params = []) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== "production") {
      console.log("[db] query", { text, duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    // If table is missing (e.g., ETL/ML not run yet), avoid crashing API
    if (error && error.code === "42P01") {
      console.warn("[db] missing table, returning empty result", {
        text,
        code: error.code,
      });
      return { rows: [], rowCount: 0 };
    }
    console.error("[db] query error", { text, params, error });
    throw error;
  }
};

export const getClient = async () => {
  const client = await pool.connect();
  const release = client.release.bind(client);
  const timeout = setTimeout(() => {
    console.warn(
      "[db] A client has been checked out for more than 5 seconds!"
    );
  }, 5_000);

  client.release = () => {
    clearTimeout(timeout);
    release();
  };

  return client;
};
