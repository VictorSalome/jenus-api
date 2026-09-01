import sqlite3 from "sqlite3";
import { Database } from "sqlite";
import { getDb } from "../../../core/database.js";
import { splitInstallments } from "./money.js";
import { buildFingerprint, normalizeMerchant } from "./duplicates.service.js";
import { getMerchantByNormalized, createMerchant } from "./merchants.service.js";
import { AppError } from "../shared/errors.js";

export type TransactionSource = "MANUAL" | "NOTIFICATION" | "IMPORT" | "OPEN_FINANCE";
export type TransactionStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
export type TransactionType = "debit" | "credit" | "transfer";

export interface CreateTransactionInput {
  accountId: number;
  cardId?: number;
  merchantId?: number;
  merchantName?: string;
  categoryId?: number;
  description?: string;
  amountCents: number;
  type?: TransactionType;
  transactionDate: string;
  installmentsTotal?: number;
  source?: TransactionSource;
  notificationEventId?: number;
}

/**
 * Soma meses mantendo o dia, com clamp ao último dia do mês alvo.
 * Ex.: 2026-01-31 + 1 mês → 2026-02-28 (e não 2026-03-03).
 */
const addMonths = (date: string, months: number): string => {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const todayKey = (): string => new Date().toISOString().slice(0, 10);

export const listTransactions = async (
  userId: string,
  filters: {
    month?: string; // YYYY-MM
    from?: string;
    to?: string;
    categoryId?: number;
    cardId?: number;
    accountId?: number;
    status?: string;
    type?: string;
  },
) => {
  const db = await getDb();
  const where: string[] = ["t.user_id = ?"];
  const params: any[] = [userId];

  if (filters.month) {
    where.push("substr(t.transaction_date, 1, 7) = ?");
    params.push(filters.month);
  }
  if (filters.from) {
    where.push("t.transaction_date >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("t.transaction_date <= ?");
    params.push(filters.to);
  }
  if (filters.categoryId) {
    where.push("t.category_id = ?");
    params.push(filters.categoryId);
  }
  if (filters.cardId) {
    where.push("t.card_id = ?");
    params.push(filters.cardId);
  }
  if (filters.accountId) {
    where.push("t.account_id = ?");
    params.push(filters.accountId);
  }
  if (filters.status) {
    where.push("t.status = ?");
    params.push(filters.status);
  }
  if (filters.type) {
    where.push("t.type = ?");
    params.push(filters.type);
  }

  return db.all(
    `SELECT t.*,
            COALESCE(c.name, '') as category_name,
            COALESCE(c.icon, '') as category_icon,
            COALESCE(c.color, '') as category_color,
            COALESCE(m.name, '') as merchant_name,
            COALESCE(ac.name, '') as account_name,
            COALESCE(cd.name, '') as card_name
       FROM fin_transactions t
       LEFT JOIN fin_categories c ON c.id = t.category_id
       LEFT JOIN fin_merchants m ON m.id = t.merchant_id
       LEFT JOIN fin_accounts ac ON ac.id = t.account_id
       LEFT JOIN fin_cards cd ON cd.id = t.card_id
      WHERE ${where.join(" AND ")}
      ORDER BY t.transaction_date DESC, t.id DESC`,
    ...params,
  );
};

/**
 * Cria a transação principal. Se parcelada, cria também o plano e as
 * parcelas — tudo em uma única transação do banco (BEGIN/COMMIT/ROLLBACK).
 */
export const createTransaction = async (
  userId: string,
  input: CreateTransactionInput,
) => {
  const db = await getDb();

  // Valida entrada básica.
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new AppError("Valor inválido", 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.transactionDate)) {
    throw new AppError("Data inválida (use YYYY-MM-DD)", 400);
  }
  const installmentsTotal = input.installmentsTotal ?? 1;
  if (!Number.isInteger(installmentsTotal) || installmentsTotal < 1 || installmentsTotal > 60) {
    throw new AppError("Número de parcelas inválido (1-60)", 400);
  }

  // Valida ownership: conta/cartão/categoria devem pertencer ao usuário.
  const account = await db.get(
    "SELECT id FROM fin_accounts WHERE id = ? AND user_id = ?",
    input.accountId,
    userId,
  );
  if (!account) throw new AppError("Conta não encontrada", 404);

  if (input.cardId) {
    const card = await db.get(
      "SELECT id FROM fin_cards WHERE id = ? AND user_id = ?",
      input.cardId,
      userId,
    );
    if (!card) throw new AppError("Cartão não encontrado", 404);
  }
  if (input.categoryId) {
    const cat = await db.get(
      "SELECT id FROM fin_categories WHERE id = ? AND user_id = ?",
      input.categoryId,
      userId,
    );
    if (!cat) throw new AppError("Categoria não encontrada", 404);
  }

  // Resolve o merchant (cria se não existir) fora da transação para não
  // segurar locks do BEGIN desnecessariamente.
  let merchantId = input.merchantId;
  if (input.merchantName) {
    const nameNormalized = normalizeMerchant(input.merchantName);
    const existing = await getMerchantByNormalized(userId, nameNormalized);
    if (existing) {
      merchantId = existing.id;
    } else {
      const merchant = await createMerchant(userId, { name: input.merchantName });
      merchantId = merchant.id;
    }
  }

  const amounts = splitInstallments(input.amountCents, installmentsTotal);
  const fingerprint = buildFingerprint(
    userId,
    input.merchantName || input.description || "desconhecido",
    input.amountCents,
    input.source || "MANUAL",
  );

  let transactionId: number;
  let planId: number | null = null;

  await db.run("BEGIN");
  try {
    const txResult = await db.run(
      `INSERT INTO fin_transactions (
        user_id, account_id, card_id, merchant_id, category_id, description,
        amount_cents, type, transaction_date, installments_total, installment_number,
        due_date, status, source, notification_event_id, dup_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      input.accountId,
      input.cardId || null,
      merchantId || null,
      input.categoryId || null,
      input.description || null,
      input.amountCents,
      input.type || "debit",
      input.transactionDate,
      installmentsTotal,
      1,
      input.transactionDate,
      "PENDING",
      input.source || "MANUAL",
      input.notificationEventId || null,
      fingerprint,
    );
    transactionId = txResult.lastID;

    if (installmentsTotal > 1) {
      const planResult = await db.run(
        `INSERT INTO fin_installment_plans (
          user_id, transaction_id, total_installments, installment_amount_cents, start_month
        ) VALUES (?, ?, ?, ?, ?)`,
        userId,
        transactionId,
        installmentsTotal,
        amounts[0],
        input.transactionDate.slice(0, 7),
      );
      planId = planResult.lastID;

      for (let i = 0; i < installmentsTotal; i++) {
        const number = i + 1;
        const dueDate = i === 0 ? input.transactionDate : addMonths(input.transactionDate, i);
        await db.run(
          `INSERT INTO fin_installments (
            user_id, plan_id, transaction_id, number, amount_cents, due_date, status
          ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
          userId,
          planId,
          transactionId,
          number,
          amounts[i],
          dueDate,
        );
      }
    }

    await db.run("COMMIT");
  } catch (err) {
    await db.run("ROLLBACK");
    throw err;
  }

  const transaction = await db.get(
    `SELECT * FROM fin_transactions WHERE id = ? AND user_id = ?`,
    transactionId,
    userId,
  );

  let plan: any = null;
  let installments: any[] = [];
  if (planId) {
    plan = await db.get(
      "SELECT * FROM fin_installment_plans WHERE id = ? AND user_id = ?",
      planId,
      userId,
    );
    installments = await db.all(
      "SELECT * FROM fin_installments WHERE plan_id = ? AND user_id = ? ORDER BY number",
      planId,
      userId,
    );
  }

  return { transaction, plan, installments };
};

export const getTransaction = async (userId: string, id: number) => {
  const db = await getDb();
  return db.get(
    "SELECT * FROM fin_transactions WHERE id = ? AND user_id = ?",
    id,
    userId,
  );
};

export const updateTransaction = async (
  userId: string,
  id: number,
  data: {
    description?: string;
    categoryId?: number | null;
    merchantId?: number | null;
    accountId?: number;
  },
) => {
  const db = await getDb();
  const existing = await getTransaction(userId, id);
  if (!existing) return null;

  await db.run(
    `UPDATE fin_transactions
        SET description = ?, category_id = ?, merchant_id = ?, account_id = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?`,
    data.description !== undefined ? data.description : existing.description,
    data.categoryId !== undefined ? data.categoryId : existing.category_id,
    data.merchantId !== undefined ? data.merchantId : existing.merchant_id,
    data.accountId ?? existing.account_id,
    id,
    userId,
  );
  return getTransaction(userId, id);
};

export const deleteTransaction = async (userId: string, id: number) => {
  const db = await getDb();
  const result = await db.run(
    "DELETE FROM fin_transactions WHERE id = ? AND user_id = ?",
    id,
    userId,
  );
  return result.changes > 0;
};