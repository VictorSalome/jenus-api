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
export const listInvoices = async (householdId: string) => {
  const db = await getDb();

  const cards = await db.all(
    "SELECT id, household_id, user_id, account_id, name, last4, brand, closing_day, due_day, credit_limit_cents, created_at, updated_at FROM fin_cards WHERE household_id = ? OR user_id = ? ORDER BY name COLLATE NOCASE",
    householdId,
    householdId,
  );

  const invoices: any[] = [];

  for (const card of cards) {
    // Parcelas no cartão
    const installments = await db.all(
      `SELECT i.id, i.amount_cents, i.due_date, i.status, i.paid_date,
              COALESCE(m.name, t.description, '') as merchant_name,
              i.number, p.total_installments,
              t.user_id,
              COALESCE(u.name, 'Sem identificação') as user_name
         FROM fin_installments i
         LEFT JOIN fin_installment_plans p ON p.id = i.plan_id
         LEFT JOIN fin_transactions t ON t.id = i.transaction_id
         LEFT JOIN fin_merchants m ON m.id = t.merchant_id
         LEFT JOIN users u ON u.id = t.user_id
        WHERE (i.household_id = ? OR i.user_id = ?) AND t.card_id = ?`,
      householdId,
      householdId,
      card.id,
    );

    // Compras à vista no cartão (não parceladas)
    const cashPurchases = await db.all(
      `SELECT t.id, t.amount_cents, t.transaction_date as due_date, t.status, t.paid_date,
              COALESCE(m.name, t.description, '') as merchant_name,
              1 as number, 1 as total_installments,
              t.user_id,
              COALESCE(u.name, 'Sem identificação') as user_name
         FROM fin_transactions t
         LEFT JOIN fin_merchants m ON m.id = t.merchant_id
         LEFT JOIN users u ON u.id = t.user_id
        WHERE (t.household_id = ? OR t.user_id = ?) AND t.card_id = ? AND t.installments_total = 1
          AND t.status != 'CANCELLED'`,
      householdId,
      householdId,
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

      const membersMap = new Map<string, { user_id: string; name: string; total_cents: number }>();
      for (const it of inv.items) {
        const uid = it.user_id || "";
        const uname = it.user_name || "Sem identificação";
        const existing = membersMap.get(uid);
        if (existing) {
          existing.total_cents += it.amount_cents;
        } else {
          membersMap.set(uid, {
            user_id: uid,
            name: uname,
            total_cents: it.amount_cents,
          });
        }
      }

      const members = Array.from(membersMap.values())
        .map((m) => ({
          user_id: m.user_id,
          name: m.name,
          total_cents: m.total_cents,
          percentage: total > 0 ? Math.round((m.total_cents / total) * 100) : 0,
        }))
        .sort((a, b) => b.total_cents - a.total_cents);

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
        members,
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
export const currentOpenInvoices = async (householdId: string) => {
  const invoices = await listInvoices(householdId);
  return invoices.filter((inv) => inv.open);
};
