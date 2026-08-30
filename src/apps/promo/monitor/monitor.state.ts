// Estado global do monitor — persistido em SQLite (promo_monitor_state) com cache em memória.
import { getDb } from "../../../core/database.js";
import * as logger from "../../../core/logger.js";

let isRunning = false;
let telegramConnected = false;
let lastCheckAt: string | null = null;
let lastError: string | null = null;
let consecutiveErrors = 0;
let currentIntervalMs = 120000;
let messagesProcessed = 0;
let loaded = false;

function persist(): void {
  // Fire-and-forget: escrita assíncrona sem bloquear o loop do monitor.
  void (async () => {
    try {
      const db = await getDb();
      await db.run(
        `INSERT INTO promo_monitor_state (id, is_running, telegram_connected, last_check_at, last_error, consecutive_errors, current_interval_ms, messages_processed, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           is_running=excluded.is_running,
           telegram_connected=excluded.telegram_connected,
           last_check_at=excluded.last_check_at,
           last_error=excluded.last_error,
           consecutive_errors=excluded.consecutive_errors,
           current_interval_ms=excluded.current_interval_ms,
           messages_processed=excluded.messages_processed,
           updated_at=CURRENT_TIMESTAMP`,
        isRunning ? 1 : 0,
        telegramConnected ? 1 : 0,
        lastCheckAt,
        lastError,
        consecutiveErrors,
        currentIntervalMs,
        messagesProcessed,
      );
    } catch (err) {
      logger.error(`Falha ao persistir estado do monitor: ${err}`, "Monitor");
    }
  })();
}

export async function loadMonitorState(): Promise<void> {
  if (loaded) return;
  try {
    const db = await getDb();
    const row = await db.get<{
      is_running: number;
      telegram_connected: number;
      last_check_at: string | null;
      last_error: string | null;
      consecutive_errors: number;
      current_interval_ms: number;
      messages_processed: number;
    }>("SELECT * FROM promo_monitor_state WHERE id = 1");
    if (row) {
      isRunning = row.is_running === 1;
      telegramConnected = row.telegram_connected === 1;
      lastCheckAt = row.last_check_at;
      lastError = row.last_error;
      consecutiveErrors = row.consecutive_errors ?? 0;
      currentIntervalMs = row.current_interval_ms ?? 120000;
      messagesProcessed = row.messages_processed ?? 0;
    }
  } catch (err) {
    logger.error(`Falha ao carregar estado do monitor: ${err}`, "Monitor");
  } finally {
    loaded = true;
  }
}

export function setRunningState(running: boolean): void {
  isRunning = running;
  persist();
}

export function setTelegramConnected(connected: boolean): void {
  telegramConnected = connected;
  persist();
}

export function setLastCheckAt(value: string | null): void {
  lastCheckAt = value;
  persist();
}

export function setLastError(value: string | null): void {
  lastError = value;
  persist();
}

export function setConsecutiveErrors(value: number): void {
  consecutiveErrors = value;
  persist();
}

export function setCurrentIntervalMs(value: number): void {
  currentIntervalMs = value;
  persist();
}

export function addMessagesProcessed(count: number): void {
  messagesProcessed += count;
  persist();
}

export function getMonitorStatus(): { running: boolean } {
  return { running: isRunning };
}

export function getConnectionStatus(): {
  telegramConnected: boolean;
  monitorRunning: boolean;
  lastCheckAt: string | null;
  lastError: string | null;
  consecutiveErrors: number;
  currentIntervalMs: number;
  messagesProcessed: number;
} {
  return {
    telegramConnected,
    monitorRunning: isRunning,
    lastCheckAt,
    lastError,
    consecutiveErrors,
    currentIntervalMs,
    messagesProcessed,
  };
}

export function getTelemetry(): {
  running: boolean;
  telegramConnected: boolean;
  lastCheckAt: string | null;
  lastError: string | null;
  consecutiveErrors: number;
  currentIntervalMs: number;
  messagesProcessed: number;
} {
  return {
    running: isRunning,
    telegramConnected,
    lastCheckAt,
    lastError,
    consecutiveErrors,
    currentIntervalMs,
    messagesProcessed,
  };
}
