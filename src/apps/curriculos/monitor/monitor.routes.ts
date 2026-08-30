import { Router } from "express";
import { getStats, executarPipeline } from "../buscas/autoApply.service.js";
import { registrarEnvio, registrarErro } from "../monitor/stats.service.js";
import { getEnviosCount, getEnviosHistory } from "../shared/email/email.service.js";
import { listarPendentes, aprovarEEnviar } from "../buscas/pendingApplications.service.js";
import { requireAuth } from "../../../shared/auth/auth.middleware.js";
import { asyncHandler } from "../shared/middleware/errorHandler.js";
import * as logger from "../../../core/logger.js";
import config from "../config/index.js";
import fs from "fs/promises";
import path from "path";

const router = Router();

/**
 * GET /api/curriculo/monitor
 * Retorna estatísticas de uso e monitoramento
 */
router.get("/monitor", async (req, res) => {
  const startTime = Date.now();
  try {
    const stats = await getStats();
    const totalEnviados = await getEnviosCount();
    const pendentesRevisao = await listarPendentes("pending");

    // Histórico do banco (fonte canônica), fallback para JSON legado
    let history: any[] = [];
    try {
      const dbHistory = await getEnviosHistory(100);
      history = dbHistory.map((e: any) => ({
        timestamp: e.created_at,
        title: e.vaga_titulo || "Vaga",
        company: e.company || "",
        email: e.email_destino || "",
        arquivo: e.filename || "",
        status: e.status === "SENT" ? "enviado" : e.status?.toLowerCase() || "desconhecido",
        score: 0,
        query: "",
      }));
    } catch {
      // Fallback para JSON legado
      const historyPath = path.join(config.paths.data, "send_history.json");
      try {
        const historyData = await fs.readFile(historyPath, "utf-8");
        history = JSON.parse(historyData);
      } catch {}
    }

    // Serviços — verificação real, não hardcoded
    let filesystemStatus = "online";
    try {
      await fs.access(config.paths.temp);
    } catch {
      filesystemStatus = "error";
    }
    const smtpConfigured = !!process.env.SMTP_HOST && !!process.env.SMTP_USER;
    const services: Record<string, string> = {
      vagaExtractor: "online",
      curriculoPersonalizador: "online",
      pdfGenerator: filesystemStatus === "online" ? "online" : "error",
      emailService: smtpConfigured ? "online" : "offline",
    };
    const hasOffline = Object.values(services).some((s) => s !== "online");

    res.json({
      success: true,
      total: stats.totalVagas || 0,
      enviados: stats.enviados || 0,
      totalEnviados,
      pendentesRevisaoCount: pendentesRevisao.length,
      erros: stats.erros || 0,
      tempoMedio: stats.tempoMedio || "0ms",
      ultimoEnvio: stats.ultimoEnvio || null,
      history,
      historyCount: history.length,
      successCount: totalEnviados,
      errorCount: stats.erros || 0,
      todayCount: history.filter((h: any) => {
        const hDate = new Date(h.timestamp);
        const today = new Date();
        return hDate.toDateString() === today.toDateString();
      }).length,
      weekTotal: history.filter((h: any) => {
        const hDate = new Date(h.timestamp);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return hDate >= weekAgo;
      }).length,
      // Campos de status (para compatibilidade com o front)
      status: hasOffline ? "degraded" : "success",
      message: hasOffline
        ? "Sistema funcionando com limitações"
        : "Sistema de Currículo Automatizado funcionando",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      environment: config.server.env,
      uptime: `${Math.floor(process.uptime())}s`,
      responseTime: `${Date.now() - startTime}ms`,
      services,
    });
  } catch (err: any) {
    logger.error(`Erro no monitor de currículo: ${err.message}`, "Curriculo");
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/curriculo/auto-apply
 * Executa pipeline completo de candidatura automática
 */
router.post("/auto-apply", async (req, res) => {
  try {
    const { query = "", tags = [], minScore = 60, limit = 5 } = req.body;

    const resultados = await executarPipeline({
      query,
      tags,
      minScore,
      limit,
    });

    // Registrar no histórico
    const historyPath = path.join(config.paths.data, "send_history.json");
    let history = [];
    try {
      const data = await fs.readFile(historyPath, "utf-8");
      history = JSON.parse(data);
    } catch (e) {}

    // Adicionar novos envios ao histórico
    resultados.applied.forEach(vaga => {
      history.push({
        timestamp: new Date().toISOString(),
        title: vaga.title,
        company: vaga.company,
        email: vaga.email,
        arquivo: vaga.arquivo,
        status: vaga.status,
        score: vaga.score,
        query: query
      });
    });

    await fs.writeFile(historyPath, JSON.stringify(history.slice(-100), null, 2));

    res.json({
      success: true,
      resumo: resultados.resumo,
      vagas: resultados.applied.slice(0, 10),
      history: history.slice(-10),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.post("/approve-all-pending", requireAuth, asyncHandler(async (req, res) => {
  const startTime = Date.now();

  logger.info("Iniciando aprovação e envio de todos os pendentes", "Curriculo");

  try {
    const pendentes = await listarPendentes("pending");
    const resultados: { id: number; status: string; error?: string }[] = [];

    for (const p of pendentes) {
      try {
        await aprovarEEnviar(p.id);
        resultados.push({ id: p.id, status: "sent" });
      } catch (err: any) {
        resultados.push({ id: p.id, status: "error", error: err.message });
      }
    }

    const sent = resultados.filter((r) => r.status === "sent").length;
    const errors = resultados.filter((r) => r.status === "error").length;

    logger.info(`Aprovação concluída: ${sent} enviados, ${errors} erros`, "Curriculo");
    res.json({
      success: true,
      message: `${sent} candidaturas aprovadas e enviadas${errors > 0 ? `, ${errors} falharam` : ""}`,
      resultados,
    });
  } catch (err: any) {
    logger.error(`Erro ao aprovar e enviar todos os pendentes: ${err.message}`, "Curriculo");
    res.status(500).json({ success: false, error: err.message });
  }
}));

export default router;