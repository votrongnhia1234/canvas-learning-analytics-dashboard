import pkg from "pg";

const { Pool } = pkg;

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:sekret@localhost:5432/canvas_dwh";

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
