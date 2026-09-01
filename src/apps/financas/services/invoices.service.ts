import { getDb } from "../../../core/database.js";
import {
  getInvoiceReference,
  getInvoiceDueDate,
  getMonthKey,
  type InvoiceReference,
} from "./invoice-cycle.js";

const todayKey = (): string => new Date().toISOString().slice(0, 10);

const effectiveStatus = (status: string, dueDate: string): string => {
  if (status === "PENDING" && dueDate < todayKey()) return "OVERDUE";
  return status;
};

/**
 * Agrupa parcelas (e compras à vista no cartão) por fatura, usando o ciclo
 * do cartão (closing_day/due_day) para determinar a fatura de cada item.
 */
export const listInvoices = async (userId: string) => {
  const db = await getDb();

  const cards = await db.all(
    "SELECT * FROM fin_cards WHERE user_id = ? ORDER BY name COLLATE NOCASE",
    userId,
  );

  const invoices: any[] = [];

  for (const card of cards) {
    // Parcelas no cartão
    const installments = await db.all(
      `SELECT i.id, i.amount_cents, i.due_date, i.status, i.paid_date,
              COALESCE(m.name, t.description, '') as merchant_name,
              i.number, p.total_installments
         FROM fin_installments i
         LEFT JOIN fin_installment_plans p ON p.id = i.plan_id
         LEFT JOIN fin_transactions t ON t.id = i.transaction_id
         LEFT JOIN fin_merchants m ON m.id = t.merchant_id
        WHERE i.user_id = ? AND t.card_id = ?`,
      userId,
      card.id,
    );

    // Compras à vista no cartão (não parceladas)
    const cashPurchases = await db.all(
      `SELECT t.id, t.amount_cents, t.transaction_date as due_date, t.status, t.paid_date,
              COALESCE(m.name, t.description, '') as merchant_name,
              1 as number, 1 as total_installments
         FROM fin_transactions t
         LEFT JOIN fin_merchants m ON m.id = t.merchant_id
        WHERE t.user_id = ? AND t.card_id = ? AND t.installments_total = 1
          AND t.status != 'CANCELLED'`,
      userId,
      card.id,
    );

    const byInvoice = new Map<
      string,
      { ref: InvoiceReference; cardId: number; cardName: string; dueDate: string; items: any[] }
    >();

    const addItem = (item: any) => {
      const ref = getInvoiceReference(item.due_date, card.closing_day);
      const key = getMonthKey(ref.year, ref.month);
      if (!byInvoice.has(key)) {
        byInvoice.set(key, {
          ref,
          cardId: card.id,
          cardName: card.name,
          dueDate: getInvoiceDueDate(ref, card.due_day),
          items: [],
        });
      }
      byInvoice.get(key)!.items.push({
        ...item,
        status: effectiveStatus(item.status, item.due_date),
      });
    };

    for (const item of installments) addItem(item);
    for (const item of cashPurchases) addItem(item);

    for (const [key, inv] of byInvoice.entries()) {
      const total = inv.items.reduce((acc, it) => acc + it.amount_cents, 0);
      const paid = inv.items
        .filter((it) => it.status === "PAID")
        .reduce((acc, it) => acc + it.amount_cents, 0);
      const pending = inv.items
        .filter((it) => it.status === "PENDING" || it.status === "OVERDUE")
        .reduce((acc, it) => acc + it.amount_cents, 0);

      invoices.push({
        key,
        cardId: inv.cardId,
        cardName: inv.cardName,
        dueDate: inv.dueDate,
        totalCents: total,
        paidCents: paid,
        pendingCents: pending,
        open: pending > 0,
        items: inv.items,
      });
    }
  }

  // Ordena: primeiro as faturas abertas mais próximas do vencimento
  invoices.sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1;
    return a.dueDate < b.dueDate ? -1 : 1;
  });

  return invoices;
};

/**
 * Fatura atual (aberta) de cada cartão = fatura do ciclo corrente c/ itens pendentes.
 */
export const currentOpenInvoices = async (userId: string) => {
  const invoices = await listInvoices(userId);
  return invoices.filter((inv) => inv.open);
};