import type { RawNotification } from "./types.js";

/**
 * Extrai um valor monetário (ex.: "R$ 1.234,56", "R$ 100", "100 reais", "100 reias", "valor 100,00").
 * Evita capturar números soltos como "final 1234".
 */
export const extractAmountCents = (text: string): number | null => {
  // Padrão 1: "R$ 100,00", "R$ 1.250", "R$100"
  const m1 = text.match(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
  if (m1) {
    const rawVal = m1[1];
    let normalized = rawVal;
    if (rawVal.includes(",") && rawVal.includes(".")) {
      normalized = rawVal.replace(/\./g, "").replace(",", ".");
    } else if (rawVal.includes(",")) {
      normalized = rawVal.replace(",", ".");
    }
    const num = Number(normalized);
    if (Number.isFinite(num) && num > 0) return Math.round(num * 100);
  }

  // Padrão 2: "100 reais", "100,50 reias", "150,00 reais"
  const m2 = text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:reais|reias)/i);
  if (m2) {
    const num = Number(m2[1].replace(",", "."));
    if (Number.isFinite(num) && num > 0) return Math.round(num * 100);
  }

  // Padrão 3: "valor (de) 100,00", "compra (de) 100,00"
  const m3 = text.match(/(?:valor|compra|pagamento)\s*(?:de|no valor de)?\s*R?\$\s*(\d+(?:[.,]\d{1,2})?)/i);
  if (m3) {
    const num = Number(m3[1].replace(",", "."));
    if (Number.isFinite(num) && num > 0) return Math.round(num * 100);
  }

  return null;
};

/** Extrai "10x", "em 10x", "10 vezes", "parcelado em 10" → 10, ou null. */
export const extractInstallments = (text: string): number | null => {
  const m = text.match(/(?:em\s*)?(\d{1,3})\s*(?:x|vezes|parcelas?)/i);
  if (m) return parseInt(m[1], 10);

  const m2 = text.match(/(?:parcelado|parcelamento)\s*(?:em\s*)?(\d{1,3})/i);
  if (m2) return parseInt(m2[1], 10);

  return null;
};

/** Extrai o nome do estabelecimento após "na | em | no | na loja | compra". */
export const extractMerchant = (text: string): string | null => {
  const m = text.match(
    /(?:na|em|no|nas|nos|para)\s+(?:loja\s+|estabelecimento\s+)?([A-Za-zÀ-ÿ0-9 .'&-]{2,60})/i,
  );
  if (m && m[1].trim()) return m[1].trim();

  // Tenta capturar palavra após "compra" (ex.: "compra colchao")
  const m2 = text.match(/(?:compra|gasto)\s+([A-Za-zÀ-ÿ0-9 .'&-]{2,50})/i);
  if (m2 && m2[1].trim()) return m2[1].trim();

  return null;
};

export const titleAndText = (raw: RawNotification): string => {
  return `${raw.title ?? ""} ${raw.text ?? ""}`.trim();
};