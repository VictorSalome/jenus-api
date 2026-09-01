import type { NotificationParser, RawNotification, ParsedNotification } from "./types.js";
import { extractAmountCents, extractInstallments, extractMerchant, titleAndText } from "./utils.js";

const PACKAGES = [
  "com.nu.production",
  "com.nu",
  "br.com.nubank",
];

const matches = (raw: RawNotification): boolean =>
  Boolean(
    raw.packageName &&
      PACKAGES.some((p) => raw.packageName!.includes(p)) &&
      /(compra|pagamento|parcel)/i.test(titleAndText(raw)),
  );

const parse = (raw: RawNotification): ParsedNotification | null => {
  const text = titleAndText(raw);

  // "Compra de R$ 1.200,00 em 10x de R$ 120,00" | "Compra no valor de R$ X em Y"
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

export const nubankParser: NotificationParser = {
  appLabel: "Nubank",
  matches,
  parse,
};