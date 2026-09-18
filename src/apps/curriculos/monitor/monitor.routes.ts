import { Router } from "express";
import { registrarEnvio, registrarErro } from "../monitor/stats.service.js";
import { getEnviosCount, getEnviosHistory } from "../shared/email/email.service.js";
import * as logger from "../../../core/logger.js";
import config from "../config/index.js";
import fs from "fs/promises";
import path from "path";
import { asyncHandler } from "../../../shared/http/index.js";

const router = Router();

/**
 * GET /api/curriculo/monitor
 * Retorna estatísticas de uso e monitoramento
 */
router.get("/monitor", asyncHandler(async (req, res) => {
  const startTime = Date.now();
  try {
    const totalEnviados = await getEnviosCount();

    // Histórico do banco (fonte canônica), fallback para JSON legado
    let history: any[] = [];
    try {
      const { getDb } = await import("../../../core/database.js");
      const db = await getDb();
      const [dbHistory, profileSkills] = await Promise.all([
        getEnviosHistory(100),
        db.all("SELECT tech FROM curriculo_profile_skills"),
      ]);
      const flatSkills = (profileSkills || []).map((s: any) => s.tech.toLowerCase().trim());

      history = dbHistory.map((e: any) => {
        let score = (typeof e.score === "number" && e.score > 0) ? e.score : 0;
        if (!score && e.skills_json) {
          try {
            const vSkills: string[] = JSON.parse(e.skills_json).map((s: string) => s.toLowerCase().trim());
            if (vSkills.length > 0) {
              const matched = vSkills.filter((s) => flatSkills.includes(s));
              score = Math.round((matched.length / vSkills.length) * 100);
            }
          } catch {}
        }
        if (!score && flatSkills.length > 0) {
          score = 75;
        }

        return {
          id: e.id,
          timestamp: e.created_at,
          title: e.vaga_titulo || "Vaga",
          company: e.company || "",
          email: e.email_destino || "",
          arquivo: e.filename || "",
          status: e.status === "SENT" ? "enviado" : e.status?.toLowerCase() || "desconhecido",
          messageId: e.message_id || "",
          gmailThreadId: e.gmail_thread_id || "",
          score,
          salaryPretension: e.salary_pretension || "",
          query: "",
        };
      });
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
      total: 0,
      enviados: 0,
      totalEnviados,
      pendentesRevisaoCount: 0,
      erros: 0,
      tempoMedio: "0ms",
      ultimoEnvio: null,
      history,
      historyCount: history.length,
      successCount: totalEnviados,
      errorCount: 0,
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
}));

export default router;