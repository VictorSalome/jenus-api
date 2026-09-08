import { Request, Response } from "express";
import {
  obterEstatisticas,
  listarEmpresas,
  buscarPorSlug as buscarEmpresaPorSlug,
  buscarPorId as buscarEmpresaPorId,
  atualizarStatus,
} from "../repositories/empresa.repository.js";
import { StatusLead } from "../types.js";
import { dispararParaEmpresa } from "../services/dispatcher.service.js";
import {
  iniciarScheduler,
  pararScheduler,
  executarCiclo,
  obterStatusScheduler,
} from "../services/scheduler.service.js";

export const obterStatus = async (_req: Request, res: Response): Promise<void> => {
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
    res.status(500).json({
      success: false,
      message: "Erro ao obter status da prospecção",
      error: err?.message,
    });
  }
};

export const iniciar = async (_req: Request, res: Response): Promise<void> => {
  try {
    iniciarScheduler();
    res.json({
      success: true,
      message: "Scheduler de prospecção iniciado com sucesso",
      data: obterStatusScheduler(),
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Erro ao iniciar scheduler",
      error: err?.message,
    });
  }
};

export const parar = async (_req: Request, res: Response): Promise<void> => {
  try {
    pararScheduler();
    res.json({
      success: true,
      message: "Scheduler de prospecção pausado com sucesso",
      data: obterStatusScheduler(),
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Erro ao parar scheduler",
      error: err?.message,
    });
  }
};

export const executarAgora = async (req: Request, res: Response): Promise<void> => {
  try {
    const { termo, limite } = req.body || {};
    const parsedLimite = limite !== undefined ? Number(limite) : undefined;
    const resultado = await executarCiclo(termo, parsedLimite);

    res.json({
      success: true,
      message: "Ciclo de prospecção executado com sucesso",
      data: resultado,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Erro ao executar ciclo de prospecção",
      error: err?.message,
    });
  }
};

export const listar = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const empresas = await listarEmpresas({ status, limit });
    res.json({
      success: true,
      data: empresas,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Erro ao listar empresas",
      error: err?.message,
    });
  }
};

export const buscarPorSlug = async (req: Request, res: Response): Promise<void> => {
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
    res.status(500).json({
      success: false,
      message: "Erro ao buscar empresa por slug",
      error: err?.message,
    });
  }
};

export const atualizarStatusLead = async (req: Request, res: Response): Promise<void> => {
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
    res.status(500).json({
      success: false,
      message: "Erro ao atualizar status do lead",
      error: err?.message,
    });
  }
};

export const aprovarLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const lead = await atualizarStatus(id, StatusLead.APROVADA);
    if (!lead) {
      res.status(404).json({ success: false, message: "Lead não encontrado" });
      return;
    }
    res.json({ success: true, message: "Lead aprovado com sucesso", data: lead });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Erro ao aprovar lead", error: err?.message });
  }
};

export const rejeitarLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { motivo } = req.body || {};
    const lead = await atualizarStatus(id, StatusLead.REJEITADA, motivo || "REPROVADO_MANUAL");
    if (!lead) {
      res.status(404).json({ success: false, message: "Lead não encontrado" });
      return;
    }
    res.json({ success: true, message: "Lead rejeitado com sucesso", data: lead });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Erro ao rejeitar lead", error: err?.message });
  }
};

export const dispararLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const empresa = await buscarEmpresaPorId(id);
    if (!empresa) {
      res.status(404).json({ success: false, message: "Lead não encontrado" });
      return;
    }

    const { dryRun, baseUrl } = req.body || {};
    const resultado = await dispararParaEmpresa(empresa, {
      baseUrl: baseUrl || process.env.DEMO_BASE_URL || "https://jenus-site.vercel.app",
      dryRun: Boolean(dryRun),
    });

    res.json({
      success: resultado.sucesso,
      message: resultado.sucesso
        ? `Disparo efetuado com sucesso via ${resultado.canal}`
        : `Não foi possível disparar: ${resultado.motivo || "Erro desconhecido"}`,
      data: resultado,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Erro ao disparar lead",
      error: err?.message,
    });
  }
};

export const converterLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const lead = await atualizarStatus(id, StatusLead.CONVERTIDA);
    if (!lead) {
      res.status(404).json({ success: false, message: "Lead não encontrado" });
      return;
    }
    res.json({
      success: true,
      message: "Lead convertido com sucesso em cliente oficial",
      data: lead,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Erro ao converter lead",
      error: err?.message,
    });
  }
};
