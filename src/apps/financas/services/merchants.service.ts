import { getDb } from "../../../core/database.js";
import { normalizeMerchant } from "./duplicates.service.js";

export const listMerchants = async (householdId: string) => {
  const db = await getDb();
  return db.all(
    `SELECT id, household_id, user_id, name, name_normalized, cnpj, category_id,
            created_at, updated_at
       FROM fin_merchants WHERE household_id = ? OR user_id = ? ORDER BY name COLLATE NOCASE`,
    householdId,
    householdId,
  );
};

export const getMerchant = async (householdId: string, id: number) => {
  const db = await getDb();
  return db.get(
    `SELECT id, household_id, user_id, name, name_normalized, cnpj, category_id,
            created_at, updated_at
       FROM fin_merchants WHERE id = ? AND (household_id = ? OR user_id = ?)`,
    id,
    householdId,
    householdId,
  );
};

export const getMerchantByNormalized = async (householdId: string, nameNormalized: string) => {
  const db = await getDb();
  return db.get(
    `SELECT id, household_id, user_id, name, name_normalized, cnpj, category_id,
            created_at, updated_at
       FROM fin_merchants WHERE (household_id = ? OR user_id = ?) AND name_normalized = ?`,
    householdId,
    householdId,
    nameNormalized,
  );
};

export const createMerchant = async (
  householdId: string,
  data: { name: string; cnpj?: string; categoryId?: number },
  userId?: string,
) => {
  const db = await getDb();
  const nameNormalized = normalizeMerchant(data.name);

  const existing = await getMerchantByNormalized(householdId, nameNormalized);
  if (existing) return existing;

  const effectiveUser = userId || householdId;
  // INSERT OR IGNORE: se duas requests simultâneas criarem o mesmo merchant,
  // a segunda cai no UNIQUE e re-consulta em vez de 500.
  await db.run(
    `INSERT OR IGNORE INTO fin_merchants (household_id, user_id, name, name_normalized, cnpj, category_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    householdId,
    effectiveUser,
    data.name,
    nameNormalized,
    data.cnpj || null,
    data.categoryId || null,
  );
  return getMerchantByNormalized(householdId, nameNormalized);
};

export const updateMerchant = async (
  householdId: string,
  id: number,
  data: { name?: string; cnpj?: string; categoryId?: number | null },
) => {
  const db = await getDb();
  const existing = await getMerchant(householdId, id);
  if (!existing) return null;

  const name = data.name ?? existing.name;
  const nameNormalized = normalizeMerchant(name);

  await db.run(
    `UPDATE fin_merchants
        SET name = ?, name_normalized = ?, cnpj = ?, category_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND (household_id = ? OR user_id = ?)`,
    name,
    nameNormalized,
    data.cnpj !== undefined ? data.cnpj : existing.cnpj,
    data.categoryId !== undefined ? data.categoryId : existing.category_id,
    id,
    householdId,
    householdId,
  );
  return getMerchant(householdId, id);
};

export const deleteMerchant = async (householdId: string, id: number) => {
  const db = await getDb();
  await db.run(
    "UPDATE fin_transactions SET merchant_id = NULL WHERE merchant_id = ? AND (household_id = ? OR user_id = ?)",
    id,
    householdId,
    householdId,
  );
  await db.run(
    "DELETE FROM fin_merchants WHERE id = ? AND (household_id = ? OR user_id = ?)",
    id,
    householdId,
    householdId,
  );
};
