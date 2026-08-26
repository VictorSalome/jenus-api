import { Router } from "express";
import { getStats } from "../buscas/autoApply.service.js";
import { registrarEnvio, registrarErro } from "../monitor/stats.service.js";
import { buscarVagasBrasil } from "../scraperBR.service.js";
import { executarPipeline } from "../buscas/autoApply.service.js";
import { getEnviosCount } from "../email/email.service.js";
import fs from "fs/promises";
import path from "path";
import config from "../config/index.js";

const router = Router();

/**
 * GET /api/curriculo/monitor
 * Retorna estatísticas de uso e monitoramento
 */
router.get("/monitor", async (req, res) => {
  try {
    // Obter estatísticas do sistema
    const stats = await getStats();

    // Buscar vagas atuais
    const vagas = await buscarVagasBrasil("", [], 5);

    // Carregar histórico de envios
    let history = [];
    const historyPath = path.join(config.paths.data, "send_history.json");
    try {
      const historyData = await fs.readFile(historyPath, "utf-8");
      history = JSON.parse(historyData);
    } catch (e) {
      // Arquivo não existe ainda
    }

    // Total histórico de envios com status SENT (do banco)
    const totalEnviados = await getEnviosCount();

    res.json({
      success: true,
      total: stats.totalVagas || 0,
      enviados: stats.enviados || 0,
      totalEnviados,
      erros: stats.erros || 0,
      tempoMedio: stats.tempoMedio || "0ms",
      ultimoEnvio: stats.ultimoEnvio || null,
      vagas: vagas.slice(0, 3), // Pré-visualização rápida
      // Novos campos para histórico
      history: history,
      historyCount: history.length,
      successCount: stats.successCount || 0,
      errorCount: stats.errorCount || 0,
      todayCount: history.filter(h => {
        const hDate = new Date(h.timestamp);
        const today = new Date();
        return hDate.toDateString() === today.toDateString();
      }).length,
      weekTotal: history.filter(h => {
        const hDate = new Date(h.timestamp);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return hDate >= weekAgo;
      }).length,
    });
  } catch (err) {
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
    const { query = "", tags = [], minScore = 60, limit = 5, autoSend = true } = req.body;

    const resultados = await executarPipeline({
      query,
      tags,
      minScore,
      limit,
      autoSend,
    });

    // Registrar no histórico
    const historyPath = path.join(process.cwd(), "data", "send_history.json");
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

export default router;