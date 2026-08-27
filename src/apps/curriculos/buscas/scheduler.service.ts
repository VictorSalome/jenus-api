import cron from "node-cron";
import { executarPipeline } from "./autoApply.service.js";
import { logInfo, logError } from "../shared/utils/logger.js";

let tarefaAtiva = null;
let ultimaExecucao = null;
let historico = [];
let configAtual = {};

/**
 * Inicia o scheduler de busca automática
 * Default: a cada 1 hora. Nunca envia sozinho — só descobre vagas, calcula
 * compatibilidade e deixa candidaturas prontas aguardando revisão em
 * /api/curriculo/pending-applications.
 */
export const iniciarScheduler = ({
  cron: cronExpr = "0 */1 * * *",
  tags = [
    "react",
    "react native",
    "next.js",
    "node",
    "node.js",
    "typescript",
    "javascript",
    "full stack",
    "fullstack",
    "frontend",
    "backend",
    "mobile",
    "flutter",
    "angular",
    "vue",
    "python",
    "java",
    "php",
    "dotnet",
    "c#",
    "nest",
    "nestjs",
    "express",
    "aws",
    "docker",
  ],
  minScore = 60,
} = {}) => {
  if (tarefaAtiva) {
    logInfo("Scheduler já está rodando, parando anterior...");
    pararScheduler();
  }

  configAtual = { cron: cronExpr, tags, minScore };
  logInfo(
    `Iniciando scheduler: ${cronExpr} | tags: ${tags.join(",")} | minScore: ${minScore}`,
  );

  tarefaAtiva = cron.schedule(cronExpr, async () => {
    await executarBusca(configAtual);
  });

  logInfo("Scheduler 24/7 iniciado");
  return { status: "iniciado", ...configAtual };
};

/**
 * Auto-start: chamado no boot do servidor
 */
export const autoStartScheduler = () => {
  logInfo("Auto-start scheduler 24/7...");
  return iniciarScheduler({});
};

/**
 * Para o scheduler
 */
export const pararScheduler = () => {
  if (tarefaAtiva) {
    tarefaAtiva.stop();
    tarefaAtiva = null;
    logInfo("Scheduler parado");
  }
  return { status: "parado" };
};

/**
 * Executa uma busca manualmente
 */
export const executarBusca = async ({
  tags,
  minScore = 70,
}: {
  tags?: string[];
  minScore?: number;
} = {}) => {
  const startTime = Date.now();
  logInfo("Executando busca agendada...");

  try {
    const resultado = await executarPipeline({
      tags,
      minScore,
      limit: 10,
    });
    const registro = {
      timestamp: new Date().toISOString(),
      duracao: `${Date.now() - startTime}ms`,
      total: resultado.resumo.total,
      compatveis: resultado.resumo.compatveis,
      pendentes: resultado.resumo.pendentes,
    };

    historico.push(registro);
    if (historico.length > 50) historico = historico.slice(-50);
    ultimaExecucao = registro;

    logInfo("Busca agendada concluída", registro);
    return resultado;
  } catch (err) {
    logError(`Erro na busca agendada: ${err.message}`);
    throw err;
  }
};

/**
 * Retorna status do scheduler
 */
export const getStatus = () => ({
  rodando: !!tarefaAtiva,
  config: configAtual,
  ultimaExecucao,
  historico: historico.slice(-10),
});
