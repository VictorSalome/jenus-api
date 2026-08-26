import { Router } from "express";
import { buscarVagasBrasil, buscarVagasPorTecnologia, buscarVagasRemotas } from "../buscas/scraperBR.service.js";
import { calcularCompatibilidade } from "../buscas/match.service.js";
import { logInfo, logError } from "../utils/logger.js";
import { apiKeyAuth, optionalApiKeyAuth } from "../middleware/apiKeyAuth.js";

const router = Router();

/**
 * GET /scraper/vagas
 * Busca vagas gerais
 * Query params: ?query=react&tags=javascript,typescript&limit=10
 * Autenticação: Opcional em dev, obrigatória em produção
 */
router.get("/vagas", optionalApiKeyAuth, async (req: any, res: any) => {
  const startTime = Date.now();
  const { query = "", tags = "", limit = "10" } = req.query;

  try {
    const tagsArray = tags ? tags.split(",") : [];
    const vagas = await buscarVagasBrasil(query, tagsArray, parseInt(limit));

    const ranqueadas = (await Promise.all(vagas.map(async vaga => ({
      ...vaga,
      match: await calcularCompatibilidade(vaga)
    })))).sort((a, b) => b.match.score - a.match.score);

    res.json({
      success: true,
      query,
      tags: tagsArray,
      total: ranqueadas.length,
      vagas: ranqueadas.slice(0, parseInt(limit)),
      tempo: Date.now() - startTime,
      autenticado: req.apiClient?.key !== "anonymous"
    });
  } catch (err: any) {
    logError("Erro na busca de vagas", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /scraper/tecnologia/:tech
 * Busca vagas por tecnologia específica
 * Ex: /scraper/tecnologia/react
 * Autenticação: Opcional em dev, obrigatória em produção
 */
router.get("/tecnologia/:tech", optionalApiKeyAuth, async (req: any, res: any) => {
  const startTime = Date.now();
  const { tech } = req.params;
  const { nivel = "", limit = "5" } = req.query;

  try {
    const vagas = await buscarVagasPorTecnologia(tech, parseInt(limit));

    const ranqueadas = (await Promise.all(vagas
      .map(async vaga => ({ ...vaga, match: await calcularCompatibilidade(vaga) }))))
      .sort((a, b) => b.match.score - a.match.score);

    res.json({
      success: true,
      tecnologia: tech,
      nivel,
      total: ranqueadas.length,
      vagas: ranqueadas,
      tempo: Date.now() - startTime,
      autenticado: req.apiClient?.key !== "anonymous"
    });
  } catch (err: any) {
    logError(`Erro na busca por tecnologia ${tech}`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /scraper/remoto
 * Busca vagas remotas
 * Autenticação: Opcional em dev, obrigatória em produção
 */
router.get("/remoto", optionalApiKeyAuth, async (req: any, res: any) => {
  const startTime = Date.now();
  const { tecnologia = "", nivel = "pleno", limit = "10" } = req.query;

  try {
    const vagas = await buscarVagasRemotas(tecnologia, nivel);

    const ranqueadas = (await Promise.all(vagas
      .map(async vaga => ({ ...vaga, match: await calcularCompatibilidade(vaga) }))))
      .sort((a, b) => b.match.score - a.match.score);

    res.json({
      success: true,
      tecnologia,
      nivel,
      remoto: true,
      total: ranqueadas.length,
      vagas: ranqueadas,
      tempo: Date.now() - startTime,
      autenticado: req.apiClient?.key !== "anonymous"
    });
  } catch (err: any) {
    logError("Erro na busca de vagas remotas", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /scraper/batch
 * Busca múltiplas tecnologias de uma vez
 * Body: { tecnologias: ["react", "nodejs"], limit: 10 }
 * Autenticação: Obrigatória
 */
router.post("/batch", apiKeyAuth, async (req: any, res: any) => {
  const { tecnologias = [], limit = 10 } = req.body;
  const startTime = Date.now();

  try {
    const todosResultados: any[] = [];

    for (const tech of tecnologias) {
      const vagas = await buscarVagasPorTecnologia(
        tech,
        Math.floor(limit / tecnologias.length)
      );
      todosResultados.push(...vagas);
    }

    const ranqueadas = (await Promise.all(todosResultados
      .map(async vaga => ({ ...vaga, match: await calcularCompatibilidade(vaga) }))))
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, limit);

    res.json({
      success: true,
      tecnologias,
      total: ranqueadas.length,
      vagas: ranqueadas,
      tempo: Date.now() - startTime
    });
  } catch (err: any) {
    logError("Erro na busca em lote", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /scraper/status
 * Status do serviço de scraping
 * Autenticação: Opcional
 */
router.get("/status", optionalApiKeyAuth, (req: any, res: any) => {
  res.json({
    success: true,
    status: "online",
    version: "1.0",
    fontes: {
      "Jobicy Remote Jobs": "✅ Online",
      "Remotive": "✅ Online",
      "Arbeitnow": "✅ Online"
    },
    limites: {
      timeout: 15000,
      rateLimit: 200
    },
    autenticado: req.apiClient?.key !== "anonymous"
  });
});

export default router;