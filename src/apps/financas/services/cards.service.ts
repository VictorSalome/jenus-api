import { getDb } from "../../../core/database.js";
import { AppError } from "../shared/errors.js";

export const listCards = async (householdId: string) => {
  const db = await getDb();
  return db.all(
    `SELECT id, household_id, user_id, account_id, name, last4, brand, closing_day,
            due_day, credit_limit_cents, created_at, updated_at
       FROM fin_cards WHERE household_id = ? OR user_id = ? ORDER BY name COLLATE NOCASE`,
    householdId,
    householdId,
  );
};

export const getCard = async (householdId: string, id: number) => {
  const db = await getDb();
  return db.get(
    `SELECT id, household_id, user_id, account_id, name, last4, brand, closing_day,
            due_day, credit_limit_cents, created_at, updated_at
       FROM fin_cards WHERE id = ? AND (household_id = ? OR user_id = ?)`,
    id,
    householdId,
    householdId,
  );
};

export const createCard = async (
  householdId: string,
  data: {
    accountId: number;
    name: string;
    last4?: string;
    brand?: string;
    closingDay?: number;
    dueDay?: number;
    creditLimitCents?: number;
  },
  userId?: string,
) => {
  const db = await getDb();
  const account = await db.get(
    "SELECT id FROM fin_accounts WHERE id = ? AND (household_id = ? OR user_id = ?)",
    data.accountId,
    householdId,
    householdId,
  );
  if (!account) throw new AppError("Conta não encontrada", 404);

  const effectiveUser = userId || householdId;
  const result = await db.run(
    `INSERT INTO fin_cards (household_id, user_id, account_id, name, last4, brand, closing_day, due_day, credit_limit_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    householdId,
    effectiveUser,
    data.accountId,
    data.name,
    data.last4 || null,
    data.brand || null,
    data.closingDay ?? 1,
    data.dueDay ?? 10,
    data.creditLimitCents ?? 0,
  );
  return getCard(householdId, result.lastID);
};

export const updateCard = async (
  householdId: string,
  id: number,
  data: {
    name?: string;
    last4?: string;
    brand?: string;
    closingDay?: number;
    dueDay?: number;
    creditLimitCents?: number;
  },
) => {
  const db = await getDb();
  const existing = await getCard(householdId, id);
  if (!existing) return null;

  await db.run(
    `UPDATE fin_cards
        SET name = ?, last4 = ?, brand = ?, closing_day = ?, due_day = ?,
            credit_limit_cents = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND (household_id = ? OR user_id = ?)`,
    data.name ?? existing.name,
    data.last4 !== undefined ? data.last4 : existing.last4,
    data.brand !== undefined ? data.brand : existing.brand,
    data.closingDay ?? existing.closing_day,
    data.dueDay ?? existing.due_day,
    data.creditLimitCents ?? existing.credit_limit_cents,
    id,
    householdId,
    householdId,
  );
  return getCard(householdId, id);
};

export const deleteCard = async (householdId: string, id: number) => {
  const db = await getDb();
  const res = await db.run(
    "DELETE FROM fin_cards WHERE id = ? AND (household_id = ? OR user_id = ?)",
    id,
    householdId,
    householdId,
  );
  return (res?.changes ?? 0) > 0;
};
