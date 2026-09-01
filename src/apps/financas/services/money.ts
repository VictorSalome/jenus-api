/**
 * Divide amount_cents (inteiro) em N parcelas com arredondamento correto.
 * O resto (centavos) vai para a última parcela.
 * Ex: R$ 1000 / 3 → [33333, 33333, 33334]
 */
export const splitInstallments = (
  totalCents: number,
  count: number,
): number[] => {
  if (count <= 1) return [totalCents];
  const base = Math.floor(totalCents / count);
  const result = new Array(count).fill(base);
  const rest = totalCents - base * count;
  if (rest > 0) result[count - 1] += rest;
  return result;
};

export const formatBRL = (cents: number): string =>
  `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const parseBRL = (value: string): number | null => {
  const cleaned = value
    .replace(/R\$\s*/i, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = Number(cleaned);
  return Number.isFinite(num) ? Math.round(num * 100) : null;
};