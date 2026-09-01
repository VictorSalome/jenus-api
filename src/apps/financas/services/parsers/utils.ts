import type { RawNotification } from "./types.js";

/**
 * Extrai um valor monetário COM prefixo "R$" (ex.: "R$ 1.234,56") → centavos.
 * O prefixo é obrigatório para não capturar números soltos do texto
 * (ex.: "Cartão final 1234" viraria R$ 12,34).
 */
export const extractAmountCents = (text: string): number | null => {
  const m = text.match(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/i);
  if (!m) return null;
  const normalized = m[1].replace(/\./g, "").replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) && num > 0 ? Math.round(num * 100) : null;
};

/** Extrai "10x", "em 10x", "10 vezes", "parcelado em 10" → 10, ou null. */
export const extractInstallments = (text: string): number | null => {
  const m = text.match(/(?:em\s*)?(\d{1,3})\s*(?:x|vezes|parcelas?)/i);
  if (m) return parseInt(m[1], 10);

  const m2 = text.match(/(?:parcelado|parcelamento)\s*(?:em\s*)?(\d{1,3})/i);
  if (m2) return parseInt(m2[1], 10);

  return null;
};

/** Extrai o nome do estabelecimento após "na | em | no | na loja". Primeira letra obrigatória. */
export const extractMerchant = (text: string): string | null => {
  const m = text.match(
    /(?:na|em|no|nas|nos)\s+(?:loja\s+|estabelecimento\s+)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .'&-]{1,60})/i,
  );
  return m ? m[1].trim() : null;
};

export const titleAndText = (raw: RawNotification): string => {
  return `${raw.title ?? ""} ${raw.text ?? ""}`.trim();
};