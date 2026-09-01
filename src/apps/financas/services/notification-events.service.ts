import { getDb } from "../../../core/database.js";
import { parseNotification } from "./parsers/registry.js";
import type { RawNotification } from "./parsers/types.js";
import { buildFingerprint, findDuplicateTransactions } from "./duplicates.service.js";
import { createTransaction } from "./transactions.service.js";
import { ensureDefaultAccount } from "./accounts.service.js";

export interface CreateEventResult {
  event: any;
  parsed?: any;
  duplicate: boolean;
  matches: any[];
}

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

  const result = await db.run(
    `INSERT INTO fin_notification_events (user_id, package_name, app_label, title, text, raw_json, status)
     VALUES (?, ?, ?, ?, ?, ?, 'raw')`,
    userId,
    raw.packageName || null,
    raw.appLabel || null,
    raw.title || null,
    raw.text || null,
    JSON.stringify(raw),
  );
  const eventId = result.lastID;

  const parsed = parseNotification(raw);
  if (!parsed) {
    await db.run(
      "UPDATE fin_notification_events SET status = 'ignored' WHERE id = ?",
      eventId,
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

  await db.run(
    `UPDATE fin_notification_events
        SET app_label = ?, parsed_json = ?, fingerprint = ?, status = ?
      WHERE id = ?`,
    parsed.parser.appLabel,
    JSON.stringify(parsed.data),
    fingerprint,
    duplicate ? "duplicate" : "parsed",
    eventId,
  );

  let parsedTransaction: any = null;
  if (!duplicate) {
    const accountId = await ensureDefaultAccount(userId);
    parsedTransaction = await createTransaction(userId, {
      accountId,
      merchantName: parsed.data.merchantName,
      description: parsed.data.description,
      amountCents: parsed.data.amountCents,
      transactionDate: date,
      installmentsTotal: parsed.data.installmentsTotal ?? 1,
      source: "NOTIFICATION",
      notificationEventId: eventId,
    });
  }

  const event = await db.get("SELECT * FROM fin_notification_events WHERE id = ?", eventId);
  return { event, parsed: parsedTransaction, duplicate, matches };
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

  await db.run("UPDATE fin_notification_events SET status = 'imported' WHERE id = ?", id);
  return created;
};

/** Marca o evento como ignorado (não vira transação). */
export const ignoreEvent = async (userId: string, id: number) => {
  const db = await getDb();
  const event = await getEvent(userId, id);
  if (!event) return null;
  await db.run("UPDATE fin_notification_events SET status = 'ignored' WHERE id = ?", id);
  return db.get("SELECT * FROM fin_notification_events WHERE id = ?", id);
};
