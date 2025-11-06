import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import router from "./routes.js";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",")
      : true,
    credentials: false
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
