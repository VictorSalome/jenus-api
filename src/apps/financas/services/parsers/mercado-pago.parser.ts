import type { NotificationParser, RawNotification, ParsedNotification } from "./types.js";
import { extractAmountCents, extractInstallments, extractMerchant, titleAndText } from "./utils.js";

const PACKAGES = [
  "com.mercadolibre",
  "com.mercadopago",
  "br.com.mercadolivre",
  "br.com.mercadopago",
];

const matches = (raw: RawNotification): boolean =>
  Boolean(
    raw.packageName &&
      PACKAGES.some((p) => raw.packageName!.includes(p)) &&
      /(compra|pagamento|pago|aprovad)/i.test(titleAndText(raw)),
  );

const parse = (raw: RawNotification): ParsedNotification | null => {
  const text = titleAndText(raw);

  const amount = extractAmountCents(text);
  if (!amount) return null;

  const installments = extractInstallments(text);
  const merchant = extractMerchant(text);

  return {
    amountCents: amount,
    installmentsTotal: installments ?? undefined,
    merchantName: merchant ?? undefined,
    description: text.slice(0, 120),
  };
};

export const mercadoPagoParser: NotificationParser = {
  appLabel: "Mercado Pago",
  matches,
  parse,
};