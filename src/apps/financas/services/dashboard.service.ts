import { getDb } from "../../../core/database.js";
import { getInvoiceReference, getInvoiceDueDate, getMonthKey } from "./invoice-cycle.js";

const todayKey = (): string => new Date().toISOString().slice(0, 10);

export interface DashboardData {
  /** Gasto do mês selecionado (soma de amount_cents das transações cuja transaction_date pertence ao mês) */
  gastoMesCents: number;
  /** Fatura(s) aberta(s) atual(is) */
  faturasAbertas: { cardId: number; cardName: string; totalCents: number; dueDate: string }[];
  /** Comprometimento futuro por mês (próximos 12 meses) */
  comprometimentoFuturo: { month: string; totalCents: number }[];
  /** Gastos por categoria */
  gastosPorCategoria: { categoryId: number | null; name: string; icon: string; color: string; totalCents: number }[];
  /** Gastos por cartão */
  gastosPorCartao: { cardId: number | null; name: string; totalCents: number }[];
  /** Gastos por conta */
  gastosPorConta: { accountId: number; name: string; totalCents: number }[];
  /** Evolução mensal (últimos 6 meses) */
  evolucaoMensal: { month: string; totalCents: number }[];
  /** Faturas atuais (detalhadas) */
  faturasAtuais: any[];
  /** Parcelas futuras (detalhadas) */
  parcelasFuturas: any[];
}

/**
 * Dashboard completo do módulo Finanças.
 * Três métricas principais sem double-counting:
 * - gastoMes → transações (transaction_date) no mês
 * - faturaAberta → parcelas/transações no cartão no ciclo atual
 * - comprometimentoFuturo → parcelas PENDING com due_date > fim do mês
 */
export const getDashboard = async (
  userId: string,
  referenceMonth?: string,
): Promise<DashboardData> => {
  const db = await getDb();
  const ref = referenceMonth || todayKey().slice(0, 7);
  const [refYear, refMonth] = ref.split("-").map(Number);

  const monthStart = `${ref}-01`;
  const monthEnd = new Date(refYear, refMonth, 0).toISOString().slice(0, 10);
  const afterMonthEnd = new Date(refYear, refMonth + 1, 0).toISOString().slice(0, 10);

  // 1. Gasto do mês: transações cujo transaction_date pertence ao mês
  const gastoMesRow = await db.get<{ total: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) as total
       FROM fin_transactions
      WHERE user_id = ? AND transaction_date BETWEEN ? AND ?
        AND status != 'CANCELLED' AND type = 'debit'`,
    userId,
    monthStart,
    monthEnd,
  );
  const gastoMesCents = gastoMesRow?.total ?? 0;

  // 2. Faturas abertas (por cartão, ciclo atual)
  const cards = await db.all(
    "SELECT * FROM fin_cards WHERE user_id = ? ORDER BY name",
    userId,
  );
  const faturasAbertas: DashboardData["faturasAbertas"] = [];

  for (const card of cards) {
    const installments = await db.all(
      `SELECT i.amount_cents, i.due_date, i.status
         FROM fin_installments i
         JOIN fin_transactions t ON t.id = i.transaction_id
        WHERE i.user_id = ? AND t.card_id = ? AND i.status != 'CANCELLED'`,
      userId,
      card.id,
    );

    const cashPurchases = await db.all(
      `SELECT amount_cents, transaction_date as due_date, status
         FROM fin_transactions
        WHERE user_id = ? AND card_id = ? AND installments_total = 1
          AND status != 'CANCELLED'`,
      userId,
      card.id,
    );

    const items = [...installments, ...cashPurchases];
    const currentRef = getInvoiceReference(todayKey(), card.closing_day);
    const currentKey = getMonthKey(currentRef.year, currentRef.month);
    const invoiceItems = items.filter((item) => {
      const ref = getInvoiceReference(item.due_date, card.closing_day);
      const key = getMonthKey(ref.year, ref.month);
      return key === currentKey;
    });

    const pending = invoiceItems.filter(
      (it) => it.status === "PENDING" || it.status === "OVERDUE",
    );
    const totalCents = pending.reduce((acc, it) => acc + it.amount_cents, 0);

    if (totalCents > 0) {
      const invRef = getInvoiceReference(todayKey(), card.closing_day);
      const dueDate = getInvoiceDueDate(invRef, card.due_day);
      faturasAbertas.push({
        cardId: card.id,
        cardName: card.name,
        totalCents,
        dueDate,
      });
    }
  }

  // 3. Comprometimento futuro: parcelas PENDING com due_date após o fim do mês
  const futureRaws = await db.all(
    `SELECT due_date, SUM(amount_cents) as total
       FROM fin_installments
      WHERE user_id = ? AND status = 'PENDING' AND due_date > ?
      GROUP BY due_date
      ORDER BY due_date ASC
      LIMIT 365`,
    userId,
    afterMonthEnd,
  );

  const byMonth = new Map<string, number>();
  for (const row of futureRaws) {
    const key = row.due_date.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + row.total);
  }

  const comprometimentoFuturo: DashboardData["comprometimentoFuturo"] = [];
  for (let i = 1; i <= 12; i++) {
    const d = new Date(refYear, refMonth + i - 1, 1);
    const key = getMonthKey(d.getFullYear(), d.getMonth() + 1);
    comprometimentoFuturo.push({ month: key, totalCents: byMonth.get(key) ?? 0 });
  }

  // 4. Gastos por categoria
  const gastosPorCategoria = await db.all(
    `SELECT COALESCE(t.category_id, 0) as categoryId,
            COALESCE(c.name, 'Sem categoria') as name,
            COALESCE(c.icon, 'tag') as icon,
            COALESCE(c.color, '#64748b') as color,
            SUM(t.amount_cents) as totalCents
       FROM fin_transactions t
       LEFT JOIN fin_categories c ON c.id = t.category_id
      WHERE t.user_id = ? AND t.type = 'debit' AND t.status != 'CANCELLED'
        AND t.transaction_date BETWEEN ? AND ?
      GROUP BY t.category_id
      ORDER BY totalCents DESC`,
    userId,
    monthStart,
    monthEnd,
  );

  // 5. Gastos por cartão
  const gastosPorCartao = await db.all(
    `SELECT COALESCE(t.card_id, 0) as cardId,
            COALESCE(c.name, 'Sem cartão') as name,
            SUM(t.amount_cents) as totalCents
       FROM fin_transactions t
       LEFT JOIN fin_cards c ON c.id = t.card_id
      WHERE t.user_id = ? AND t.type = 'debit' AND t.status != 'CANCELLED'
        AND t.transaction_date BETWEEN ? AND ?
      GROUP BY t.card_id
      ORDER BY totalCents DESC`,
    userId,
    monthStart,
    monthEnd,
  );

  // 6. Gastos por conta
  const gastosPorConta = await db.all(
    `SELECT t.account_id as accountId, a.name, SUM(t.amount_cents) as totalCents
       FROM fin_transactions t
       LEFT JOIN fin_accounts a ON a.id = t.account_id
      WHERE t.user_id = ? AND t.type = 'debit' AND t.status != 'CANCELLED'
        AND t.transaction_date BETWEEN ? AND ?
      GROUP BY t.account_id
      ORDER BY totalCents DESC`,
    userId,
    monthStart,
    monthEnd,
  );

  // 7. Evolução mensal (últimos 6 meses)
  const evolucaoMensal: DashboardData["evolucaoMensal"] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(refYear, refMonth - 1 - i, 1);
    const key = getMonthKey(d.getFullYear(), d.getMonth() + 1);
    const start = `${key}-01`;
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    const row = await db.get<{ total: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total
         FROM fin_transactions
        WHERE user_id = ? AND type = 'debit' AND status != 'CANCELLED'
          AND transaction_date BETWEEN ? AND ?`,
      userId,
      start,
      end,
    );
    evolucaoMensal.push({ month: key, totalCents: row?.total ?? 0 });
  }

  // 8. Faturas atuais (detalhadas)
  const faturasModule = await import("./invoices.service.js");
  const faturasAtuais = await faturasModule.currentOpenInvoices(userId);

  // 9. Parcelas futuras (detalhadas)
  const installmentsModule = await import("./installments.service.js");
  const parcelasFuturas = await installmentsModule.listInstallments(userId, {
    from: afterMonthEnd,
  });

  return {
    gastoMesCents,
    faturasAbertas,
    comprometimentoFuturo,
    gastosPorCategoria,
    gastosPorCartao,
    gastosPorConta,
    evolucaoMensal,
    faturasAtuais,
    parcelasFuturas,
  };
};