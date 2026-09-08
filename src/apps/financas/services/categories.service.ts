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

/**
 * Tenta inferir a categoria apropriada para o estabelecimento ou texto da transação:
 * 1. Pelo merchant cadastrado no banco (caso o usuário já tenha vinculado uma categoria antes)
 * 2. Por heurística de palavras-chave inteligentes (posto, combustível, mercado, uber, ifood, farmácia, etc.)
 */
export const guessCategoryForTransaction = async (
  userId: string,
  merchantName?: string,
  description?: string,
): Promise<number | null> => {
  const db = await getDb();
  await ensureDefaultCategories(userId);

  const text = `${merchantName || ''} ${description || ''}`.toLowerCase();

  // 1. Verifica se já existe o merchant vinculado a uma categoria
  if (merchantName) {
    const row = await db.get<{ category_id: number | null }>(
      `SELECT category_id FROM fin_merchants
        WHERE user_id = ? AND name_normalized = ? AND category_id IS NOT NULL`,
      userId,
      merchantName.trim().toLowerCase(),
    );
    if (row?.category_id) return row.category_id;
  }

  // 2. Mapeamento por palavras-chave
  let targetCategoryName: string | null = null;

  if (/posto|shell|ipiranga|petrobras|combust[ií]vel|gasolina|etanol|uber|99app|99|estacionamento|ped[aá]gio/i.test(text)) {
    targetCategoryName = "Transporte";
  } else if (/restaurante|ifood|lanchonete|mcdonald|burger|subway|padaria|a[cç]a[ií]|caf[eé]|bar|pizzaria/i.test(text)) {
    targetCategoryName = "Alimentação";
  } else if (/mercado|supermercado|carrefour|p[aã]o de a[cç][uú]car|assai|atacad|extra|dia|hortifruti/i.test(text)) {
    targetCategoryName = "Compras";
  } else if (/drogaria|farm[aá]cia|raia|drogasil|pacheco|s[aã]o paulo|consulta|laborat[oó]rio|exame/i.test(text)) {
    targetCategoryName = "Saúde";
  } else if (/netflix|spotify|cinema|ingresso|show|jogos|steam|playstation|xbox|disney|prime video/i.test(text)) {
    targetCategoryName = "Lazer";
  } else if (/aluguel|condom[ií]nio|enel|luz|energia|sabesp|copasa|[aá]gua|internet|claro|vivo|tim/i.test(text)) {
    targetCategoryName = "Moradia";
  } else if (/curso|faculdade|escola|livro|udemy|alura/i.test(text)) {
    targetCategoryName = "Educação";
  }

  if (targetCategoryName) {
    const cat = await db.get<{ id: number }>(
      `SELECT id FROM fin_categories WHERE user_id = ? AND name = ? COLLATE NOCASE LIMIT 1`,
      userId,
      targetCategoryName,
    );
    if (cat) return cat.id;
  }

  return null;
};