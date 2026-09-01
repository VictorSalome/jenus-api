import type { NotificationParser, RawNotification, ParsedNotification } from "./types.js";
import { extractAmountCents, extractInstallments, extractMerchant, titleAndText } from "./utils.js";

const PACKAGES = [
  "com.amazon.mShop.android.shopping",
  "com.amazon",
];

const matches = (raw: RawNotification): boolean =>
  Boolean(
    raw.packageName &&
      PACKAGES.some((p) => raw.packageName!.includes(p)) &&
      /(compra|pedido|confirm|pago|entrega|amazon)/i.test(titleAndText(raw)),
  );

const parse = (raw: RawNotification): ParsedNotification | null => {
  const text = titleAndText(raw);

  const amount = extractAmountCents(text);
  if (!amount) return null;

  const installments = extractInstallments(text);
  const merchant = "Amazon";

  return {
    amountCents: amount,
    installmentsTotal: installments ?? undefined,
    merchantName: merchant,
    description: text.slice(0, 120),
  };
};

export const amazonParser: NotificationParser = {
  appLabel: "Amazon",
  matches,
  parse,
};