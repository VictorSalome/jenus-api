import { buscarVagas, buscarVagaFonte, getFontes } from "./feed.service.js";
import { ranquearVagas } from "./match.service.js";
import { executarPipeline } from "./autoApply.service.js";
import {
  parsearLinkedInHTML,
  normalizarVagasLinkedIn,
} from "./linkedin.service.js";
import {
  iniciarScheduler,
  pararScheduler,
  executarBusca,
  getStatus,
} from "./scheduler.service.js";
import {
  iniciarLinkedinCron,
  pararLinkedinCron,
  executarLinkedinAgora,
  getLinkedinStatus,
} from "./linkedinCron.service.js";
import { logInfo, logError } from "../utils/logger.js";

export interface BuscarVagasParams {
  query?: string;
  tags?: string[];
  limit?: number;
}

export interface Vaga {
  source: string;
  externalId: string;
  title: string;
  company: string;
  description: string;
  url: string;
  location: string;
  salary: string;
  tags: string[];
  postedAt: string;
  type: string;
  match?: any;
  score?: number;
}

/**
 * GET /buscar-vagas
 * Lista fontes disponíveis
 */
export const listarFontesController = (req: any, res: any) => {
  res.json({ ok: true, fontes: getFontes() });
};

/**
 * POST /buscar-vagas
 * Busca vagas em todas as fontes e retorna ranqueadas
 */
export const buscarVagasController = async (req: any, res: any) => {
  try {
    const { query, tags, limit } = req.body || {};

    logInfo(
      `Busca recebida: query="${query || ""}" tags=${(tags || []).join(",")}`,
    );

    const vagas = await buscarVagas({
      query: query || "",
      tags: tags || [],
      limit: Math.min(limit || 10, 20),
    });

    const ranqueadas = ranquearVagas(vagas);

    res.json({
      ok: true,
      total: ranqueadas.length,
      vagas: ranqueadas,
    });
  } catch (err: any) {
    logError(`Erro na busca de vagas: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
};

/**
 * POST /buscar-vagas/fonte
 * Busca vagas de uma fonte específica
 */
export const buscarPorFonteController = async (req: any, res: any) => {
  try {
    const { fonte } = req.params;
    const { query, tags, limit } = req.body || {};

    const vagas = await buscarVagaFonte(fonte, {
      query: query || "",
      tags: tags || [],
      limit: Math.min(limit || 10, 20),
    });

    const ranqueadas = ranquearVagas(vagas);

    res.json({
      ok: true,
      fonte,
      total: ranqueadas.length,
      vagas: ranqueadas,
    });
  } catch (err: any) {
    logError(`Erro na busca por fonte: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
};

/**
 * POST /buscar-vagas/auto-apply
 * Pipeline completo: busca → match → gera currículo → envia
 */
export const autoApplyController = async (req: any, res: any) => {
  try {
    const { query, tags, minScore, limit, autoSend } = req.body || {};

    logInfo(
      `Auto-apply iniciado: minScore=${minScore || 70} autoSend=${autoSend || false}`,
    );

    const resultado = await executarPipeline({
      query: query || "",
      tags: tags || [],
      minScore: minScore || 70,
      limit: Math.min(limit || 10, 20),
      autoSend: autoSend || false,
    });

    res.json({ ok: true, ...resultado });
  } catch (err: any) {
    logError(`Erro no auto-apply: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
};

// ── Scheduler ──

export const schedulerStatusController = (req: any, res: any) => {
  res.json({ ok: true, ...getStatus() });
};

export const schedulerStartController = (req: any, res: any) => {
  const { cron, tags, minScore, autoSend } = req.body || {};
  const resultado = iniciarScheduler({ cron, tags, minScore, autoSend });
  res.json({ ok: true, ...resultado });
};

export const schedulerStopController = (req: any, res: any) => {
  const resultado = pararScheduler();
  res.json({ ok: true, ...resultado });
};

export const schedulerRunNowController = async (req: any, res: any) => {
  try {
    const { tags, minScore, autoSend } = req.body || {};
    const resultado = await executarBusca({ tags, minScore, autoSend });
    res.json({ ok: true, ...resultado });
  } catch (err: any) {
    logError(`Erro na execução manual: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
};

// ── LinkedIn ──

export const linkedinParseController = (req: any, res: any) => {
  try {
    const { html } = req.body || {};
    if (!html)
      return res.status(400).json({ ok: false, error: "HTML obrigatório" });

    const vagas = parsearLinkedInHTML(html);
    const normalizadas = normalizarVagasLinkedIn(vagas);
    const ranqueadas = ranquearVagas(normalizadas);

    res.json({ ok: true, total: ranqueadas.length, vagas: ranqueadas });
  } catch (err: any) {
    logError(`Erro no parse LinkedIn: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
};

// ── LinkedIn Cron ──

export const linkedinCronStatusController = (req: any, res: any) => {
  res.json({ ok: true, ...getLinkedinStatus() });
};

export const linkedinCronStartController = (req: any, res: any) => {
  const { cron } = req.body || {};
  const resultado = iniciarLinkedinCron({ cron });
  res.json({ ok: true, ...resultado });
};

export const linkedinCronStopController = (req: any, res: any) => {
  const resultado = pararLinkedinCron();
  res.json({ ok: true, ...resultado });
};

export const linkedinCronRunNowController = async (req: any, res: any) => {
  try {
    const resultado = await executarLinkedinAgora();
    res.json({ ok: true, resultado });
  } catch (err: any) {
    logError(`Erro LinkedIn cron: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
};