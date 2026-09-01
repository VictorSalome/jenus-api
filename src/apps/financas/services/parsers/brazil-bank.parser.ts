import type { NotificationParser, RawNotification, ParsedNotification } from "./types.js";
import { extractAmountCents, extractInstallments, extractMerchant, titleAndText } from "./utils.js";

const PACKAGES = [
  "com.itau",
  "br.com.itau",
  "com.bradesco",
  "br.com.bradesco",
  "com.santander",
  "br.com.santander",
  "br.com.inter",
  "com.inter",
  "br.com.banco.bradesco",
];

const matches = (raw: RawNotification): boolean =>
  Boolean(
    raw.packageName &&
      PACKAGES.some((p) => raw.packageName!.includes(p)) &&
      /(compra|pagamento|parcel|débito|crédito|cartã|fatura)/i.test(titleAndText(raw)),
  );

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
    description: text.slice(0, 120),
  };
};

export const brazilBankParser: NotificationParser = {
  appLabel: "Bancos BR",
  matches,
  parse,
};