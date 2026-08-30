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
import promoModule from "./apps/promo/index.js";
import curriculosModule from "./apps/curriculos/index.js";
import gmailModule from "./apps/gmail/index.js";
import { registerApp } from "./shared/http/app-registry.js";
import { defaultLimiter, authLimiter } from "./shared/rate-limit/presets.js";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(defaultLimiter);

// ── Apps ──
app.use("/api/auth", authLimiter, authApp);
registerApp(app, promoModule);
registerApp(app, curriculosModule);
registerApp(app, gmailModule);

app.get("/api/health", async (_req, res) => {
  try {
    const db = await initDb();
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

// ── Health check UI (Visual) ──
app.get("/health", async (_req, res) => {
  let status = "ok";
  let dbStatus = "connected";
  let errorMsg = "";

  try {
    const db = await initDb();
    await db.get("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1");
  } catch (error: any) {
    status = "error";
    dbStatus = "disconnected";
    errorMsg = error?.message || "Database check failed";
  }

  res.set("Content-Type", "text/html");
  res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jenus API - Health Check</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: rgba(30, 41, 59, 0.9);
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 40px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .status {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
    }
    .dot {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    .dot.ok { background: #22c55e; box-shadow: 0 0 20px #22c55e; }
    .dot.error { background: #ef4444; box-shadow: 0 0 20px #ef4444; animation: none; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    h1 { color: #f8fafc; font-size: 24px; font-weight: 600; }
    .details {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 20px;
      margin-top: 20px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #334155;
    }
    .detail-row:last-child { border-bottom: none; }
    .label { color: #94a3b8; font-size: 14px; }
    .value { color: #e2e8f0; font-family: monospace; font-size: 13px; }
    .value.ok { color: #22c55e; }
    .value.error { color: #ef4444; }
    .footer {
      margin-top: 24px;
      text-align: center;
      color: #64748b;
      font-size: 12px;
    }
    .api-link { color: #38bdf8; text-decoration: none; }
    .api-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="status">
      <div class="dot ${status}"></div>
      <h1>Jenus API ${status === "ok" ? "🟢 Saudável" : "🔴 Com Problemas"}</h1>
    </div>
    <div class="details">
      <div class="detail-row">
        <span class="label">Status</span>
        <span class="value ${status}">${status.toUpperCase()}</span>
      </div>
      <div class="detail-row">
        <span class="label">Banco de Dados</span>
        <span class="value ${dbStatus === "connected" ? "ok" : "error"}">${dbStatus}</span>
      </div>
      <div class="detail-row">
        <span class="label">Timestamp</span>
        <span class="value">${new Date().toISOString()}</span>
      </div>
      ${errorMsg ? `<div class="detail-row"><span class="label">Erro</span><span class="value error">${errorMsg}</span></div>` : ""}
    </div>
    <div class="footer">
      API JSON: <a href="/api/health" class="api-link">/api/health</a>
    </div>
  </div>
</body>
</html>
  `);
});

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

    // Auto-resume do monitor de promoções se estava ativo antes do restart.
    const { loadMonitorState } = await import("./apps/promo/monitor/monitor.state.js");
    await loadMonitorState();
    const { getMonitorStatus } = await import("./apps/promo/monitor/monitor.state.js");
    if (getMonitorStatus().running) {
      const { startMonitor } = await import("./apps/promo/monitor/monitor.service.js");
      logger.info("Auto-resumindo monitor de promoções...", "Monitor");
      startMonitor().catch((err) =>
        logger.error(`Falha no auto-resume do monitor: ${err}`, "Monitor"),
      );
    }

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
