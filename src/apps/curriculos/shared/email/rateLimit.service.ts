import { Database } from "sqlite";
import sqlite3 from "sqlite3";
import { getDb } from "../../../../core/database.js";

/**
 * Retorna o total de envios (manual + automáticos) na janela móvel de 60 minutos
 * e o tempo necessário (em segundos) de espera até o primeiro slot expirar.
 */
export async function getRateLimitStatus(
  hourlyLimit: number,
  jobIdToExclude?: string
): Promise<{ total: number; waitSeconds: number }> {
  const db = await getDb();
  const query = `
    SELECT 
      (SELECT count(*) FROM curriculo_envios WHERE created_at >= datetime('now', '-60 minutes')) +
      (SELECT count(*) FROM curriculo_automacao_candidaturas WHERE status = 'PROCESSING' AND envio_id IS NULL AND updated_at >= datetime('now', '-10 minutes') AND job_id != ?) +
      (SELECT count(*) FROM curriculo_pending_applications WHERE status = 'approved' AND reviewed_at >= datetime('now', '-10 minutes'))
    AS total
  `;
  
  const contagem = await db.get<{ total: number }>(query, jobIdToExclude || '');
  const total = contagem?.total ?? 0;

  let waitSeconds = 0;
  if (total >= hourlyLimit) {
    const oldest = await db.get<{ created_at: string }>(
      `SELECT created_at FROM curriculo_envios 
       WHERE created_at >= datetime('now', '-60 minutes') 
       ORDER BY created_at ASC LIMIT 1`
    );

    if (oldest?.created_at) {
       const rawDate = oldest.created_at.includes("T") ? oldest.created_at : oldest.created_at.replace(" ", "T") + "Z";
       const oldestTime = new Date(rawDate).getTime();
       const now = Date.now();
       const expiresAt = oldestTime + 60 * 60 * 1000;
       waitSeconds = Math.max(5, Math.ceil((expiresAt - now) / 1000) + 2);
    } else {
       waitSeconds = 60 * 60; // default 1h fallback se for consumido apenas por pendings sem timestamp
    }
  }

  return { total, waitSeconds };
}
