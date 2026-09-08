import cron, { type ScheduledTask } from "node-cron";
import prospeccaoConfig from "../config.js";
import { executarScraperMaps } from "../scraper/mapsScraper.js";
import { executarDisparador } from "./dispatcher.service.js";
import * as logger from "../../../core/logger.js";

export interface ItemHistoricoScheduler {
  data: Date;
  termo: string;
  coletados: number;
  enviados: number;
  sucesso: boolean;
  erro?: string;
}

export interface StatusScheduler {
  rodando: boolean;
  executando: boolean;
  cronExpressao: string;
  ultimaExecucao: Date | null;
  proximoTermo: string;
  totalExecucoes: number;
  historico: ItemHistoricoScheduler[];
}

let task: ScheduledTask | null = null;
let rodando = false;
let executando = false;
let ultimaExecucao: Date | null = null;
let indiceTermo = 0;
const historico: ItemHistoricoScheduler[] = [];

export const executarCiclo = async (
  termoCustomizado?: string,
  limite?: number,
): Promise<ItemHistoricoScheduler> => {
  if (executando) {
    throw new Error("Um ciclo de prospecção já está em andamento");
  }

  executando = true;

  const termos = prospeccaoConfig.PROSPECCAO_TERMOS_DEFAULT;
  const termo =
    termoCustomizado && termoCustomizado.trim()
      ? termoCustomizado.trim()
      : termos[indiceTermo % termos.length];

  if (!termoCustomizado) {
    indiceTermo = (indiceTermo + 1) % termos.length;
  }

  logger.info(`Iniciando ciclo para o termo "${termo}" (limite: ${limite ?? "padrão"})...`, "ProspeccaoScheduler");

  try {
    const resumoScraper = await executarScraperMaps(termo, { limite });
    const disparos = await executarDisparador({
      limite,
      baseUrl: prospeccaoConfig.LANDING_PAGE_BASE_URL,
    });

    const item: ItemHistoricoScheduler = {
      data: new Date(),
      termo,
      coletados: resumoScraper.empresas.length,
      enviados: disparos.filter((d) => d.sucesso).length,
      sucesso: true,
    };

    ultimaExecucao = item.data;
    historico.unshift(item);
    if (historico.length > 50) historico.pop();

    logger.info(
      `Ciclo concluído para "${termo}". Coletados: ${item.coletados}, Enviados: ${item.enviados}`,
      "ProspeccaoScheduler",
    );

    return item;
  } catch (err: any) {
    const item: ItemHistoricoScheduler = {
      data: new Date(),
      termo,
      coletados: 0,
      enviados: 0,
      sucesso: false,
      erro: err?.message || String(err),
    };

    ultimaExecucao = item.data;
    historico.unshift(item);
    if (historico.length > 50) historico.pop();

    logger.error(`Erro no ciclo para "${termo}": ${item.erro}`, "ProspeccaoScheduler");
    throw err;
  } finally {
    executando = false;
  }
};

export const iniciarScheduler = (): void => {
  if (task) {
    logger.warn("Scheduler de prospecção já está iniciado", "ProspeccaoScheduler");
    return;
  }

  const cronPattern = prospeccaoConfig.PROSPECCAO_CRON;

  task = cron.schedule(cronPattern, async () => {
    logger.info("Executando ciclo agendado de prospecção...", "ProspeccaoScheduler");
    try {
      await executarCiclo();
    } catch (err: any) {
      logger.error(`Falha no ciclo agendado: ${err?.message || err}`, "ProspeccaoScheduler");
    }
  });

  rodando = true;
  logger.info(`Scheduler de prospecção iniciado com cron: "${cronPattern}"`, "ProspeccaoScheduler");
};

export const pararScheduler = (): void => {
  if (task) {
    task.stop();
    task = null;
  }
  rodando = false;
  logger.info("Scheduler de prospecção parado", "ProspeccaoScheduler");
};

export const obterStatusScheduler = (): StatusScheduler => {
  const termos = prospeccaoConfig.PROSPECCAO_TERMOS_DEFAULT;
  const proximoTermo = termos[indiceTermo % termos.length];

  return {
    rodando,
    executando,
    cronExpressao: prospeccaoConfig.PROSPECCAO_CRON,
    ultimaExecucao,
    proximoTermo,
    totalExecucoes: historico.length,
    historico,
  };
};
