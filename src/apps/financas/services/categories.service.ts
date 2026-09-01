import { getDb } from "../../../core/database.js";

const DEFAULT_CATEGORIES = [
  { name: "Alimentação", icon: "coffee", color: "#f59e0b", kind: "expense" },
  { name: "Transporte", icon: "truck", color: "#3b82f6", kind: "expense" },
  { name: "Moradia", icon: "home", color: "#8b5cf6", kind: "expense" },
  { name: "Compras", icon: "shopping-bag", color: "#ec4899", kind: "expense" },
  { name: "Serviços", icon: "zap", color: "#14b8a6", kind: "expense" },
  { name: "Saúde", icon: "heart", color: "#ef4444", kind: "expense" },
  { name: "Lazer", icon: "music", color: "#f97316", kind: "expense" },
  { name: "Educação", icon: "book", color: "#06b6d4", kind: "expense" },
  { name: "Salário", icon: "briefcase", color: "#22c55e", kind: "income" },
  { name: "Outros", icon: "tag", color: "#64748b", kind: "expense" },
];

export const ensureDefaultCategories = async (userId: string): Promise<void> => {
  const db = await getDb();
  const row = await db.get<{ count: number }>(
    "SELECT COUNT(*) as count FROM fin_categories WHERE user_id = ?",
    userId,
  );
  if (row && row.count > 0) return;

  const stmt = await db.prepare(
    "INSERT INTO fin_categories (user_id, name, icon, color, kind, is_default) VALUES (?, ?, ?, ?, ?, 1)",
  );
  for (const cat of DEFAULT_CATEGORIES) {
    await stmt.run(userId, cat.name, cat.icon, cat.color, cat.kind);
  }
  await stmt.finalize();
};

export const listCategories = async (userId: string) => {
  const db = await getDb();
  return db.all(
    "SELECT * FROM fin_categories WHERE user_id = ? ORDER BY kind, name COLLATE NOCASE",
    userId,
  );
};

export const getCategory = async (userId: string, id: number) => {
  const db = await getDb();
  return db.get("SELECT * FROM fin_categories WHERE id = ? AND user_id = ?", id, userId);
};

export const createCategory = async (
  userId: string,
  data: { name: string; icon?: string; color?: string; kind?: string },
) => {
  const db = await getDb();
  const result = await db.run(
    `INSERT INTO fin_categories (user_id, name, icon, color, kind)
     VALUES (?, ?, ?, ?, ?)`,
    userId,
    data.name,
    data.icon || "tag",
    data.color || "#64748b",
    data.kind || "expense",
  );
  return getCategory(userId, result.lastID);
};

export const updateCategory = async (
  userId: string,
  id: number,
  data: { name?: string; icon?: string; color?: string; kind?: string },
) => {
  const db = await getDb();
  const existing = await getCategory(userId, id);
  if (!existing) return null;

  await db.run(
    `UPDATE fin_categories
        SET name = ?, icon = ?, color = ?, kind = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?`,
    data.name ?? existing.name,
    data.icon ?? existing.icon,
    data.color ?? existing.color,
    data.kind ?? existing.kind,
    id,
    userId,
  );
  return getCategory(userId, id);
};

export const deleteCategory = async (userId: string, id: number) => {
  const db = await getDb();
  await db.run(
    "UPDATE fin_transactions SET category_id = NULL WHERE category_id = ? AND user_id = ?",
    id,
    userId,
  );
  await db.run(
    "UPDATE fin_merchants SET category_id = NULL WHERE category_id = ? AND user_id = ?",
    id,
    userId,
  );
  await db.run("DELETE FROM fin_categories WHERE id = ? AND user_id = ?", id, userId);
};