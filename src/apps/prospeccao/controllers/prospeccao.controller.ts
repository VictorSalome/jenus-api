import { Request, Response, NextFunction } from "express";
import {
  obterEstatisticas,
  listarEmpresas,
  buscarPorSlug as buscarEmpresaPorSlug,
  buscarPorId as buscarEmpresaPorId,
  atualizarStatus,
  aprovarLead as aprovarLeadRepo,
  rejeitarLead as rejeitarLeadRepo,
  marcarRespondido as marcarRespondidoRepo,
  converterLead as converterLeadRepo,
} from "../repositories/empresa.repository.js";
import { StatusLead } from "../types.js";
import { dispararParaEmpresa } from "../services/dispatcher.service.js";
import {
  iniciarScheduler,
  pararScheduler,
  executarCiclo,
  obterStatusScheduler,
  obterProgresso,
} from "../services/scheduler.service.js";
import * as logger from "../../../core/logger.js";

export const obterStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const estatisticas = await obterEstatisticas();
    const scheduler = obterStatusScheduler();
    res.json({
      success: true,
      data: {
        estatisticas,
        scheduler,
      },
    });
  } catch (err: any) {
    next(err);
  }
};

export const iniciar = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    iniciarScheduler();
    res.json({
      success: true,
      message: "Scheduler de prospecção iniciado com sucesso",
      data: obterStatusScheduler(),
    });
  } catch (err: any) {
    next(err);
  }
};

export const parar = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    pararScheduler();
    res.json({
      success: true,
      message: "Scheduler de prospecção pausado com sucesso",
      data: obterStatusScheduler(),
    });
  } catch (err: any) {
    next(err);
  }
};

export const obterProgressoController = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const progresso = obterProgresso();
    res.json({
      success: true,
      data: progresso,
    });
  } catch (err: any) {
    next(err);
  }
};

export const executarAgora = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { termo, limite, async: isAsync } = req.body || {};
    const parsedLimite = limite !== undefined ? Number(limite) : undefined;

    if (isAsync) {
      executarCiclo(termo, parsedLimite).catch((err: any) => {
        logger.error(
          `Erro no ciclo em segundo plano para "${termo || "padrão"}": ${err?.message || err}`,
          "ProspeccaoController"
        );
      });

      res.status(202).json({
        success: true,
        message: "Mineração iniciada em segundo plano",
        data: obterProgresso(),
      });
      return;
    }

    const resultado = await executarCiclo(termo, parsedLimite);

    res.json({
      success: true,
      message: "Ciclo de prospecção executado com sucesso",
      data: resultado,
    });
  } catch (err: any) {
    next(err);
  }
};

export const listar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const empresas = await listarEmpresas({ status, limit });
    res.json({
      success: true,
      data: empresas,
    });
  } catch (err: any) {
    next(err);
  }
};

export const buscarPorSlug = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { slug } = req.params;
    if (!slug) {
      res.status(400).json({
        success: false,
        message: "Slug é obrigatório",
      });
      return;
    }

    const empresa = await buscarEmpresaPorSlug(slug);
    if (!empresa) {
      res.status(404).json({
        success: false,
        message: "Empresa não encontrada",
      });
      return;
    }

    res.json({
      success: true,
      data: empresa,
    });
  } catch (err: any) {
    next(err);
  }
};

export const atualizarStatusLead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, motivo_rejeicao } = req.body;

    if (!id || !status) {
      res.status(400).json({
        success: false,
        message: "ID e status são obrigatórios",
      });
      return;
    }

    const leadAtualizado = await atualizarStatus(id, status, motivo_rejeicao);
    if (!leadAtualizado) {
      res.status(404).json({
        success: false,
        message: "Lead não encontrado",
      });
      return;
    }

    res.json({
      success: true,
      data: leadAtualizado,
    });
  } catch (err: any) {
    next(err);
  }
};

export const aprovarLead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.email || (req as any).user?.id || "victor";
    const lead = await aprovarLeadRepo(id, userId);
    if (!lead) {
      res.status(404).json({ success: false, message: "Lead não encontrado" });
      return;
    }
    res.json({ success: true, message: "Lead aprovado na esteira de qualidade e pronto para envio", data: lead });
  } catch (err: any) {
    next(err);
  }
};

export const rejeitarLead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { motivo } = req.body || {};
    const userId = (req as any).user?.email || (req as any).user?.id || "victor";
    const lead = await rejeitarLeadRepo(id, motivo || "REPROVADO_MANUAL", userId);
    if (!lead) {
      res.status(404).json({ success: false, message: "Lead não encontrado" });
      return;
    }
    res.json({ success: true, message: "Lead rejeitado com sucesso", data: lead });
  } catch (err: any) {
    next(err);
  }
};

export const dispararLead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const empresa = await buscarEmpresaPorId(id);
    if (!empresa) {
      res.status(404).json({ success: false, message: "Lead não encontrado" });
      return;
    }

    const { dryRun, baseUrl, force } = req.body || {};
    const resultado = await dispararParaEmpresa(empresa, {
      baseUrl: baseUrl || process.env.DEMO_BASE_URL || "https://jenus-site.vercel.app",
      dryRun: Boolean(dryRun),
      force: Boolean(force),
    });

    if (!resultado.sucesso) {
      const isBlockedAuth = resultado.motivo?.includes("BLOQUEADO_NAO_APROVADO");
      const isBlockedDup = resultado.motivo?.includes("BLOQUEADO_DUPLICIDADE");
      const isBlockedProc = resultado.motivo?.includes("BLOQUEADO_EM_PROCESSAMENTO");
      const statusHttp = isBlockedAuth ? 403 : isBlockedDup || isBlockedProc ? 409 : 400;

      res.status(statusHttp).json({
        success: false,
        message: resultado.motivo || "Não foi possível disparar para este lead",
        data: resultado,
      });
      return;
    }

    res.json({
      success: true,
      message: `Disparo efetuado com sucesso via ${resultado.canal}`,
      data: resultado,
    });
  } catch (err: any) {
    next(err);
  }
};

export const responderLead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const lead = await marcarRespondidoRepo(id);
    if (!lead) {
      res.status(404).json({ success: false, message: "Lead não encontrado" });
      return;
    }
    res.json({
      success: true,
      message: "Lead marcado como respondido (em negociação)",
      data: lead,
    });
  } catch (err: any) {
    next(err);
  }
};

export const converterLead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const lead = await converterLeadRepo(id);
    if (!lead) {
      res.status(404).json({ success: false, message: "Lead não encontrado" });
      return;
    }
    res.json({
      success: true,
      message: "Lead convertido com sucesso em cliente oficial ativo",
      data: lead,
    });
  } catch (err: any) {
    next(err);
  }
};
