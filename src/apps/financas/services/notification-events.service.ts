import { getDb } from "../../../core/database.js";
import { parseNotification } from "./parsers/registry.js";
import type { RawNotification } from "./parsers/types.js";
import { extractAmountCents, extractInstallments, extractMerchant, titleAndText } from "./parsers/utils.js";
import { buildFingerprint, findDuplicateTransactions } from "./duplicates.service.js";
import { createTransaction } from "./transactions.service.js";
import { ensureDefaultAccount } from "./accounts.service.js";
import { notificationDispatcher } from "../../../shared/notifications/index.js";

export interface CreateEventResult {
  event: any;
  parsed?: any;
  duplicate: boolean;
  matches: any[];
}

/**
 * Janela de deduplicação de eventos brutos: o Android pode disparar
 * onNotificationPosted mais de uma vez para a "mesma" notificação lógica
 * (atualização de conteúdo, reconexão do listener). Duas notificações
 * idênticas (mesmo pacote/título/texto) do mesmo usuário nesse intervalo
 * são tratadas como o mesmo evento.
 */
const NOTIFICATION_DEDUP_WINDOW_SECONDS = 15;

const findRecentDuplicateEvent = async (
  userId: string,
  packageName: string | undefined,
  title: string | undefined,
  text: string | undefined,
  postTime: number | undefined,
) => {
  const db = await getDb();

  // Match por post_time exato (sem janela de tempo): cobre o caso da fila
  // offline do Android reenviar, horas depois, um evento que na verdade já
  // tinha sido salvo com sucesso (ex.: a resposta HTTP se perdeu por rede
  // instável, mas o backend já tinha processado). O `postTime` vem do
  // `StatusBarNotification.postTime` original do Android — é estável entre
  // as tentativas de reenvio da mesma notificação real.
  if (postTime) {
    const exactMatch = await db.get(
      `SELECT * FROM fin_notification_events
        WHERE user_id = ? AND package_name IS ? AND post_time = ?
        ORDER BY id DESC
        LIMIT 1`,
      userId,
      packageName || null,
      postTime,
    );
    if (exactMatch) return exactMatch;
  }

  return db.get(
    `SELECT * FROM fin_notification_events
      WHERE user_id = ?
        AND package_name IS ?
        AND title IS ?
        AND text IS ?
        AND datetime(created_at) >= datetime('now', '-${NOTIFICATION_DEDUP_WINDOW_SECONDS} seconds')
      ORDER BY id DESC
      LIMIT 1`,
    userId,
    packageName || null,
    title || null,
    text || null,
  );
};

/**
 * Recebe o RAW enviado pelo Android, preserva raw_json e tenta processar:
 * 1. salva o evento (status=raw)
 * 2. roda o parser por app
 * 3. detecta duplicidade (não bloqueia — apenas sinaliza)
 * 4. se parseável e não duplicado → cria Transaction (source=NOTIFICATION)
 * O evento original nunca é excluído; apenas muda de status.
 */
export const processRawNotification = async (
  userId: string,
  raw: RawNotification,
): Promise<CreateEventResult> => {
  const db = await getDb();

  const pkg = (raw.packageName || '').toLowerCase();
  const label = (raw.appLabel || '').toLowerCase();
  const title = (raw.title || '').toLowerCase();

  // Defesa em profundidade: Bloqueia categoricamente auto-notificações do Jenus Hub
  // para impedir ciclos infinitos de auto-detecção ou duplicidade
  const isSelfNotification =
    pkg.includes('jenushub') ||
    pkg.includes('victorsalome') ||
    pkg.includes('jenus') ||
    label.includes('jenus') ||
    title.includes('transação detectada') ||
    title.includes('lembrete de vencimento') ||
    title.includes('dívida vence');

  if (isSelfNotification) {
    const res = await db.run(
      `INSERT INTO fin_notification_events (user_id, package_name, app_label, title, text, raw_json, status, post_time)
       VALUES (?, ?, ?, ?, ?, ?, 'ignored', ?)`,
      userId,
      raw.packageName || null,
      raw.appLabel || null,
      raw.title || null,
      raw.text || null,
      JSON.stringify(raw),
      raw.postTime || null,
    );
    const event = await db.get(
      "SELECT * FROM fin_notification_events WHERE id = ?",
      res.lastID,
    );
    return { event, duplicate: true, matches: [] };
  }

  // Deduplicação de ingestão: o Android pode reenviar a mesma notificação
  // lógica (update de conteúdo, reconexão do listener). Se já existe um
  // evento idêntico recente, devolve ele em vez de criar outro/reimportar.
  const recentDuplicate = await findRecentDuplicateEvent(
    userId,
    raw.packageName,
    raw.title,
    raw.text,
    raw.postTime,
  );
  if (recentDuplicate) {
    return { event: recentDuplicate, duplicate: true, matches: [] };
  }

  const result = await db.run(
    `INSERT INTO fin_notification_events (user_id, package_name, app_label, title, text, raw_json, status, post_time)
     VALUES (?, ?, ?, ?, ?, ?, 'raw', ?)`,
    userId,
    raw.packageName || null,
    raw.appLabel || null,
    raw.title || null,
    raw.text || null,
    JSON.stringify(raw),
    raw.postTime || null,
  );
  const eventId = result.lastID;

  const parsed = parseNotification(raw);
  if (!parsed) {
    await db.run(
      "UPDATE fin_notification_events SET status = 'error' WHERE id = ? AND user_id = ?",
      eventId,
      userId,
    );
    const event = await db.get(
      "SELECT * FROM fin_notification_events WHERE id = ?",
      eventId,
    );
    return { event, duplicate: false, matches: [] };
  }

  const merchant = parsed.data.merchantName || "desconhecido";
  const date = parsed.data.transactionDate || new Date().toISOString().slice(0, 10);
  const fingerprint = buildFingerprint(userId, merchant, parsed.data.amountCents, "NOTIFICATION");
  const matches = await findDuplicateTransactions(userId, fingerprint, date);

  const duplicate = matches.length > 0;
  const finalStatus = duplicate ? "duplicate" : "parsed";

  await db.run(
    `UPDATE fin_notification_events
        SET app_label = ?, parsed_json = ?, fingerprint = ?, status = ?
      WHERE id = ? AND user_id = ?`,
    parsed.parser.appLabel,
    JSON.stringify(parsed.data),
    fingerprint,
    finalStatus,
    eventId,
    userId,
  );

  // Disparo automático via NotificationDispatcher central
  const amountStr = (parsed.data.amountCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  void notificationDispatcher.dispatch('financas.transaction_detected', {
    userId,
    fingerprint,
    templateVars: {
      merchant,
      amount: amountStr,
    },
    data: {
      route: '/(financas)/detected',
      eventId,
      amountCents: parsed.data.amountCents,
      merchant,
    },
  });

  const event = await db.get("SELECT * FROM fin_notification_events WHERE id = ?", eventId);
  return { event, parsed: parsed.data, duplicate, matches };
};

export const listEvents = async (userId: string, status?: string) => {
  const db = await getDb();
  const where = ["user_id = ?"];
  const params: any[] = [userId];
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  return db.all(
    `SELECT * FROM fin_notification_events
      WHERE ${where.join(" AND ")}
      ORDER BY id DESC LIMIT 100`,
    ...params,
  );
};

export const getEvent = async (userId: string, id: number) => {
  const db = await getDb();
  return db.get("SELECT * FROM fin_notification_events WHERE id = ? AND user_id = ?", id, userId);
};

/** Importa manualmente um evento ignorado/duplicado como transação. */
export const importEvent = async (userId: string, id: number) => {
  const db = await getDb();
  const event = await getEvent(userId, id);
  if (!event) return null;

  if (event.status === "imported") {
    return null;
  }

  let parsed: any = null;
  try {
    parsed = event.parsed_json ? JSON.parse(event.parsed_json) : null;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    const attempt = parseNotification({
      packageName: event.package_name,
      appLabel: event.app_label,
      title: event.title,
      text: event.text,
    });
    if (attempt) parsed = attempt.data;
  }
  if (!parsed) {
    // Fallback genérico: na importação MANUAL o usuário já revisou e confirmou
    // o evento, então basta existir um valor "R$ x,xx" no texto — não precisa
    // de um parser específico de banco (diferente da detecção automática).
    const text = titleAndText({
      packageName: event.package_name,
      appLabel: event.app_label,
      title: event.title,
      text: event.text,
    });
    const amountCents = extractAmountCents(text);
    if (amountCents) {
      parsed = {
        amountCents,
        installmentsTotal: extractInstallments(text) ?? undefined,
        merchantName: extractMerchant(text) || event.app_label || event.title || undefined,
        description: text.slice(0, 120),
      };
    }
  }
  if (!parsed) return null;

  const date = parsed.transactionDate || new Date().toISOString().slice(0, 10);
  const accountId = await ensureDefaultAccount(userId);
  const created = await createTransaction(userId, {
    accountId,
    merchantName: parsed.merchantName,
    description: parsed.description,
    amountCents: parsed.amountCents,
    transactionDate: date,
    installmentsTotal: parsed.installmentsTotal ?? 1,
    source: "NOTIFICATION",
    notificationEventId: id,
  });

  await db.run(
    "UPDATE fin_notification_events SET status = 'imported' WHERE id = ? AND user_id = ?",
    id,
    userId,
  );
  return created;
};

/** Marca o evento como ignorado (não vira transação). */
export const ignoreEvent = async (userId: string, id: number) => {
  const db = await getDb();
  const event = await getEvent(userId, id);
  if (!event) return null;
  await db.run(
    "UPDATE fin_notification_events SET status = 'ignored' WHERE id = ? AND user_id = ?",
    id,
    userId,
  );
  return getEvent(userId, id);
};
