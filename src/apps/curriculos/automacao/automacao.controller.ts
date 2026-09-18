import { Request, Response, NextFunction } from "express";
import { vagasEmailWorker } from "./vagasEmailWorker.service.js";
import { logError, logInfo } from "../shared/utils/logger.js";

/**
 * GET /automacao/status
 * Retorna o estado atual da automação em tempo real
 */
export const obterStatusController = async (_req: Request, res: Response) => {
  res.json({
    ok: true,
    ...vagasEmailWorker.getStatus(),
  });
};

/**
 * GET /automacao/preview
 * Lista todas as vagas do feed com cálculo de score e elegibilidade antes do envio
 */
export const obterPreviewController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const minScore = req.query.minScore ? Number(req.query.minScore) : undefined;
    const dailyLimit = req.query.dailyLimit
      ? Number(req.query.dailyLimit)
      : undefined;
    const hourlyLimit = req.query.hourlyLimit
      ? Number(req.query.hourlyLimit)
      : undefined;
    const modoAmplo =
      req.query.modoAmplo !== undefined
        ? req.query.modoAmplo === "true" || req.query.modoAmplo === "1"
        : undefined;

    const preview = await vagasEmailWorker.gerarPreview({
      ...(minScore !== undefined ? { minScore } : {}),
      ...(hourlyLimit !== undefined ? { hourlyLimit } : {}),
      ...(dailyLimit !== undefined ? { dailyLimit } : {}),
      ...(modoAmplo !== undefined ? { modoAmplo } : {}),
    });

    res.json({
      ok: true,
      ...preview,
    });
  } catch (err: any) {
    logError("Erro ao gerar preview de vagas:", err);
    next(err);
  }
};

/**
 * GET /automacao/preview/:jobId/curriculo
 * Gera e retorna a prévia dos dados do currículo personalizado para uma vaga específica
 */
export const obterPreviewCurriculoVagaController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { jobId } = req.params;
    const curriculo = await vagasEmailWorker.gerarPreviewCurriculoVaga(jobId);
    res.json({
      ok: true,
      jobId,
      curriculo,
    });
  } catch (err: any) {
    logError(`Erro ao gerar preview de currículo para vaga ${req.params.jobId}:`, err);
    next(err);
  }
};

/**
 * POST /automacao/start
 * Inicia o ciclo de envio automático com parâmetros opcionais
 */
export const iniciarAutomacaoController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    logInfo("=> POST /automacao/start acessado. Body: " + JSON.stringify(req.body));
    const {
      minScore,
      hourlyLimit,
      dailyLimit,
      minDelaySeconds,
      maxDelaySeconds,
      windowHours,
      feedUrl,
      overrideEmail,
      modoAmplo,
      semIa,
      habilitarFraseEquivalencia,
    } = req.body || {};

    const status = await vagasEmailWorker.iniciar({
      ...(minScore !== undefined ? { minScore: Number(minScore) } : {}),
      ...(hourlyLimit !== undefined ? { hourlyLimit: Number(hourlyLimit) } : {}),
      ...(dailyLimit !== undefined ? { dailyLimit: Number(dailyLimit) } : {}),
      ...(minDelaySeconds !== undefined
        ? { minDelaySeconds: Number(minDelaySeconds) }
        : {}),
      ...(maxDelaySeconds !== undefined
        ? { maxDelaySeconds: Number(maxDelaySeconds) }
        : {}),
      ...(windowHours !== undefined ? { windowHours: Number(windowHours) } : {}),
      ...(feedUrl ? { feedUrl: String(feedUrl) } : {}),
      ...(overrideEmail !== undefined ? { overrideEmail: overrideEmail ? String(overrideEmail) : null } : {}),
      ...(modoAmplo !== undefined ? { modoAmplo: Boolean(modoAmplo) } : {}),
      ...(semIa !== undefined ? { semIa: Boolean(semIa) } : {}),
      ...(habilitarFraseEquivalencia !== undefined ? { habilitarFraseEquivalencia: Boolean(habilitarFraseEquivalencia) } : {}),
    });
    
    logInfo("=> Worker iniciado com sucesso. Status: " + JSON.stringify(status));

    res.json({
      ok: true,
      ...status,
    });
  } catch (err: any) {
    console.error("=> Erro no iniciarAutomacaoController:", err.message);
    if (
      err.message?.includes("já está em execução") ||
      err.message?.includes("já foi atingido")
    ) {
      return res.status(400).json({ ok: false, message: err.message });
    }
    logError("Erro ao iniciar automação:", err);
    next(err);
  }
};

/**
 * POST /automacao/pause
 * Pausa o envio entre vagas
 */
export const pausarAutomacaoController = (req: Request, res: Response) => {
  const status = vagasEmailWorker.pausar();
  res.json({ ok: true, ...status });
};

/**
 * POST /automacao/resume
 * Retoma o envio pausado
 */
export const retomarAutomacaoController = (req: Request, res: Response) => {
  const status = vagasEmailWorker.retomar();
  res.json({ ok: true, ...status });
};

/**
 * POST /automacao/stop
 * Cancela o worker
 */
export const pararAutomacaoController = async (req: Request, res: Response) => {
  const status = await vagasEmailWorker.parar();
  res.json({ ok: true, ...status });
};

/**
 * GET /automacao/logs
 * Retorna os logs do worker paginados
 */
export const obterLogsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const logs = await vagasEmailWorker.obterLogs(limit, offset);
    res.json({
      ok: true,
      total: logs.length,
      limit,
      offset,
      logs,
    });
  } catch (err: any) {
    logError("Erro ao listar logs da automação:", err);
    next(err);
  }
};

/**
 * GET /automacao/candidaturas
 * Retorna as candidaturas processadas, filtradas por status
 */
export const obterCandidaturasController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const candidaturas = await vagasEmailWorker.obterCandidaturas(
      status,
      limit,
      offset,
    );
    res.json({
      ok: true,
      total: candidaturas.length,
      limit,
      offset,
      candidaturas,
    });
  } catch (err: any) {
    logError("Erro ao listar candidaturas da automação:", err);
    next(err);
  }
};

/**
 * PUT /automacao/config
 * Atualiza e salva as configurações padrão no SQLite
 */
export const atualizarConfiguracaoController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const configAtualizada = await vagasEmailWorker.salvarConfiguracao(req.body || {});
    res.json({
      ok: true,
      config: configAtualizada,
    });
  } catch (err: any) {
    logError("Erro ao atualizar configurações da automação:", err);
    next(err);
  }
};
