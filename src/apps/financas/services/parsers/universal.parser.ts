import type { NotificationParser, RawNotification, ParsedNotification } from "./types.js";
import { extractAmountCents, extractInstallments, extractMerchant, titleAndText } from "./utils.js";

/**
 * Parser Universal para Notificações Bancárias e Atalhos do iOS/Android.
 * Identifica automaticamente qualquer notificação de compra, Pix, boleto ou cartão
 * que contenha valor monetário (R$ 100,00 ou 100 reais/reias) e termos de transação.
 */
const KEYWORDS = /(compra|pagamento|parcel|débito|crédito|cartã|fatura|pix|transfer|aprovad|feita|realizad|gasto|cobrança|transação|valor|reais|reias|uber|ifood|mercado|amazon|magalu)/i;

const NON_FINANCE_APPS = [
  'telegram',
  'whatsapp',
  'discord',
  'instagram',
  'facebook',
  'twitter',
  'reddit',
  'tiktok',
  'youtube',
  'chrome',
  'browser',
  'firefox',
  'gmail',
  'outlook',
];

const matches = (raw: RawNotification): boolean => {
  const pkg = (raw.packageName || '').toLowerCase();
  const label = (raw.appLabel || '').toLowerCase();

  // Bloqueia categoricamente mensageiros, redes sociais e navegadores
  if (NON_FINANCE_APPS.some((app) => pkg.includes(app) || label.includes(app))) {
    return false;
  }

  const text = titleAndText(raw);
  return KEYWORDS.test(text) && Boolean(extractAmountCents(text));
};

const parse = (raw: RawNotification): ParsedNotification | null => {
  const text = titleAndText(raw);
  const amount = extractAmountCents(text);
  if (!amount) return null;

  const installments = extractInstallments(text);
  const merchant = extractMerchant(text) || undefined;

  return {
    amountCents: amount,
    installmentsTotal: installments ?? undefined,
    merchantName: merchant,
    description: text.slice(0, 140),
  };
};

export const universalParser: NotificationParser = {
  appLabel: "Notificação Geral",
  matches,
  parse,
};
