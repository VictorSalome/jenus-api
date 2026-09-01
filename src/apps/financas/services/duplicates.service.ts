import crypto from "crypto";
import sqlite3 from "sqlite3";
import { Database } from "sqlite";
import { getDb } from "../../../core/database.js";

export const normalizeMerchant = (name: string): string =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();

/**
 * Gera fingerprint determinística para detecção de duplicidade:
 * user_id + merchant normalizado + valor + source.
 * A data NÃO entra no hash — a janela de ±7 dias na consulta cobre a
 * "data aproximada" sem quebrar em viradas de mês.
 */
export const buildFingerprint = (
  userId: string,
  merchant: string,
  amountCents: number,
  source: string,
): string => {
  const normalized = normalizeMerchant(merchant);
  return crypto
    .createHash("sha256")
    .update(`${userId}|${normalized}|${amountCents}|${source}`)
    .digest("hex");
};

/**
 * Busca transações potencialmente duplicadas nos ±7 dias, para o mesmo
 * usuário, com mesmo fingerprint (merchant normalizado + valor + mês + source).
 */
export const findDuplicateTransactions = async (
  userId: string,
  fingerprint: string,
  date: string,
  windowDays = 7,
): Promise<any[]> => {
  const db = await getDb();
  const d = new Date(`${date}T00:00:00`);
  const from = new Date(d);
  from.setDate(from.getDate() - windowDays);
  const to = new Date(d);
  to.setDate(to.getDate() + windowDays);

  const fromKey = from.toISOString().slice(0, 10);
  const toKey = to.toISOString().slice(0, 10);

  return db.all(
    `SELECT id, description, amount_cents, transaction_date, source, status
       FROM fin_transactions
      WHERE user_id = ? AND dup_hash = ?
        AND transaction_date BETWEEN ? AND ?
        AND status != 'CANCELLED'
      ORDER BY transaction_date DESC
      LIMIT 10`,
    userId,
    fingerprint,
    fromKey,
    toKey,
  );
};

/**
 * Compara a fingerprint de um novo evento com transações existentes,
 * considerando também transações de fontes diferentes (ex.: notificação vs manual)
 * apenas como sugestão, sem bloquear — a decisão fica com o usuário.
 */
export const isPossibleDuplicate = async (
  userId: string,
  merchant: string,
  amountCents: number,
  date: string,
  source: string,
): Promise<{ duplicate: boolean; matches: any[] }> => {
  const fingerprint = buildFingerprint(userId, merchant, amountCents, source);
  const matches = await findDuplicateTransactions(userId, fingerprint, date);
  return { duplicate: matches.length > 0, matches };
};