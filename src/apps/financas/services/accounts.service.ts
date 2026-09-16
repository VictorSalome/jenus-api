import { getDb } from "../../../core/database.js";

export const listAccounts = async (householdId: string) => {
  const db = await getDb();
  return db.all(
    `SELECT id, household_id, user_id, name, type, bank, balance_cents, currency, created_at, updated_at
       FROM fin_accounts WHERE household_id = ? OR user_id = ? ORDER BY name COLLATE NOCASE`,
    householdId,
    householdId,
  );
};

/** Garante que o household tenha ao menos uma conta; retorna seu id. */
export const ensureDefaultAccount = async (
  householdId: string,
  userId?: string,
): Promise<number> => {
  const db = await getDb();
  const existing = await db.get<{ id: number }>(
    "SELECT id FROM fin_accounts WHERE household_id = ? OR user_id = ? ORDER BY id LIMIT 1",
    householdId,
    householdId,
  );
  if (existing) return existing.id;

  const effectiveUser = userId || householdId;
  const result = await db.run(
    "INSERT INTO fin_accounts (household_id, user_id, name, type, currency) VALUES (?, ?, 'Conta principal', 'checking', 'BRL')",
    householdId,
    effectiveUser,
  );
  return result.lastID;
};

export const getAccount = async (householdId: string, id: number) => {
  const db = await getDb();
  return db.get(
    `SELECT id, household_id, user_id, name, type, bank, balance_cents, currency, created_at, updated_at
       FROM fin_accounts WHERE id = ? AND (household_id = ? OR user_id = ?)`,
    id,
    householdId,
    householdId,
  );
};

export const createAccount = async (
  householdId: string,
  data: {
    name: string;
    type?: string;
    bank?: string;
    balanceCents?: number;
    currency?: string;
  },
  userId?: string,
) => {
  const db = await getDb();
  const effectiveUser = userId || householdId;
  const result = await db.run(
    `INSERT INTO fin_accounts (household_id, user_id, name, type, bank, balance_cents, currency)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    householdId,
    effectiveUser,
    data.name,
    data.type || "checking",
    data.bank || null,
    data.balanceCents ?? 0,
    data.currency || "BRL",
  );
  return getAccount(householdId, result.lastID);
};

export const updateAccount = async (
  householdId: string,
  id: number,
  data: { name?: string; type?: string; bank?: string; balanceCents?: number },
) => {
  const db = await getDb();
  const existing = await getAccount(householdId, id);
  if (!existing) return null;

  await db.run(
    `UPDATE fin_accounts
        SET name = ?, type = ?, bank = ?, balance_cents = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND (household_id = ? OR user_id = ?)`,
    data.name ?? existing.name,
    data.type ?? existing.type,
    data.bank !== undefined ? data.bank : existing.bank,
    data.balanceCents !== undefined ? data.balanceCents : existing.balance_cents,
    id,
    householdId,
    householdId,
  );
  return getAccount(householdId, id);
};

export const deleteAccount = async (householdId: string, id: number) => {
  const db = await getDb();
  const res = await db.run(
    "DELETE FROM fin_accounts WHERE id = ? AND (household_id = ? OR user_id = ?)",
    id,
    householdId,
    householdId,
  );
  return (res?.changes ?? 0) > 0;
};
