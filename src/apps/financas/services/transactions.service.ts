import sqlite3 from "sqlite3";
import { Database } from "sqlite";
import { getDb, runTransaction } from "../../../core/database.js";
import { splitInstallments } from "./money.js";
import { buildFingerprint, normalizeMerchant } from "./duplicates.service.js";
import { getMerchantByNormalized, createMerchant } from "./merchants.service.js";
import { AppError } from "../shared/errors.js";
import { guessCategoryForTransaction } from "./categories.service.js";
import * as logger from "../../../core/logger.js";

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
  status?: TransactionStatus;
  dueDate?: string;
  paidDate?: string;
}

export interface TransactionFilters {
  userId?: string;
  month?: string; // YYYY-MM
  from?: string;
  to?: string;
  categoryId?: number;
  cardId?: number;
  accountId?: number;
  status?: string;
  type?: string;
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
  householdId: string,
  filters: TransactionFilters = {},
) => {
  const db = await getDb();
  const where: string[] = ["t.household_id = ?"];
  const params: any[] = [householdId];

  if (filters.userId) {
    where.push("t.user_id = ?");
    params.push(filters.userId);
  }
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
    `SELECT t.id, t.household_id, t.user_id, t.account_id, t.card_id, t.merchant_id, t.category_id,
            t.description, t.amount_cents, t.type, t.transaction_date, t.installments_total,
            t.installment_number, t.due_date, t.paid_date, t.status, t.source,
            t.notification_event_id, t.dup_hash, t.created_at, t.updated_at,
            COALESCE(u.name, '') as user_name,
            COALESCE(c.name, '') as category_name,
            COALESCE(c.icon, '') as category_icon,
            COALESCE(c.color, '') as category_color,
            COALESCE(m.name, '') as merchant_name,
            COALESCE(ac.name, '') as account_name,
            COALESCE(cd.name, '') as card_name
       FROM fin_transactions t
       LEFT JOIN users u ON u.id = t.user_id
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
export async function createTransaction(
  householdId: string,
  userId: string,
  input: CreateTransactionInput,
): Promise<{ transaction: any; plan: any; installments: any[] }>;
export async function createTransaction(
  userId: string,
  input: CreateTransactionInput,
): Promise<{ transaction: any; plan: any; installments: any[] }>;
export async function createTransaction(
  arg1: string,
  arg2: any,
  arg3?: any,
): Promise<{ transaction: any; plan: any; installments: any[] }> {
  let householdId: string;
  let userId: string;
  let input: CreateTransactionInput;

  const db = await getDb();

  if (typeof arg2 === "string" && arg3) {
    householdId = arg1;
    userId = arg2;
    input = arg3;
  } else {
    userId = arg1;
    input = arg2;
    const member = await db.get<{ household_id: string }>(
      "SELECT household_id FROM financial_household_members WHERE user_id = ? LIMIT 1",
      userId,
    );
    householdId = member?.household_id || userId;
  }

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

  // Valida ownership: conta/cartão/categoria devem pertencer ao household.
  const account = await db.get(
    "SELECT id FROM fin_accounts WHERE id = ? AND (household_id = ? OR user_id = ?)",
    input.accountId,
    householdId,
    userId,
  );
  if (!account) throw new AppError("Conta não encontrada", 404);

  if (input.cardId) {
    const card = await db.get(
      "SELECT id FROM fin_cards WHERE id = ? AND (household_id = ? OR user_id = ?)",
      input.cardId,
      householdId,
      userId,
    );
    if (!card) throw new AppError("Cartão não encontrado", 404);
  }
  if (input.categoryId) {
    const cat = await db.get(
      "SELECT id FROM fin_categories WHERE id = ? AND (household_id = ? OR user_id = ?)",
      input.categoryId,
      householdId,
      userId,
    );
    if (!cat) throw new AppError("Categoria não encontrada", 404);
  }

  // Resolve o merchant (cria se não existir) fora da transação para não
  // segurar locks do BEGIN desnecessariamente.
  let merchantId = input.merchantId;
  let resolvedCategoryId = input.categoryId;

  if (input.merchantName) {
    const nameNormalized = normalizeMerchant(input.merchantName);
    const existing = await getMerchantByNormalized(householdId, nameNormalized);
    if (existing) {
      merchantId = existing.id;
      if (!resolvedCategoryId && existing.category_id) {
        resolvedCategoryId = existing.category_id;
      }
    } else {
      const merchant = await createMerchant(householdId, { name: input.merchantName }, userId);
      merchantId = merchant.id;
    }
  }

  // Se categoria ainda vazia, auto-detecta por palavras-chave (Posto, Mercado, iFood, etc.)
  if (!resolvedCategoryId) {
    const guessedId = await guessCategoryForTransaction(
      householdId,
      input.merchantName,
      input.description,
    );
    if (guessedId) resolvedCategoryId = guessedId;
  }

  const amounts = splitInstallments(input.amountCents, installmentsTotal);
  const fingerprint = buildFingerprint(
    userId,
    input.merchantName || input.description || "desconhecido",
    input.amountCents,
    input.source || "MANUAL",
  );

  const status = input.status || "PENDING";
  const dueDate = input.dueDate || input.transactionDate;
  const paidDate = status === "PAID" ? (input.paidDate || input.transactionDate) : null;

  const { transactionId, planId } = await runTransaction(async (database) => {
    const txResult = await database.run(
      `INSERT INTO fin_transactions (
        household_id, user_id, account_id, card_id, merchant_id, category_id, description,
        amount_cents, type, transaction_date, installments_total, installment_number,
        due_date, paid_date, status, source, notification_event_id, dup_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      householdId,
      userId,
      input.accountId,
      input.cardId || null,
      merchantId || null,
      resolvedCategoryId || null,
      input.description || null,
      input.amountCents,
      input.type || "debit",
      input.transactionDate,
      installmentsTotal,
      1,
      dueDate,
      paidDate,
      status,
      input.source || "MANUAL",
      input.notificationEventId || null,
      fingerprint,
    );
    const txId = txResult.lastID;
    let pId: number | null = null;

    if (installmentsTotal > 1) {
      const planResult = await database.run(
        `INSERT INTO fin_installment_plans (
          household_id, user_id, transaction_id, total_installments, installment_amount_cents, start_month
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        householdId,
        userId,
        txId,
        installmentsTotal,
        amounts[0],
        input.transactionDate.slice(0, 7),
      );
      pId = planResult.lastID;

      for (let i = 0; i < installmentsTotal; i++) {
        const number = i + 1;
        const instDueDate = i === 0 ? input.transactionDate : addMonths(input.transactionDate, i);
        await database.run(
          `INSERT INTO fin_installments (
            household_id, user_id, plan_id, transaction_id, number, amount_cents, due_date, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
          householdId,
          userId,
          pId,
          txId,
          number,
          amounts[i],
          instDueDate,
        );
      }
    }

    return { transactionId: txId, planId: pId };
  });

  const transaction = await db.get(
    `SELECT id, household_id, user_id, account_id, card_id, merchant_id, category_id,
            description, amount_cents, type, transaction_date, installments_total,
            installment_number, due_date, paid_date, status, source,
            notification_event_id, dup_hash, created_at, updated_at
       FROM fin_transactions WHERE id = ? AND household_id = ?`,
    transactionId,
    householdId,
  );

  let plan: any = null;
  let installments: any[] = [];
  if (planId) {
    plan = await db.get(
      `SELECT id, household_id, user_id, transaction_id, total_installments,
              installment_amount_cents, start_month, status, created_at, updated_at
         FROM fin_installment_plans WHERE id = ? AND household_id = ?`,
      planId,
      householdId,
    );
    installments = await db.all(
      `SELECT id, household_id, user_id, plan_id, transaction_id, number,
              amount_cents, due_date, status, paid_date, created_at, updated_at
         FROM fin_installments WHERE plan_id = ? AND household_id = ? ORDER BY number`,
      planId,
      householdId,
    );
  }

  return { transaction, plan, installments };
}

export const getTransaction = async (householdId: string, id: number) => {
  const db = await getDb();
  return db.get(
    `SELECT id, household_id, user_id, account_id, card_id, merchant_id, category_id,
            description, amount_cents, type, transaction_date, installments_total,
            installment_number, due_date, paid_date, status, source,
            notification_event_id, dup_hash, created_at, updated_at
       FROM fin_transactions WHERE id = ? AND household_id = ?`,
    id,
    householdId,
  );
};

export const updateTransaction = async (
  householdId: string,
  id: number,
  data: {
    description?: string;
    categoryId?: number | null;
    merchantId?: number | null;
    accountId?: number;
  },
) => {
  const db = await getDb();
  const existing = await getTransaction(householdId, id);
  if (!existing) return null;

  // Valida ownership dos registros referenciados: pertencem ao household.
  if (data.accountId !== undefined) {
    const account = await db.get(
      "SELECT id FROM fin_accounts WHERE id = ? AND (household_id = ? OR user_id = ?)",
      data.accountId,
      householdId,
      existing.user_id,
    );
    if (!account) throw new AppError("Conta não encontrada", 400);
  }
  if (data.categoryId !== undefined && data.categoryId !== null) {
    const category = await db.get(
      "SELECT id FROM fin_categories WHERE id = ? AND (household_id = ? OR user_id = ?)",
      data.categoryId,
      householdId,
      existing.user_id,
    );
    if (!category) throw new AppError("Categoria não encontrada", 400);
  }
  if (data.merchantId !== undefined && data.merchantId !== null) {
    const merchant = await db.get(
      "SELECT id FROM fin_merchants WHERE id = ? AND (household_id = ? OR user_id = ?)",
      data.merchantId,
      householdId,
      existing.user_id,
    );
    if (!merchant) throw new AppError("Estabelecimento não encontrado", 400);
  }

  await db.run(
    `UPDATE fin_transactions
        SET description = ?, category_id = ?, merchant_id = ?, account_id = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND household_id = ?`,
    data.description !== undefined ? data.description : existing.description,
    data.categoryId !== undefined ? data.categoryId : existing.category_id,
    data.merchantId !== undefined ? data.merchantId : existing.merchant_id,
    data.accountId ?? existing.account_id,
    id,
    householdId,
  );
  return getTransaction(householdId, id);
};

export const deleteTransaction = async (householdId: string, id: number) => {
  const db = await getDb();
  const result = await db.run(
    "DELETE FROM fin_transactions WHERE id = ? AND household_id = ?",
    id,
    householdId,
  );
  return result.changes > 0;
};
