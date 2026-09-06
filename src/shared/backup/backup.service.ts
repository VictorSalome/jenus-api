import cron, { type ScheduledTask } from "node-cron";
import fs from "fs";
import path from "path";
import { config } from "../../core/config.js";
import { getDb } from "../../core/database.js";
import * as logger from "../../core/logger.js";

let task: ScheduledTask | null = null;

const RETENTION_DAYS = 30;

export function backupDir(): string {
  // Backups fora de data/ (data/ pode ser limpa como um todo em restores)
  return process.env.BACKUP_DIR || path.join(path.dirname(path.resolve(config.DATABASE_PATH)), "backups");
}

/**
 * Executa um backup consistente do SQLite via `VACUUM INTO` — cria um
 * arquivo novo e compactado semanticamente (reconstrói as páginas),
 * seguro de rodar com o banco em uso (WAL), diferente de copiar o .db.
 */
export async function runBackup(): Promise<{ ok: boolean; file?: string; sizeBytes?: number; error?: string }> {
  try {
    const dir = backupDir();
    fs.mkdirSync(dir, { recursive: true });

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const file = path.join(dir, `jenus-db-${stamp}.db`);

    const db = await getDb();
    await db.run(`VACUUM INTO ?`, file);

    const sizeBytes = fs.statSync(file).size;
    logger.info(`[Backup] Concluído: ${file} (${(sizeBytes / 1024 / 1024).toFixed(1)} MB)`, "Backup");
    return { ok: true, file, sizeBytes };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[Backup] Falhou: ${msg}`, "Backup");
    return { ok: false, error: msg };
  }
}

/** Remove backups mais antigos que RETENTION_DAYS dias. */
export function pruneOldBackups(): number {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return 0;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!/^jenus-db-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.db$/.test(f)) continue;
    const full = path.join(dir, f);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) {
        fs.unlinkSync(full);
        removed++;
      }
    } catch {}
  }
  if (removed > 0) logger.info(`[Backup] Retenção: ${removed} backup(s) antigo(s) removido(s)`, "Backup");
  return removed;
}

export function startBackupCron(): void {
  if (task) return;
  // 03:30 — depois do sweeper (03:00), banco já limpo ao fazer backup
  task = cron.schedule("30 3 * * *", async () => {
    await runBackup();
    pruneOldBackups();
  });
  logger.info("Cron de backup diário iniciado (03:30)", "Backup");
}

export function stopBackupCron(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
