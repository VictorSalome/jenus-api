import cron, { type ScheduledTask } from "node-cron";
import { getDb } from "../../../core/database.js";
import { logInfo, logError } from "../shared/utils/logger.js";
import { notificationDispatcher } from "../../../shared/notifications/index.js";

let cronTask: ScheduledTask | null = null;

export const startOportunidadesDiariasCron = () => {
  if (cronTask) {
    cronTask.stop();
  }

  // Roda todos os dias às 18:00
  cronTask = cron.schedule("0 18 * * *", async () => {
    logInfo("[Cron] Iniciando notificação diária de oportunidades promovidas");
    try {
      const db = await getDb();

      // Busca vagas promovidas não notificadas
      const result = await db.all(
        `SELECT job_id 
         FROM curriculo_automacao_candidaturas 
         WHERE status = 'PENDING' 
           AND notificado_em IS NULL 
           AND score_categoria_aplicado IS NOT NULL`
      );

      const count = result.length;

      if (count > 0) {
        // Dispara notificação via Dispatcher
        await notificationDispatcher.dispatch("curriculo.opportunities_daily", {
          templateVars: { count },
          data: { action: "open_opportunities" }
        });

        // Marca como notificado
        const placeholders = result.map(() => "?").join(",");
        const ids = result.map(r => r.job_id);

        await db.run(
          `UPDATE curriculo_automacao_candidaturas 
           SET notificado_em = CURRENT_TIMESTAMP 
           WHERE job_id IN (${placeholders})`,
          ...ids
        );

        logInfo(`[Cron] Notificação diária enviada para ${count} novas oportunidades`);
      } else {
        logInfo("[Cron] Nenhuma oportunidade nova para notificar hoje");
      }
    } catch (err) {
      logError("[Cron] Falha ao executar notificação diária de oportunidades", err);
    }
  });

  logInfo("[Cron] Agendador de notificação diária de oportunidades iniciado (18:00)");
};

export const stopOportunidadesDiariasCron = () => {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    logInfo("[Cron] Agendador de notificação diária de oportunidades parado");
  }
};
