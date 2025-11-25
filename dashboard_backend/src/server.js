import "dotenv/config";
import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import router from "./routes.js";

// Load .env.local if present (docker compose often mounts this)
const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  // Use dotenv/config already loaded for .env; this merges .env.local overrides
  const dotenv = await import("dotenv");
  dotenv.config({ path: envLocalPath, override: true });
}

const app = express();

const parseOrigins = (raw) =>
  raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

const allowedOrigins = process.env.CORS_ORIGIN ? parseOrigins(process.env.CORS_ORIGIN) : [];

app.use(
  cors({
    origin: (origin, callback) => {
      // Same-origin or non-browser (no origin) → allow
      if (!origin) return callback(null, true);
      // No whitelist configured → allow all (dev convenience)
      if (!allowedOrigins.length) return callback(null, true);
      // Strict match against whitelist
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Allow localhost variants if base hostname matches (dev ergonomics)
      const originHost = (() => {
        try {
          return new URL(origin).hostname;
        } catch (_) {
          return null;
        }
      })();
      if (originHost && allowedOrigins.some((o) => o.includes(originHost))) {
        return callback(null, true);
      }
      return callback(new Error("CORS not allowed"), false);
    },
    credentials: false,
    allowedHeaders: ["Content-Type", "X-API-Key"],
    optionsSuccessStatus: 204
  })
);
app.use(express.json());
app.use(morgan("dev"));

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    message: "Learning Analytics Dashboard Service",
    version: "0.1.0"
  });
});

app.use("/api", router);

app.use((err, _req, res, _next) => {
  console.error("[server] error", err);
  res.status(500).json({ error: "Internal Server Error" });
});

const port = Number(process.env.PORT || 4000);

app.listen(port, () => {
  console.log(`Learning Analytics service listening on port ${port}`);
});
