import { getDb } from "../../../core/database.js";
import { AppError } from "../shared/errors.js";

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
 * para todas as dívidas fixas ativas do household.
 */
export const ensureMonthlyOccurrences = async (
  householdId: string,
  month: string,
  userId?: string,
): Promise<void> => {
  const db = await getDb();
  const effectiveUser = userId || householdId;

  const debts: any[] = await db.all(
    `SELECT id, amount_cents, due_day, start_month, end_month
       FROM fin_debts
      WHERE (household_id = ? OR user_id = ?)
        AND active = 1
        AND start_month <= ?
        AND (end_month IS NULL OR end_month = '' OR end_month >= ?)`,
    householdId,
    householdId,
    month,
    month,
  );

  for (const debt of debts) {
    const dueDate = getDueDateForMonth(month, debt.due_day);
    await db.run(
      `INSERT OR IGNORE INTO fin_debt_occurrences
        (household_id, user_id, debt_id, month, due_date, expected_amount_cents, paid_amount_cents, status)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'PENDING')`,
      householdId,
      effectiveUser,
      debt.id,
      month,
      dueDate,
      debt.amount_cents,
    );
  }
};

export const listOccurrences = async (householdId: string, month: string, userId?: string) => {
  const db = await getDb();
  await ensureMonthlyOccurrences(householdId, month, userId);

  const occurrences = await db.all<any[]>(
    `SELECT o.id, o.household_id, o.user_id, o.debt_id, o.month, o.due_date, o.expected_amount_cents,
            o.paid_amount_cents, o.status, o.created_at, o.updated_at,
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
      WHERE (o.household_id = ? OR o.user_id = ?) AND o.month = ?
      ORDER BY o.due_date ASC, d.name COLLATE NOCASE ASC`,
    householdId,
    householdId,
    month,
  );

  for (const occ of occurrences) {
    const payments = await db.all(
      `SELECT p.id, p.household_id, p.user_id, p.occurrence_id, p.amount_cents, p.paid_date, p.notes, p.created_at,
              COALESCE(u.name, 'Sem identificação') AS paid_by_name
         FROM fin_debt_payments p
         LEFT JOIN users u ON u.id = p.user_id
        WHERE p.occurrence_id = ? AND (p.household_id = ? OR p.user_id = ?)
        ORDER BY p.paid_date DESC, p.id DESC`,
      occ.id,
      householdId,
      householdId,
    );
    occ.paid_by_name = payments.length > 0 ? payments[0].paid_by_name : null;
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

export const listDebts = async (householdId: string) => {
  const db = await getDb();
  return db.all(
    `SELECT d.id, d.household_id, d.user_id, d.name, d.amount_cents, d.due_day,
            d.category_id, d.account_id, d.start_month, d.end_month, d.active,
            d.notes, d.created_at, d.updated_at,
            c.name as category_name,
            c.color as category_color,
            c.icon as category_icon,
            a.name as account_name
       FROM fin_debts d
       LEFT JOIN fin_categories c ON c.id = d.category_id
       LEFT JOIN fin_accounts a ON a.id = d.account_id
      WHERE d.household_id = ? OR d.user_id = ?
      ORDER BY d.active DESC, d.due_day ASC, d.name COLLATE NOCASE ASC`,
    householdId,
    householdId,
  );
};

export const getDebt = async (householdId: string, id: number) => {
  const db = await getDb();
  return db.get(
    `SELECT d.id, d.household_id, d.user_id, d.name, d.amount_cents, d.due_day,
            d.category_id, d.account_id, d.start_month, d.end_month, d.active,
            d.notes, d.created_at, d.updated_at,
            c.name as category_name,
            c.color as category_color,
            c.icon as category_icon,
            a.name as account_name
       FROM fin_debts d
       LEFT JOIN fin_categories c ON c.id = d.category_id
       LEFT JOIN fin_accounts a ON a.id = d.account_id
      WHERE d.id = ? AND (d.household_id = ? OR d.user_id = ?)`,
    id,
    householdId,
    householdId,
  );
};

export const createDebt = async (
  householdId: string,
  data: CreateDebtInput,
  userId?: string,
) => {
  if (!Number.isInteger(data.amountCents) || data.amountCents <= 0) {
    throw new Error("Valor da dívida deve ser um número inteiro de centavos maior que zero");
  }

  const db = await getDb();
  const startMonth = data.startMonth || currentMonthKey();
  const dueDay = Math.max(1, Math.min(31, data.dueDay || 10));
  const effectiveUser = userId || householdId;

  const result = await db.run(
    `INSERT INTO fin_debts
      (household_id, user_id, name, amount_cents, due_day, category_id, account_id, start_month, end_month, notes, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    householdId,
    effectiveUser,
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
  await ensureMonthlyOccurrences(householdId, startMonth, effectiveUser);

  // Se o mês atual for posterior a startMonth, garante também o mês atual
  const curMonth = currentMonthKey();
  if (curMonth > startMonth) {
    await ensureMonthlyOccurrences(householdId, curMonth, effectiveUser);
  }

  return getDebt(householdId, debtId);
};

export const updateDebt = async (
  householdId: string,
  id: number,
  data: UpdateDebtInput,
) => {
  if (
    data.amountCents !== undefined &&
    (!Number.isInteger(data.amountCents) || data.amountCents <= 0)
  ) {
    throw new Error("Valor da dívida deve ser um número inteiro de centavos maior que zero");
  }

  const db = await getDb();
  const existing = await getDebt(householdId, id);
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
      WHERE id = ? AND (household_id = ? OR user_id = ?)`,
    data.name !== undefined ? data.name.trim() : existing.name,
    data.amountCents !== undefined ? data.amountCents : existing.amount_cents,
    dueDay,
    data.categoryId !== undefined ? data.categoryId : existing.category_id,
    data.accountId !== undefined ? data.accountId : existing.account_id,
    data.active !== undefined ? data.active : existing.active,
    data.endMonth !== undefined ? data.endMonth : existing.end_month,
    data.notes !== undefined ? data.notes?.trim() || null : existing.notes,
    id,
    householdId,
    householdId,
  );

  return getDebt(householdId, id);
};

export const deleteDebt = async (householdId: string, id: number) => {
  const db = await getDb();
  const res = await db.run("DELETE FROM fin_debts WHERE id = ? AND (household_id = ? OR user_id = ?)", id, householdId, householdId);
  return (res?.changes ?? 0) > 0;
};

export const addPayment = async (
  householdId: string,
  occurrenceId: number,
  data: AddDebtPaymentInput,
  userId?: string,
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
    "SELECT id, household_id, user_id, debt_id, month, due_date, expected_amount_cents, paid_amount_cents, status, created_at, updated_at FROM fin_debt_occurrences WHERE id = ? AND (household_id = ? OR user_id = ?)",
    occurrenceId,
    householdId,
    householdId,
  );

  if (!occurrence) {
    throw new AppError("Ocorrência de dívida não encontrada", 404);
  }

  if (data.amountCents <= 0 || !Number.isInteger(data.amountCents)) {
    throw new AppError("Valor do pagamento deve ser um número inteiro de centavos maior que zero", 400);
  }

  const paidDate = data.paidDate || todayDateKey();
  const effectiveUser = userId || householdId;

  await db.run(
    `INSERT INTO fin_debt_payments (household_id, user_id, occurrence_id, amount_cents, paid_date, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    householdId,
    effectiveUser,
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
    `SELECT id, household_id, user_id, occurrence_id, amount_cents, paid_date, notes, created_at FROM fin_debt_payments
      WHERE occurrence_id = ? AND (household_id = ? OR user_id = ?)
      ORDER BY paid_date DESC, id DESC`,
    occurrenceId,
    householdId,
    householdId,
  );

  const updatedOcc = await db.get<any>(
    `SELECT o.id, o.household_id, o.user_id, o.debt_id, o.month, o.due_date, o.expected_amount_cents,
            o.paid_amount_cents, o.status, o.created_at, o.updated_at,
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

export const deletePayment = async (householdId: string, paymentId: number) => {
  const db = await getDb();
  const payment = await db.get<{ occurrence_id: number }>(
    "SELECT occurrence_id FROM fin_debt_payments WHERE id = ? AND (household_id = ? OR user_id = ?)",
    paymentId,
    householdId,
    householdId,
  );

  if (!payment) {
    throw new AppError("Pagamento não encontrado", 404);
  }

  await db.run("DELETE FROM fin_debt_payments WHERE id = ? AND (household_id = ? OR user_id = ?)", paymentId, householdId, householdId);

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

export interface DebtSuggestion {
  name: string;
  amountCents: number;
  dueDay: number;
  occurrencesCount: number;
  confidence: 'alta' | 'média';
  category_id?: number | null;
}

export const getRecurringSuggestions = async (householdId: string): Promise<DebtSuggestion[]> => {
  const db = await getDb();

  const existingDebts = await db.all<any[]>(
    "SELECT name FROM fin_debts WHERE (household_id = ? OR user_id = ?) AND active = 1",
    householdId,
    householdId,
  );
  const existingNames = new Set((existingDebts || []).map((d) => d.name.toLowerCase().trim()));

  const rows = await db.all<any[]>(
    `SELECT COALESCE(m.name, t.description, 'Despesa') as title,
            t.amount_cents,
            (
              SELECT t2.category_id
                FROM fin_transactions t2
                LEFT JOIN fin_merchants m2 ON m2.id = t2.merchant_id
               WHERE (t2.household_id = t.household_id OR t2.user_id = t.user_id)
                 AND t2.amount_cents = t.amount_cents
                 AND COALESCE(m2.name, t2.description, 'Despesa') = COALESCE(m.name, t.description, 'Despesa')
               ORDER BY t2.transaction_date DESC, t2.id DESC
               LIMIT 1
            ) as category_id,
            strftime('%d', t.transaction_date) as day_of_month,
            COUNT(DISTINCT substr(t.transaction_date, 1, 7)) as distinct_months,
            COUNT(*) as total_count
       FROM fin_transactions t
       LEFT JOIN fin_merchants m ON m.id = t.merchant_id
      WHERE (t.household_id = ? OR t.user_id = ?)
        AND (t.type = 'debit' OR t.type = 'credit')
        AND t.status != 'CANCELLED'
        AND t.installments_total = 1
      GROUP BY title, t.amount_cents
      HAVING total_count >= 2 OR distinct_months >= 2
      ORDER BY total_count DESC
      LIMIT 10`,
    householdId,
    householdId,
  );

  const KNOWN_SUBSCRIPTIONS = [
    'netflix', 'spotify', 'amazon prime', 'prime video', 'youtube', 'hbo', 'max',
    'disney', 'globo', 'globoplay', 'apple', 'icloud', 'openai', 'chatgpt',
    'gym', 'smart fit', 'bluefit', 'academia', 'aluguel', 'condominio', 'condomínio',
    'claro', 'vivo', 'tim', 'internet', 'fibra', 'sem parar', 'veloe'
  ];

  const suggestions: DebtSuggestion[] = [];

  for (const r of rows) {
    const titleClean = (r.title || '').trim();
    const lower = titleClean.toLowerCase();
    if (!titleClean || existingNames.has(lower)) continue;

    const isKnown = KNOWN_SUBSCRIPTIONS.some((s) => lower.includes(s));
    const day = parseInt(r.day_of_month, 10) || 10;

    suggestions.push({
      name: titleClean,
      amountCents: r.amount_cents,
      dueDay: Math.max(1, Math.min(31, day)),
      occurrencesCount: r.total_count,
      confidence: isKnown || r.distinct_months >= 2 ? 'alta' : 'média',
      category_id: r.category_id || null,
    });
  }

  return suggestions;
};
