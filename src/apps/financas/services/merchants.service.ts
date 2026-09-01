import { getDb } from "../../../core/database.js";
import { normalizeMerchant } from "./duplicates.service.js";

export const listMerchants = async (userId: string) => {
  const db = await getDb();
  return db.all(
    "SELECT * FROM fin_merchants WHERE user_id = ? ORDER BY name COLLATE NOCASE",
    userId,
  );
};

export const getMerchant = async (userId: string, id: number) => {
  const db = await getDb();
  return db.get("SELECT * FROM fin_merchants WHERE id = ? AND user_id = ?", id, userId);
};

export const getMerchantByNormalized = async (userId: string, nameNormalized: string) => {
  const db = await getDb();
  return db.get("SELECT * FROM fin_merchants WHERE user_id = ? AND name_normalized = ?", userId, nameNormalized);
};

export const createMerchant = async (
  userId: string,
  data: { name: string; cnpj?: string; categoryId?: number },
) => {
  const db = await getDb();
  const nameNormalized = normalizeMerchant(data.name);

  const existing = await getMerchantByNormalized(userId, nameNormalized);
  if (existing) return existing;

  // INSERT OR IGNORE: se duas requests simultâneas criarem o mesmo merchant,
  // a segunda cai no UNIQUE (user_id, name_normalized) e re-consulta em vez de 500.
  await db.run(
    `INSERT OR IGNORE INTO fin_merchants (user_id, name, name_normalized, cnpj, category_id)
     VALUES (?, ?, ?, ?, ?)`,
    userId,
    data.name,
    nameNormalized,
    data.cnpj || null,
    data.categoryId || null,
  );
  return getMerchantByNormalized(userId, nameNormalized);
};

export const updateMerchant = async (
  userId: string,
  id: number,
  data: { name?: string; cnpj?: string; categoryId?: number | null },
) => {
  const db = await getDb();
  const existing = await getMerchant(userId, id);
  if (!existing) return null;

  const name = data.name ?? existing.name;
  const nameNormalized = normalizeMerchant(name);

  await db.run(
    `UPDATE fin_merchants
        SET name = ?, name_normalized = ?, cnpj = ?, category_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?`,
    name,
    nameNormalized,
    data.cnpj !== undefined ? data.cnpj : existing.cnpj,
    data.categoryId !== undefined ? data.categoryId : existing.category_id,
    id,
    userId,
  );
  return getMerchant(userId, id);
};

export const deleteMerchant = async (userId: string, id: number) => {
  const db = await getDb();
  await db.run(
    "UPDATE fin_transactions SET merchant_id = NULL WHERE merchant_id = ? AND user_id = ?",
    id,
    userId,
  );
  await db.run("DELETE FROM fin_merchants WHERE id = ? AND user_id = ?", id, userId);
};