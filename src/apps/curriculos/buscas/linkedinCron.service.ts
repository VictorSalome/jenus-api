import cron, { type ScheduledTask } from "node-cron";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { getDb } from "../../../core/database.js";
import { logInfo, logError } from "../shared/utils/logger.js";
import config from "../config/index.js";

const execAsync = promisify(exec);

let tarefaAtiva: ScheduledTask | null = null;
let cronExprAtiva: string | null = null;
let ultimaExecucao: any = null;

const SCRAPER_PATH = path.resolve(config.paths.root, "scraper", "linkedin_scraper.py");

/**
 * Executa o scraper Python do LinkedIn (requests, sem browser — leve o suficiente
 * para a VM Oracle de 956MB de RAM). A fonte oficial de vagas hoje é o feed remoto
 * (https://devagas-liard.vercel.app/vagas-email.json); este cron é um complemento
 * opcional e não deve depender do scraper Playwright (scraper.service.ts), que exige
 * baixar o browser Chromium — pesado demais para essa VM.
 */
const executarScraper = async () => {
  const inicio = Date.now();
  logInfo("Iniciando scraper LinkedIn...");

  try {
    const { stdout } = await execAsync(`python3 ${SCRAPER_PATH}`, {
      timeout: 300000, // 5 min max
      env: {
        ...process.env,
        API_URL: "http://localhost:3001",
      },
    });

    const duracao = Date.now() - inicio;
    ultimaExecucao = {
      timestamp: new Date().toISOString(),
      duracao: `${duracao}ms`,
      status: "ok",
      output:
        stdout
          .split("\n")
          .filter((l) => l.includes("📊") || l.includes("📤") || l.includes("✅"))[0] ||
        "Concluído",
    };

    logInfo(`Scraper LinkedIn finalizado em ${duracao}ms`);
    if (stdout) logInfo(`Scraper output: ${stdout.split("\n").slice(-5).join(" | ")}`);
  } catch (err: any) {
    const duracao = Date.now() - inicio;
    ultimaExecucao = {
      timestamp: new Date().toISOString(),
      duracao: `${duracao}ms`,
      status: "erro",
      output: err.message.substring(0, 200),
    };
    logError(`Erro no scraper LinkedIn: ${err.message}`);
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
