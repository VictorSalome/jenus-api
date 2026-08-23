// Handlers de erro global para evitar crash em erros não tratados
process.on("unhandledRejection", (reason, _promise) => {
  console.error("[Unhandled Rejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Uncaught Exception]", err);
});

import express from "express";
import cors from "cors";
import { config } from "./core/config.js";
import { initDb } from "./core/database.js";
import * as logger from "./core/logger.js";

import authApp from "./apps/auth/index.js";
import promoApp from "./apps/promo-monitor/index.js";
// @ts-ignore - curriculos server é JavaScript
import curriculosApp from "./apps/curriculo-monitor/index.js";
import { requireAuth } from "./promo/auth/auth.middleware.js";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Apps ──
app.use("/api/auth", authApp);
app.use("/api", promoApp);
app.use("/api/curriculo", requireAuth, curriculosApp);

// ── Health check com validação de banco e tabelas ──
app.get("/api/health", async (_req, res) => {
  try {
    const db = await initDb();
    // Checa conexão e tabelas essenciais
    await db.get("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1");
    res.json({
      status: "ok",
      database: "connected",
      tables: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      database: "disconnected",
      error: error?.message || "Database check failed",
      timestamp: new Date().toISOString(),
    });
  }
});

// ── 404 ──
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: "Rota não encontrada",
      status: 404,
    },
    timestamp: new Date().toISOString(),
  });
});

const startServer = async (): Promise<void> => {
  try {
    await initDb();

    app.listen(config.PORT, () => {
      logger.info(`🚀 Jenus API rodando na porta ${config.PORT}`, "Server");
      logger.info(`📊 Ambiente: ${config.NODE_ENV}`, "Server");
      logger.info(`💾 Banco: ${config.DATABASE_PATH}`, "Server");
      logger.info(`👤 Admin: ${config.ADMIN_USERNAME}`, "Server");
    });
  } catch (err) {
    logger.error(`Falha ao iniciar servidor: ${err}`, "Server");
    process.exit(1);
  }
};

startServer();
