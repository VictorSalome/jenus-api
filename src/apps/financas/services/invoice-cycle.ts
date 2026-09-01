export interface InvoiceReference {
  year: number;
  month: number; // 1-12
}

/**
 * Determina em qual fatura uma compra/parcela cai, dado o ciclo do cartão.
 * Regra padrão de cartão de crédito:
 *  - compra com dia <= closing_day → fatura do mês corrente
 *  - compra com dia > closing_day  → fatura do mês seguinte
 *
 * Isolado em arquivo próprio para evoluir a lógica de fechamento depois,
 * sem alterar o modelo do banco.
 */
export const getInvoiceReference = (
  transactionDate: string,
  closingDay: number,
): InvoiceReference => {
  const date = new Date(`${transactionDate}T00:00:00`);
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  if (day <= closingDay) {
    return { year, month };
  }
  const next = new Date(year, month, 1); // mês seguinte
  return { year: next.getFullYear(), month: next.getMonth() + 1 };
};

/**
 * Retorna a data de vencimento (YYYY-MM-DD) de uma fatura: dia due_day do mês
 * de referência, clampeado ao último dia do mês caso o dia não exista.
 */
export const getInvoiceDueDate = (
  ref: InvoiceReference,
  dueDay: number,
): string => {
  const lastDay = new Date(ref.year, ref.month, 0).getDate();
  const day = Math.min(dueDay, lastDay);
  return `${ref.year}-${String(ref.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

export const getMonthKey = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, "0")}`;

export const parseMonthKey = (
  key: string,
): { year: number; month: number } => {
  const [year, month] = key.split("-").map(Number);
  return { year, month: month ?? 1 };
};