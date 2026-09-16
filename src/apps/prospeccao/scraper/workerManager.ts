import { fork, type ChildProcess } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import * as logger from "../../../core/logger.js";
import type { ResumoScraper, OpcoesScraperMaps } from "./mapsScraper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ext = path.extname(__filename); // .ts ou .js dependendo do ambiente
const WORKER_PATH = process.env.SCRAPER_WORKER_PATH || path.resolve(__dirname, `scraperWorker${ext}`);

interface ScraperTask {
  termoBusca: string;
  opcoes: OpcoesScraperMaps;
  resolve: (resumo: ResumoScraper) => void;
  reject: (error: Error) => void;
}

class ScraperWorkerManager {
  private queue: ScraperTask[] = [];
  private activeWorkers = new Set<ChildProcess>();
  private readonly MAX_CONCURRENCY = 2;
  private readonly WORKER_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos timeout absoluto

  constructor() {
    process.on("SIGTERM", this.shutdown.bind(this));
    process.on("SIGINT", this.shutdown.bind(this));
  }

  public async enqueue(termoBusca: string, opcoes?: OpcoesScraperMaps): Promise<ResumoScraper> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        termoBusca,
        opcoes: opcoes || {},
        resolve,
        reject,
      });
      this.processQueue();
    });
  }

  private processQueue() {
    if (this.queue.length === 0 || this.activeWorkers.size >= this.MAX_CONCURRENCY) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.startWorker(task);
  }

  private startWorker(task: ScraperTask) {
    logger.info(`Iniciando worker do scraper para "${task.termoBusca}"...`, "ScraperWorkerManager");

    const worker = fork(WORKER_PATH, [], {
      env: process.env,
      // O execArgv será automaticamente herdado (por exemplo, tsx se usado)
    });

    this.activeWorkers.add(worker);

    let isDone = false;

    // Timeout hard kill
    const timeoutId = setTimeout(() => {
      if (!isDone) {
        logger.error(`Worker timeout para "${task.termoBusca}". Forçando SIGKILL.`, "ScraperWorkerManager");
        worker.kill("SIGKILL");
        isDone = true;
        task.reject(new Error("Scraper timeout atingido. Processo finalizado forçadamente após 15 minutos."));
        this.activeWorkers.delete(worker);
        this.processQueue();
      }
    }, this.WORKER_TIMEOUT_MS);

    worker.on("message", (msg: any) => {
      if (msg.type === "PROGRESS") {
        if (task.opcoes.onProgress) {
          task.opcoes.onProgress(msg.payload.etapa, msg.payload.atual, msg.payload.total);
        }
      } else if (msg.type === "SUCCESS") {
        isDone = true;
        clearTimeout(timeoutId);
        task.resolve(msg.payload);
        worker.kill();
        this.activeWorkers.delete(worker);
        this.processQueue();
      } else if (msg.type === "ERROR") {
        isDone = true;
        clearTimeout(timeoutId);
        task.reject(new Error(msg.payload));
        worker.kill();
        this.activeWorkers.delete(worker);
        this.processQueue();
      }
    });

    worker.on("error", (error) => {
      if (!isDone) {
        isDone = true;
        clearTimeout(timeoutId);
        logger.error(`Worker erro: ${error.message}`, "ScraperWorkerManager");
        task.reject(error);
        this.activeWorkers.delete(worker);
        this.processQueue();
      }
    });

    worker.on("exit", (code, signal) => {
      if (!isDone) {
        isDone = true;
        clearTimeout(timeoutId);
        const reason = signal ? `sinal ${signal}` : `código ${code}`;
        logger.warn(`Worker encerrou inesperadamente com ${reason}`, "ScraperWorkerManager");
        task.reject(new Error(`Worker encerrado prematuramente: ${reason}`));
      }
      this.activeWorkers.delete(worker);
      this.processQueue();
    });

    // Removendo funções não serializáveis antes de enviar no IPC
    const ipcOpcoes = {
      limite: task.opcoes.limite,
      headless: task.opcoes.headless,
      autoAprovar: task.opcoes.autoAprovar,
    };

    worker.send({
      type: "START",
      payload: {
        termoBusca: task.termoBusca,
        opcoes: ipcOpcoes,
      },
    });
  }

  private shutdown() {
    if (this.activeWorkers.size > 0) {
      logger.info(`Encerrando ${this.activeWorkers.size} workers ativos no SIGTERM/INT...`, "ScraperWorkerManager");
      for (const worker of this.activeWorkers) {
        worker.kill("SIGKILL");
      }
      this.activeWorkers.clear();
    }
  }
}

export const scraperWorkerManager = new ScraperWorkerManager();