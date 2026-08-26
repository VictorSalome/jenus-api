import cron from "node-cron";
import { executarPipeline } from "./autoApply.service.js";
import { logInfo, logError } from "../utils/logger.js";

let tarefaAtiva = null;
let ultimaExecucao = null;
let historico = [];
let configAtual = {};

/**
 * Inicia o scheduler de busca automática
 * Default: a cada 1 hora, auto-send ativo
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
  autoSend = true,
} = {}) => {
  if (tarefaAtiva) {
    logInfo("Scheduler já está rodando, parando anterior...");
    pararScheduler();
  }

  configAtual = { cron: cronExpr, tags, minScore, autoSend };
  logInfo(
    `Iniciando scheduler: ${cronExpr} | tags: ${tags.join(",")} | minScore: ${minScore} | autoSend: ${autoSend}`,
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
  autoSend = false,
} = {}) => {
  const startTime = Date.now();
  logInfo("Executando busca agendada...");

  try {
    const resultado = await executarPipeline({
      tags,
      minScore,
      limit: 10,
      autoSend,
    });
    const registro = {
      timestamp: new Date().toISOString(),
      duracao: `${Date.now() - startTime}ms`,
      total: resultado.resumo.total,
      compatveis: resultado.resumo.compatveis,
      enviados: resultado.resumo.enviados,
      gerados: resultado.resumo.gerados,
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
  ultimaExecucao,
  historico: historico.slice(-10),
});
