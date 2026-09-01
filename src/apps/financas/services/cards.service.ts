import { getDb } from "../../../core/database.js";

export const listCards = async (userId: string) => {
  const db = await getDb();
  return db.all(
    "SELECT * FROM fin_cards WHERE user_id = ? ORDER BY name COLLATE NOCASE",
    userId,
  );
};

export const getCard = async (userId: string, id: number) => {
  const db = await getDb();
  return db.get("SELECT * FROM fin_cards WHERE id = ? AND user_id = ?", id, userId);
};

export const createCard = async (
  userId: string,
  data: {
    accountId: number;
    name: string;
    last4?: string;
    brand?: string;
    closingDay?: number;
    dueDay?: number;
    creditLimitCents?: number;
  },
) => {
  const db = await getDb();
  const result = await db.run(
    `INSERT INTO fin_cards (user_id, account_id, name, last4, brand, closing_day, due_day, credit_limit_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    data.accountId,
    data.name,
    data.last4 || null,
    data.brand || null,
    data.closingDay ?? 1,
    data.dueDay ?? 10,
    data.creditLimitCents ?? 0,
  );
  return getCard(userId, result.lastID);
};

export const updateCard = async (
  userId: string,
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
  const existing = await getCard(userId, id);
  if (!existing) return null;

  await db.run(
    `UPDATE fin_cards
        SET name = ?, last4 = ?, brand = ?, closing_day = ?, due_day = ?,
            credit_limit_cents = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?`,
    data.name ?? existing.name,
    data.last4 !== undefined ? data.last4 : existing.last4,
    data.brand !== undefined ? data.brand : existing.brand,
    data.closingDay ?? existing.closing_day,
    data.dueDay ?? existing.due_day,
    data.creditLimitCents ?? existing.credit_limit_cents,
    id,
    userId,
  );
  return getCard(userId, id);
};

export const deleteCard = async (userId: string, id: number) => {
  const db = await getDb();
  await db.run("DELETE FROM fin_cards WHERE id = ? AND user_id = ?", id, userId);
};