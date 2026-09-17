import cron, { type ScheduledTask } from "node-cron";
import { getDb } from "../../../core/database.js";
import { logInfo, logError } from "../shared/utils/logger.js";
import { executarScraperVagas } from "../scraper/scraper.service.js";

let tarefaAtiva: ScheduledTask | null = null;
let cronExprAtiva: string | null = null;
let ultimaExecucao: any = null;

/**
 * Executa o scraper de vagas do LinkedIn (Playwright, scraper.service.ts) diretamente
 * no processo Node, sem depender do script Python legado (jenus-api/scraper/linkedin_scraper.py).
 */
const executarScraper = async () => {
  const inicio = Date.now();
  logInfo("Iniciando scraper LinkedIn...");

  try {
    const relatorio = await executarScraperVagas();
    const duracao = Date.now() - inicio;

    ultimaExecucao = {
      timestamp: new Date().toISOString(),
      duracao: `${duracao}ms`,
      status: relatorio.erros.length > 0 && relatorio.vagasFinais === 0 ? "erro" : "ok",
      output: `${relatorio.vagasFinais} vaga(s) finais de ${relatorio.postsEncontrados} post(s) (${relatorio.buscasExecutadas} busca(s))`,
      relatorio,
    };

    logInfo(
      `Scraper LinkedIn finalizado em ${duracao}ms: ${relatorio.vagasFinais} vaga(s) finais, ${relatorio.erros.length} erro(s)`,
    );
    if (relatorio.erros.length > 0) {
      logError(`Erros no scraper LinkedIn: ${relatorio.erros.join(" | ")}`);
    }
  } catch (err: any) {
    const duracao = Date.now() - inicio;
    ultimaExecucao = {
      timestamp: new Date().toISOString(),
      duracao: `${duracao}ms`,
      status: "erro",
      output: String(err?.message || err).substring(0, 200),
    };
    logError(`Erro no scraper LinkedIn: ${err?.message || err}`);
  }
};

async function persistirEstadoCron(ativo: boolean, cronExpr?: string): Promise<void> {
  try {
    const db = await getDb();
    if (cronExpr) {
      await db.run(
        "UPDATE curriculo_automacao_config SET linkedin_cron_ativo = ?, linkedin_cron_expr = ? WHERE id = 1",
        ativo ? 1 : 0,
        cronExpr,
      );
    } else {
      await db.run(
        "UPDATE curriculo_automacao_config SET linkedin_cron_ativo = ? WHERE id = 1",
        ativo ? 1 : 0,
      );
    }
  } catch (err) {
    logError("Erro ao persistir estado do LinkedIn cron:", err);
  }
}

/**
 * Lê do banco se o cron do LinkedIn deveria estar rodando (persistido pela última chamada
 * de start/stop), para permitir auto-resume no boot do servidor após um redeploy.
 */
export async function getEstadoPersistidoLinkedinCron(): Promise<{
  ativo: boolean;
  cronExpr: string;
}> {
  try {
    const db = await getDb();
    const row = await db.get<any>(
      "SELECT linkedin_cron_ativo, linkedin_cron_expr FROM curriculo_automacao_config WHERE id = 1",
    );
    return {
      ativo: Boolean(row?.linkedin_cron_ativo),
      cronExpr: row?.linkedin_cron_expr || "15 */2 * * *",
    };
  } catch (err) {
    logError("Erro ao ler estado persistido do LinkedIn cron:", err);
    return { ativo: false, cronExpr: "15 */2 * * *" };
  }
}

/**
 * Inicia o cron do scraper LinkedIn
 * Default: a cada 2 horas, minutos aleatórios
 */
export const iniciarLinkedinCron = ({
  cron: cronExpr = "15 */2 * * *", // a cada 2h, min 15
}: { cron?: string } = {}) => {
  if (tarefaAtiva) {
    tarefaAtiva.stop();
  }

  logInfo(`LinkedIn cron iniciado: ${cronExpr}`);
  tarefaAtiva = cron.schedule(cronExpr, executarScraper);
  cronExprAtiva = cronExpr;
  persistirEstadoCron(true, cronExpr);
  return { status: "iniciado", cron: cronExpr };
};

export const pararLinkedinCron = () => {
  if (tarefaAtiva) {
    tarefaAtiva.stop();
    tarefaAtiva = null;
  }
  cronExprAtiva = null;
  persistirEstadoCron(false);
  return { status: "parado" };
};

export const executarLinkedinAgora = async () => {
  await executarScraper();
  return ultimaExecucao;
};

export const getLinkedinStatus = () => ({
  rodando: !!tarefaAtiva,
  cron: cronExprAtiva,
  ultimaExecucao,
});
