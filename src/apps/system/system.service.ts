import fs from "fs/promises";
import os from "os";
import path from "path";

export interface LogEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  module: string | null;
  message: string;
}

interface ParsedLogEntry extends LogEntry {
  /** epoch ms — os dois formatos de timestamp usados no backend não são
   * comparáveis como string (um usa espaço, outro "T"), então ordenamos
   * por essa chave numérica em vez do timestamp bruto. */
  sortKey: number;
}

// Onde o PM2 grava stdout/stderr do processo — mesmo destino usado por
// TODOS os loggers do backend (core/logger.ts e o logger específico de
// curriculos ambos escrevem em console.*, que o PM2 captura aqui).
// Configurável via env pra não quebrar em dev local (onde esses arquivos
// não existem — nesse caso getLogs devolve lista vazia).
const PM2_LOG_DIR = process.env.PM2_LOG_DIR || path.join(os.homedir(), ".pm2", "logs");
const PM2_APP_NAME = process.env.PM2_APP_NAME || "jenus-api";

const OUT_LOG = path.join(PM2_LOG_DIR, `${PM2_APP_NAME}-out.log`);
const ERROR_LOG = path.join(PM2_LOG_DIR, `${PM2_APP_NAME}-error.log`);

// Casa os dois formatos de timestamp usados no backend:
// "2026-09-01 15:35:01" (core/logger.ts) e "2026-09-01T14:00:01.178Z" (curriculos/logger.ts)
const LINE_RE =
  /^\[(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\]\s*\[(INFO|WARN|ERROR|ERRO|DEBUG)\]\s*(?:\[([^\]]+)\]\s*)?(.*)$/;

const LEVEL_MAP: Record<string, LogEntry["level"]> = {
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
  ERRO: "ERROR",
  DEBUG: "DEBUG",
};

/** Lê só o final do arquivo (evita carregar logs de produção inteiros na memória). */
async function readTail(filePath: string, maxBytes: number): Promise<string> {
  try {
    const stat = await fs.stat(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const handle = await fs.open(filePath, "r");
    try {
      const length = stat.size - start;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, start);
      return buffer.toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return "";
  }
}

function toSortKey(timestamp: string): number {
  const t = new Date(timestamp.replace(" ", "T")).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function parseLines(raw: string): ParsedLogEntry[] {
  const entries: ParsedLogEntry[] = [];
  let last: ParsedLogEntry | null = null;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const match = LINE_RE.exec(line);
    if (!match) {
      // Linha sem o formato esperado (stack trace multi-linha, JSON solto
      // etc.) — anexa à mensagem anterior em vez de virar uma entrada
      // solta sem timestamp (que bagunçaria a ordenação).
      if (last) {
        last.message += `\n${line}`;
      } else {
        entries.push({ timestamp: "", level: "INFO", module: null, message: line, sortKey: 0 });
      }
      continue;
    }
    const [, timestamp, levelRaw, moduleTag, message] = match;
    last = {
      timestamp,
      level: LEVEL_MAP[levelRaw] ?? "INFO",
      module: moduleTag ?? null,
      message,
      sortKey: toSortKey(timestamp),
    };
    entries.push(last);
  }
  return entries;
}

export interface GetLogsParams {
  level?: string;
  module?: string;
  limit?: number;
}

export async function getLogs({ level, module, limit = 200 }: GetLogsParams): Promise<{
  entries: LogEntry[];
  available: boolean;
}> {
  const [outRaw, errRaw] = await Promise.all([
    readTail(OUT_LOG, 1_000_000),
    readTail(ERROR_LOG, 1_000_000),
  ]);

  const available = outRaw.length > 0 || errRaw.length > 0;
  let entries = [...parseLines(outRaw), ...parseLines(errRaw)];

  if (level) {
    const wanted = level.toUpperCase();
    entries = entries.filter((e) => e.level === wanted);
  }
  if (module) {
    const wanted = module.toLowerCase();
    entries = entries.filter((e) => (e.module ?? "").toLowerCase().includes(wanted));
  }

  // Mais recente primeiro.
  entries.sort((a, b) => b.sortKey - a.sortKey);

  const cap = Math.min(Math.max(limit, 1), 1000);
  const sliced = entries.slice(0, cap);
  return {
    entries: sliced.map(({ sortKey: _sortKey, ...rest }) => rest),
    available,
  };
}

export async function listModules(): Promise<string[]> {
  const { entries } = await getLogs({ limit: 1000 });
  const set = new Set<string>();
  for (const e of entries) if (e.module) set.add(e.module);
  return Array.from(set).sort();
}
