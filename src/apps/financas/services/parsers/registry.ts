import type { NotificationParser, RawNotification, ParsedNotification } from "./types.js";
import { nubankParser } from "./nubank.parser.js";
import { mercadoPagoParser } from "./mercado-pago.parser.js";
import { amazonParser } from "./amazon.parser.js";
import { brazilBankParser } from "./brazil-bank.parser.js";

/**
 * Registry de parsers de notificações. Para adicionar um novo banco/app,
 * basta criar um parser com a interface NotificationParser e registrá-lo aqui.
 */
export const parsers: NotificationParser[] = [
  nubankParser,
  mercadoPagoParser,
  amazonParser,
  brazilBankParser,
];

export const parseNotification = (
  raw: RawNotification,
): { parser: NotificationParser; data: ParsedNotification } | null => {
  for (const parser of parsers) {
    if (parser.matches(raw)) {
      const data = parser.parse(raw);
      if (data) return { parser, data };
    }
  }
  return null;
};