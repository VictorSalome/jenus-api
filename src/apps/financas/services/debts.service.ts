import { getDb } from "../../../core/database.js";

export interface CreateDebtInput {
  name: string;
  amountCents: number;
  dueDay: number;
  categoryId?: number | null;
  accountId?: number | null;
  startMonth?: string;
  endMonth?: string | null;
  notes?: string | null;
}

export interface UpdateDebtInput {
  name?: string;
  amountCents?: number;
  dueDay?: number;
  categoryId?: number | null;
  accountId?: number | null;
  active?: number;
  endMonth?: string | null;
  notes?: string | null;
}

export interface AddDebtPaymentInput {
  amountCents: number;
  paidDate?: string;
  notes?: string | null;
}

const currentMonthKey = (): string => new Date().toISOString().slice(0, 7);
const todayDateKey = (): string => new Date().toISOString().slice(0, 10);

function getDueDateForMonth(month: string, dueDay: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const maxDays = new Date(year, monthNum, 0).getDate();
  const day = Math.max(1, Math.min(dueDay, maxDays));
  return `${month}-${String(day).padStart(2, "0")}`;
}

/**
 * Garante que para o mês requisitado existam ocorrências criadas
 * para todas as dívidas fixas ativas do usuário.
 */
export const ensureMonthlyOccurrences = async (
  userId: string,
  month: string,
): Promise<void> => {
  const db = await getDb();

  const debts: any[] = await db.all(
    `SELECT id, amount_cents, due_day, start_month, end_month
       FROM fin_debts
      WHERE user_id = ?
        AND active = 1
        AND start_month <= ?
        AND (end_month IS NULL OR end_month = '' OR end_month >= ?)`,
    userId,
    month,
    month,
  );

  for (const debt of debts) {
    const dueDate = getDueDateForMonth(month, debt.due_day);
    await db.run(
      `INSERT OR IGNORE INTO fin_debt_occurrences
        (user_id, debt_id, month, due_date, expected_amount_cents, paid_amount_cents, status)
       VALUES (?, ?, ?, ?, ?, 0, 'PENDING')`,
      userId,
      debt.id,
      month,
      dueDate,
      debt.amount_cents,
    );
  }
};

export const listOccurrences = async (userId: string, month: string) => {
  const db = await getDb();
  await ensureMonthlyOccurrences(userId, month);

  const occurrences = await db.all<any[]>(
    `SELECT o.*,
            d.name as debt_name,
            d.due_day as debt_due_day,
            d.notes as debt_notes,
            d.active as debt_active,
            c.name as category_name,
            c.color as category_color,
            c.icon as category_icon,
            a.name as account_name,
            MAX(0, o.expected_amount_cents - o.paid_amount_cents) as remaining_cents
       FROM fin_debt_occurrences o
       JOIN fin_debts d ON d.id = o.debt_id
       LEFT JOIN fin_categories c ON c.id = d.category_id
       LEFT JOIN fin_accounts a ON a.id = d.account_id
      WHERE o.user_id = ? AND o.month = ?
      ORDER BY o.due_date ASC, d.name COLLATE NOCASE ASC`,
    userId,
    month,
  );

  for (const occ of occurrences) {
    const payments = await db.all(
      `SELECT * FROM fin_debt_payments
        WHERE occurrence_id = ? AND user_id = ?
        ORDER BY paid_date DESC, id DESC`,
      occ.id,
      userId,
    );
    occ.payments = payments;
  }

  const totalExpectedCents = occurrences.reduce(
    (acc, o) => acc + (o.status !== "CANCELLED" ? o.expected_amount_cents : 0),
    0,
  );
  const totalPaidCents = occurrences.reduce(
    (acc, o) => acc + (o.status !== "CANCELLED" ? o.paid_amount_cents : 0),
    0,
  );
  const totalRemainingCents = Math.max(0, totalExpectedCents - totalPaidCents);
  const countTotal = occurrences.length;
  const countPaid = occurrences.filter((o) => o.status === "PAID").length;
  const countPending = occurrences.filter(
    (o) => o.status !== "PAID" && o.status !== "CANCELLED",
  ).length;

  return {
    month,
    summary: {
      totalExpectedCents,
      totalPaidCents,
      totalRemainingCents,
      countTotal,
      countPaid,
      countPending,
    },
    occurrences,
  };
};

export const listDebts = async (userId: string) => {
  const db = await getDb();
  return db.all(
    `SELECT d.*,
            c.name as category_name,
            c.color as category_color,
            c.icon as category_icon,
            a.name as account_name
       FROM fin_debts d
       LEFT JOIN fin_categories c ON c.id = d.category_id
       LEFT JOIN fin_accounts a ON a.id = d.account_id
      WHERE d.user_id = ?
      ORDER BY d.active DESC, d.due_day ASC, d.name COLLATE NOCASE ASC`,
    userId,
  );
};

export const getDebt = async (userId: string, id: number) => {
  const db = await getDb();
  return db.get(
    `SELECT d.*,
            c.name as category_name,
            c.color as category_color,
            c.icon as category_icon,
            a.name as account_name
       FROM fin_debts d
       LEFT JOIN fin_categories c ON c.id = d.category_id
       LEFT JOIN fin_accounts a ON a.id = d.account_id
      WHERE d.id = ? AND d.user_id = ?`,
    id,
    userId,
  );
};

export const createDebt = async (userId: string, data: CreateDebtInput) => {
  const db = await getDb();
  const startMonth = data.startMonth || currentMonthKey();
  const dueDay = Math.max(1, Math.min(31, data.dueDay || 10));

  const result = await db.run(
    `INSERT INTO fin_debts
      (user_id, name, amount_cents, due_day, category_id, account_id, start_month, end_month, notes, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    userId,
    data.name.trim(),
    data.amountCents,
    dueDay,
    data.categoryId || null,
    data.accountId || null,
    startMonth,
    data.endMonth || null,
    data.notes?.trim() || null,
  );

  const debtId = result.lastID;

  // Cria ocorrência imediatamente para o startMonth
  await ensureMonthlyOccurrences(userId, startMonth);

  // Se o mês atual for posterior a startMonth, garante também o mês atual
  const curMonth = currentMonthKey();
  if (curMonth > startMonth) {
    await ensureMonthlyOccurrences(userId, curMonth);
  }

  return getDebt(userId, debtId);
};

export const updateDebt = async (
  userId: string,
  id: number,
  data: UpdateDebtInput,
) => {
  const db = await getDb();
  const existing = await getDebt(userId, id);
  if (!existing) return null;

  const dueDay =
    data.dueDay !== undefined
      ? Math.max(1, Math.min(31, data.dueDay))
      : existing.due_day;

  await db.run(
    `UPDATE fin_debts
        SET name = ?,
            amount_cents = ?,
            due_day = ?,
            category_id = ?,
            account_id = ?,
            active = ?,
            end_month = ?,
            notes = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?`,
    data.name !== undefined ? data.name.trim() : existing.name,
    data.amountCents !== undefined ? data.amountCents : existing.amount_cents,
    dueDay,
    data.categoryId !== undefined ? data.categoryId : existing.category_id,
    data.accountId !== undefined ? data.accountId : existing.account_id,
    data.active !== undefined ? data.active : existing.active,
    data.endMonth !== undefined ? data.endMonth : existing.end_month,
    data.notes !== undefined ? data.notes?.trim() || null : existing.notes,
    id,
    userId,
  );

  return getDebt(userId, id);
};

export const deleteDebt = async (userId: string, id: number) => {
  const db = await getDb();
  await db.run("DELETE FROM fin_debts WHERE id = ? AND user_id = ?", id, userId);
};

export const addPayment = async (
  userId: string,
  occurrenceId: number,
  data: AddDebtPaymentInput,
) => {
  const db = await getDb();
  const occurrence = await db.get<{
    id: number;
    user_id: string;
    debt_id: number;
    expected_amount_cents: number;
    paid_amount_cents: number;
    status: string;
  }>(
    "SELECT * FROM fin_debt_occurrences WHERE id = ? AND user_id = ?",
    occurrenceId,
    userId,
  );

  if (!occurrence) {
    throw new Error("Ocorrência de dívida não encontrada");
  }

  if (data.amountCents <= 0) {
    throw new Error("Valor do pagamento deve ser maior que zero");
  }

  const paidDate = data.paidDate || todayDateKey();

  await db.run(
    `INSERT INTO fin_debt_payments (user_id, occurrence_id, amount_cents, paid_date, notes)
     VALUES (?, ?, ?, ?, ?)`,
    userId,
    occurrenceId,
    data.amountCents,
    paidDate,
    data.notes?.trim() || null,
  );

  const sumRow = await db.get<{ total: number }>(
    "SELECT COALESCE(SUM(amount_cents), 0) as total FROM fin_debt_payments WHERE occurrence_id = ?",
    occurrenceId,
  );
  const totalPaid = sumRow?.total ?? 0;

  let newStatus = "PENDING";
  if (totalPaid >= occurrence.expected_amount_cents) {
    newStatus = "PAID";
  } else if (totalPaid > 0) {
    newStatus = "PARTIAL";
  }

  await db.run(
    `UPDATE fin_debt_occurrences
        SET paid_amount_cents = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    totalPaid,
    newStatus,
    occurrenceId,
  );

  const payments = await db.all(
    `SELECT * FROM fin_debt_payments
      WHERE occurrence_id = ? AND user_id = ?
      ORDER BY paid_date DESC, id DESC`,
    occurrenceId,
    userId,
  );

  const updatedOcc = await db.get<any>(
    `SELECT o.*,
            d.name as debt_name,
            d.due_day as debt_due_day,
            d.notes as debt_notes,
            MAX(0, o.expected_amount_cents - o.paid_amount_cents) as remaining_cents
       FROM fin_debt_occurrences o
       JOIN fin_debts d ON d.id = o.debt_id
      WHERE o.id = ?`,
    occurrenceId,
  );
  updatedOcc.payments = payments;

  return updatedOcc;
};

export const deletePayment = async (userId: string, paymentId: number) => {
  const db = await getDb();
  const payment = await db.get<{ occurrence_id: number }>(
    "SELECT occurrence_id FROM fin_debt_payments WHERE id = ? AND user_id = ?",
    paymentId,
    userId,
  );

  if (!payment) {
    throw new Error("Pagamento não encontrado");
  }

  await db.run("DELETE FROM fin_debt_payments WHERE id = ? AND user_id = ?", paymentId, userId);

  const occurrenceId = payment.occurrence_id;
  const occurrence = await db.get<{ expected_amount_cents: number }>(
    "SELECT expected_amount_cents FROM fin_debt_occurrences WHERE id = ?",
    occurrenceId,
  );

  const sumRow = await db.get<{ total: number }>(
    "SELECT COALESCE(SUM(amount_cents), 0) as total FROM fin_debt_payments WHERE occurrence_id = ?",
    occurrenceId,
  );
  const totalPaid = sumRow?.total ?? 0;

  let newStatus = "PENDING";
  if (occurrence && totalPaid >= occurrence.expected_amount_cents) {
    newStatus = "PAID";
  } else if (totalPaid > 0) {
    newStatus = "PARTIAL";
  }

  await db.run(
    `UPDATE fin_debt_occurrences
        SET paid_amount_cents = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    totalPaid,
    newStatus,
    occurrenceId,
  );

  return { success: true, occurrenceId, totalPaid, status: newStatus };
};
