export interface RawNotification {
  packageName?: string;
  appLabel?: string;
  title?: string;
  text?: string;
  postTime?: number;
}

export interface ParsedNotification {
  amountCents: number;
  installmentsTotal?: number;
  merchantName?: string;
  description?: string;
  transactionDate?: string; // YYYY-MM-DD
}

export interface NotificationParser {
  /** Nome amigável do app (ex.: "Nubank"). */
  appLabel: string;
  /** Retorna true se este parser deve ser usado para a notificação. */
  matches(raw: RawNotification): boolean;
  /** Extrai os dados estruturados, ou null se não for uma compra. */
  parse(raw: RawNotification): ParsedNotification | null;
}