import { getDb } from "../../../core/database.js";
import { getInvoiceReference, getMonthKey } from "./invoice-cycle.js";

const todayKey = (): string => new Date().toISOString().slice(0, 10);

const effectiveStatus = (row: any): string => {
  if (row.status === "PENDING" && row.due_date < todayKey()) {
    return "OVERDUE";
  }
  return row.status;
};

export const listInstallments = async (
  userId: string,
  filters: { planId?: number; status?: string; from?: string; to?: string } = {},
) => {
  const db = await getDb();
  const where: string[] = ["i.user_id = ?"];
  const params: any[] = [userId];

  if (filters.planId) {
    where.push("i.plan_id = ?");
    params.push(filters.planId);
  }
  if (filters.status) {
    where.push("i.status = ?");
    params.push(filters.status);
  }
  if (filters.from) {
    where.push("i.due_date >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("i.due_date <= ?");
    params.push(filters.to);
  }

  const rows = await db.all(
    `SELECT i.*, p.total_installments, t.description, t.merchant_id, t.card_id,
            COALESCE(m.name, t.description, '') as merchant_name,
            COALESCE(c.name, '') as card_name
       FROM fin_installments i
       LEFT JOIN fin_installment_plans p ON p.id = i.plan_id
       LEFT JOIN fin_transactions t ON t.id = i.transaction_id
       LEFT JOIN fin_merchants m ON m.id = t.merchant_id
       LEFT JOIN fin_cards c ON c.id = t.card_id
      WHERE ${where.join(" AND ")}
      ORDER BY i.due_date ASC, i.number ASC`,
    ...params,
  );

  return rows.map((r) => ({ ...r, status: effectiveStatus(r) }));
};

export const getInstallment = async (userId: string, id: number) => {
  const db = await getDb();
  const row = await db.get(
    `SELECT i.*, p.total_installments, t.description, t.merchant_id,
            COALESCE(m.name, t.description, '') as merchant_name
       FROM fin_installments i
       LEFT JOIN fin_installment_plans p ON p.id = i.plan_id
       LEFT JOIN fin_transactions t ON t.id = i.transaction_id
       LEFT JOIN fin_merchants m ON m.id = t.merchant_id
      WHERE i.id = ? AND i.user_id = ?`,
    id,
    userId,
  );
  if (!row) return null;
  return { ...row, status: effectiveStatus(row) };
};

/** Marca a parcela individual como paga (confirmação manual). */
export const payInstallment = async (userId: string, id: number) => {
  const db = await getDb();
  const existing = await db.get(
    "SELECT * FROM fin_installments WHERE id = ? AND user_id = ?",
    id,
    userId,
  );
  if (!existing) return null;
  if (existing.status !== "PENDING" && existing.status !== "OVERDUE") {
    return getInstallment(userId, id);
  }

  await db.run(
    `UPDATE fin_installments
        SET status = 'PAID', paid_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?`,
    todayKey(),
    id,
    userId,
  );

  // Se todas as parcelas do plano foram pagas, marca o plano como COMPLETED.
  const remaining = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM fin_installments
      WHERE plan_id = ? AND status != 'PAID'`,
    existing.plan_id,
  );
  if (remaining && remaining.count === 0) {
    await db.run(
      "UPDATE fin_installment_plans SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      existing.plan_id,
    );
  }

  return getInstallment(userId, id);
};

export const cancelInstallment = async (userId: string, id: number) => {
  const db = await getDb();
  const existing = await db.get(
    "SELECT * FROM fin_installments WHERE id = ? AND user_id = ?",
    id,
    userId,
  );
  if (!existing) return null;

  await db.run(
    "UPDATE fin_installments SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
    id,
    userId,
  );
  return getInstallment(userId, id);
};

/**
 * Comprometimento futuro: parcelas PENDING com due_date após o fim do mês
 * selecionado, agrupadas por mês (próximos 12 meses).
 */
export const futureCommitment = async (
  userId: string,
  referenceMonth: string,
  months = 12,
) => {
  const db = await getDb();
  const [refYear, refMonth] = referenceMonth.split("-").map(Number);
  const monthStart = new Date(refYear, refMonth, 1);
  const afterEnd = new Date(refYear, refMonth + 1, 0);
  const afterEndKey = afterEnd.toISOString().slice(0, 10);

  const rows = await db.all(
    `SELECT due_date, SUM(amount_cents) as total
       FROM fin_installments
      WHERE user_id = ? AND status = 'PENDING' AND due_date > ?
      GROUP BY due_date
      ORDER BY due_date ASC`,
    userId,
    afterEndKey,
  );

  const byMonth = new Map<string, { month: string; label: string; totalCents: number }>();
  for (const row of rows) {
    const key = row.due_date.slice(0, 7);
    if (!byMonth.has(key)) {
      byMonth.set(key, { month: key, label: key, totalCents: 0 });
    }
    byMonth.get(key)!.totalCents += row.total;
  }

  // Gera os próximos `months` meses, preenchendo com 0 os sem parcela.
  const result: { month: string; label: string; totalCents: number }[] = [];
  for (let i = 1; i <= months; i++) {
    const d = new Date(refYear, refMonth + i - 1, 1);
    const key = getMonthKey(d.getFullYear(), d.getMonth() + 1);
    result.push(byMonth.get(key) ?? { month: key, label: key, totalCents: 0 });
  }

  return result;
};