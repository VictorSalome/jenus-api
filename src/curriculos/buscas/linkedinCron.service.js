import cron from "node-cron";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { logInfo, logError } from "../utils/logger.js";
import config from "../config/index.js";

const execAsync = promisify(exec);

let tarefaAtiva = null;
let ultimaExecucao = null;

const SCRAPER_PATH = path.resolve(
  config.paths.root,
  "scraper",
  "linkedin_scraper.py",
);

/**
 * Executa o scraper Python do LinkedIn
 */
const executarScraper = async () => {
  const inicio = Date.now();
  logInfo("Iniciando scraper LinkedIn...");

  try {
    const { stdout, stderr } = await execAsync(`python3 ${SCRAPER_PATH}`, {
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
          .filter(
            (l) => l.includes("📊") || l.includes("📤") || l.includes("✅"),
          )[0] || "Concluído",
    };

    logInfo(`Scraper LinkedIn finalizado em ${duracao}ms`);
    if (stdout)
      logInfo(`Scraper output: ${stdout.split("\n").slice(-5).join(" | ")}`);
  } catch (err) {
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

/**
 * Inicia o cron do scraper LinkedIn
 * Default: a cada 2 horas, minutos aleatórios
 */
export const iniciarLinkedinCron = ({
  cron: cronExpr = "15 */2 * * *", // a cada 2h, min 15
} = {}) => {
  if (tarefaAtiva) {
    tarefaAtiva.stop();
  }

  logInfo(`LinkedIn cron iniciado: ${cronExpr}`);
  tarefaAtiva = cron.schedule(cronExpr, executarScraper);
  return { status: "iniciado", cron: cronExpr };
};

export const pararLinkedinCron = () => {
  if (tarefaAtiva) {
    tarefaAtiva.stop();
    tarefaAtiva = null;
  }
  return { status: "parado" };
};

export const executarLinkedinAgora = async () => {
  await executarScraper();
  return ultimaExecucao;
};

export const getLinkedinStatus = () => ({
  rodando: !!tarefaAtiva,
  ultimaExecucao,
});
