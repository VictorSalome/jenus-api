import cron, { type ScheduledTask } from "node-cron";
import { getDb } from "../../../core/database.js";
import { sendPushNotification } from "../../promo/push/push.service.js";
import * as logger from "../../../core/logger.js";
import { ensureMonthlyOccurrences } from "./debts.service.js";

let task: ScheduledTask | null = null;

const todayKey = (): string => new Date().toISOString().slice(0, 10);
const currentMonthKey = (): string => new Date().toISOString().slice(0, 7);

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export interface CheckRemindersResult {
  checkedDate: string;
  totalFound: number;
  notifiedCount: number;
  skippedAlreadyNotified: number;
}

/**
 * Verifica dívidas que vencem hoje ou daqui a 2 dias
 * e envia notificação push caso ainda haja saldo restante.
 */
export const checkAndNotifyDebtReminders = async (
  targetUserId?: string,
): Promise<CheckRemindersResult> => {
  const db = await getDb();
  const today = todayKey();
  const in2Days = addDays(today, 2);
  const currentMonth = currentMonthKey();

  // Garante que todos os usuários tenham as ocorrências do mês geradas
  const users = targetUserId
    ? [{ user_id: targetUserId }]
    : (await db.all<any[]>("SELECT DISTINCT user_id FROM fin_debts WHERE active = 1") || []);

  for (const u of users) {
    try {
      await ensureMonthlyOccurrences(u.user_id, currentMonth);
    } catch (e) {
      logger.warn(`Erro ao gerar ocorrências de dívidas para ${u.user_id}: ${e}`, "DebtsScheduler");
    }
  }

  const queryParams: any[] = [today, in2Days];
  let userFilter = "";
  if (targetUserId) {
    userFilter = "AND o.user_id = ?";
    queryParams.push(targetUserId);
  }

  const occurrences = await db.all<any[]>(
    `SELECT o.id, o.user_id, o.month, o.due_date, o.expected_amount_cents,
            o.paid_amount_cents, d.name as debt_name,
            MAX(0, o.expected_amount_cents - o.paid_amount_cents) as remaining_cents
       FROM fin_debt_occurrences o
       JOIN fin_debts d ON d.id = o.debt_id
      WHERE (o.due_date = ? OR o.due_date = ?)
        AND o.status IN ('PENDING', 'PARTIAL')
        ${userFilter}
      ORDER BY o.due_date ASC`,
    ...queryParams,
  );

  let notifiedCount = 0;
  let skippedCount = 0;

  for (const occ of occurrences) {
    if (occ.remaining_cents <= 0) continue;

    const isToday = occ.due_date === today;
    const title = isToday ? "Dívida vence HOJE!" : "Lembrete de Vencimento";
    const body = `${occ.debt_name}: ${formatCents(occ.remaining_cents)} pendente (Vencimento: ${occ.due_date}).`;

    // Evita duplicidade: verifica se já enviou push sobre essa ocorrência hoje
    const todayLog = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM notifications_log
        WHERE user_id = ?
          AND type_id = 'financas'
          AND date(sent_at) = date(?)
          AND payload_json LIKE ?`,
      occ.user_id,
      today,
      `%"occurrenceId":${occ.id}%`,
    );

    if (todayLog && todayLog.count > 0) {
      skippedCount++;
      continue;
    }

    try {
      await sendPushNotification({
        title,
        body,
        data: {
          screen: "debts",
          occurrenceId: occ.id,
          month: occ.month,
          amountCents: occ.remaining_cents,
        },
        priority: "high",
        userId: occ.user_id,
      });

      // Registra no histórico para controle de duplicidade e central de notificações
      try {
        await db.run(
          `INSERT INTO notifications_log (user_id, type_id, title, body, payload_json, sent_at)
           VALUES (?, 'financas', ?, ?, ?, CURRENT_TIMESTAMP)`,
          occ.user_id,
          title,
          body,
          JSON.stringify({ screen: "debts", occurrenceId: occ.id, amountCents: occ.remaining_cents }),
        );
      } catch {
        // notifications_log pode não estar presente em testes isolados
      }

      notifiedCount++;
      logger.info(`Push de lembrete enviado para ${occ.user_id} (${occ.debt_name})`, "DebtsScheduler");
    } catch (pushErr) {
      logger.warn(`Falha ao disparar push de dívida: ${pushErr}`, "DebtsScheduler");
    }
  }

  return {
    checkedDate: today,
    totalFound: occurrences.length,
    notifiedCount,
    skippedAlreadyNotified: skippedCount,
  };
};

/**
 * Inicia cron diário às 08:30
 */
export const startDebtsScheduler = (): void => {
  if (task) return;

  // Roda todos os dias às 08:30 (horário do servidor)
  task = cron.schedule("30 8 * * *", async () => {
    logger.info("Executando verificação diária de vencimentos de dívidas...", "DebtsScheduler");
    try {
      const res = await checkAndNotifyDebtReminders();
      logger.info(
        `Verificação concluída. Encontradas: ${res.totalFound}, Notificadas: ${res.notifiedCount}, Já enviadas hoje: ${res.skippedAlreadyNotified}`,
        "DebtsScheduler",
      );
    } catch (err) {
      logger.error(`Erro ao executar verificação de dívidas: ${err}`, "DebtsScheduler");
    }
  });

  logger.info("Scheduler de vencimento de dívidas ativo (diariamente às 08:30)", "DebtsScheduler");
};

export const stopDebtsScheduler = (): void => {
  if (task) {
    task.stop();
    task = null;
    logger.info("Scheduler de dívidas parado", "DebtsScheduler");
  }
};
