import cron, { type ScheduledTask } from "node-cron";
import { getDb } from "../../core/database.js";
import * as logger from "../../core/logger.js";

let task: ScheduledTask | null = null;

/**
 * Limpeza diária de dados expirados/sem utilidade para manter o banco
 * enxuto e com bom desempenho:
 * - auth_refresh_tokens: tokens expirados há mais de 30 dias
 * - fin_notification_events: eventos ignorados com mais de 30 dias
 * - promo_sent_messages: mensagens enviadas há mais de 90 dias
 */
export const startSweeper = (): void => {
  if (task) return;

  task = cron.schedule("0 3 * * *", async () => {
    try {
      const db = await getDb();
      const refresh = await db.run(
        "DELETE FROM auth_refresh_tokens WHERE expires_at < datetime('now', '-30 days')",
      );
      const events = await db.run(
        "DELETE FROM fin_notification_events WHERE status = 'ignored' AND created_at < datetime('now', '-30 days')",
      );
      const sent = await db.run(
        "DELETE FROM promo_sent_messages WHERE created_at < datetime('now', '-90 days')",
      );
      logger.info(
        `[Sweeper] Limpeza concluída: ${refresh.changes ?? 0} refresh tokens, ${events.changes ?? 0} eventos, ${sent.changes ?? 0} mensagens antigas`,
        "Sweeper",
      );
    } catch (err) {
      logger.error(`[Sweeper] Falha na limpeza: ${err}`, "Sweeper");
    }
  });
  logger.info("Sweeper diário iniciado (03:00 BRT)", "Sweeper");
};

export const stopSweeper = (): void => {
  if (task) {
    task.stop();
    task = null;
  }
};
