import express, { Application } from "express";
import { config } from "dotenv";
import cors from "cors";
import path from "path";
import { engine } from "express-handlebars";

import generalResponse from "./helpers/generalResponse";
import { pool } from "./db";
import { setupWorkers } from "./utils/bullmqConfig";

declare module "express" {
  interface Request {
    // user: RequestUserType | any | undefined;
    files: Array<Express.Multer.File>;
  }
}
config();
const app: Application = express();
const port = process.env.PORT || 8000;

// Middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS, PATCH",
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Api-Key, X-Amz-Date, X-Amz-Security-Token, X-Amz-User-Agent, X-Amzn-Trace-Id, access-control-allow-origin",
  );
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

app.use(cors({ origin: "*" }));

app.use(express.static(path.join(__dirname, "./../public")));
app.use(express.json({limit: "50mb"}))
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// 404 handler
app.use((_, res) => {
  return generalResponse(res, null, "Not found", "error", 404);
});

const http = require("http").Server(app);

async function connectDB() {
  const client = await pool.connect()
  client.release();
}

async function closeConnectionDB() {
  await pool.end()
}

async function startServer() {
  try {
    await connectDB();
    console.log(" Database connected successfully");
    setupWorkers();
  } catch (error: any) {
    console.warn(
      "Database connection failed, starting server without DB:",
      error.message,
    );
  }

  http.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`📚 Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

if (require.main === module) {
  startServer();
}

process.on("SIGINT", async () => {
  console.log("Received SIGINT. Shutting down gracefully...");
  await closeConnectionDB();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM. Shutting down gracefully...");
  await closeConnectionDB();
  process.exit(0);
});

export default app;
