import { getDb } from "../../../core/database.js";

export const listAccounts = async (userId: string) => {
  const db = await getDb();
  return db.all(
    "SELECT * FROM fin_accounts WHERE user_id = ? ORDER BY name COLLATE NOCASE",
    userId,
  );
};

/** Garante que o usuário tenha ao menos uma conta; retorna seu id. */
export const ensureDefaultAccount = async (userId: string): Promise<number> => {
  const db = await getDb();
  const existing = await db.get<{ id: number }>(
    "SELECT id FROM fin_accounts WHERE user_id = ? ORDER BY id LIMIT 1",
    userId,
  );
  if (existing) return existing.id;

  const result = await db.run(
    "INSERT INTO fin_accounts (user_id, name, type, currency) VALUES (?, 'Conta principal', 'checking', 'BRL')",
    userId,
  );
  return result.lastID;
};

export const getAccount = async (userId: string, id: number) => {
  const db = await getDb();
  return db.get("SELECT * FROM fin_accounts WHERE id = ? AND user_id = ?", id, userId);
};

export const createAccount = async (
  userId: string,
  data: {
    name: string;
    type?: string;
    bank?: string;
    balanceCents?: number;
    currency?: string;
  },
) => {
  const db = await getDb();
  const result = await db.run(
    `INSERT INTO fin_accounts (user_id, name, type, bank, balance_cents, currency)
     VALUES (?, ?, ?, ?, ?, ?)`,
    userId,
    data.name,
    data.type || "checking",
    data.bank || null,
    data.balanceCents ?? 0,
    data.currency || "BRL",
  );
  return getAccount(userId, result.lastID);
};

export const updateAccount = async (
  userId: string,
  id: number,
  data: { name?: string; type?: string; bank?: string; balanceCents?: number },
) => {
  const db = await getDb();
  const existing = await getAccount(userId, id);
  if (!existing) return null;

  await db.run(
    `UPDATE fin_accounts
        SET name = ?, type = ?, bank = ?, balance_cents = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?`,
    data.name ?? existing.name,
    data.type ?? existing.type,
    data.bank !== undefined ? data.bank : existing.bank,
    data.balanceCents !== undefined ? data.balanceCents : existing.balance_cents,
    id,
    userId,
  );
  return getAccount(userId, id);
};

export const deleteAccount = async (userId: string, id: number) => {
  const db = await getDb();
  await db.run("DELETE FROM fin_accounts WHERE id = ? AND user_id = ?", id, userId);
};