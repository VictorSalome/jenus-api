import { Request, Response } from "express";
import { processRawNotification } from "../services/notification-events.service.js";
import { createTransaction } from "../services/transactions.service.js";
import { ensureDefaultAccount } from "../services/accounts.service.js";

const DEFAULT_USER_ID = "vssousa";

/**
 * Endpoint de Webhook público chamado por Atalhos do iOS (Apple Shortcuts), Siri ou serviços de terceiros.
 * Suporta autenticação via Query Param `?key=...`, Header `X-Webhook-Key` ou Bearer Token.
 */
export const shortcutWebhook = async (req: Request, res: Response): Promise<void> => {
  const providedKey =
    (req.headers["x-webhook-key"] as string) ||
    (req.query.key as string) ||
    (req.body && req.body.key);

  const allowedKeys = (process.env.API_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const authenticatedUserId = (req as any).user?.userId;
  const isKeyValid = Boolean(providedKey && allowedKeys.includes(providedKey));

  if (!authenticatedUserId && !isKeyValid) {
    res.status(401).json({
      success: false,
      message: "Acesso não autorizado. Token Bearer válido ou chave de webhook (X-Webhook-Key / ?key=) obrigatória.",
    });
    return;
  }

  const userId = authenticatedUserId || req.body?.userId || DEFAULT_USER_ID;
  const body = req.body || {};

  // Caso 1: Envio de texto bruto de notificação/SMS (ex: "Compra de R$ 100,00 no Colchão aprovada")
  if (typeof body.text === "string" && body.text.trim()) {
    const rawText = body.text.trim();
    const appLabel = body.appLabel || body.card || "Apple Shortcut";
    const packageName = body.packageName || "com.apple.shortcuts";

    const result = await processRawNotification(userId, {
      packageName,
      appLabel,
      title: appLabel,
      text: rawText,
    });

    res.status(201).json({
      success: true,
      message: "Notificação processada com sucesso via iOS Shortcut",
      data: result,
    });
    return;
  }

  // Caso 2: Envio de dados estruturados pelo Atalho do iOS (amount, merchant, card, date)
  if (body.amount !== undefined || body.amountCents !== undefined) {
    let amountCents = 0;
    if (typeof body.amountCents === "number" && body.amountCents > 0) {
      amountCents = Math.round(body.amountCents);
    } else if (typeof body.amount === "number" && body.amount > 0) {
      amountCents = Math.round(body.amount * 100);
    } else if (typeof body.amount === "string") {
      const parsed = parseFloat(body.amount.replace(",", "."));
      if (!isNaN(parsed) && parsed > 0) {
        amountCents = Math.round(parsed * 100);
      }
    }

    if (amountCents <= 0) {
      res.status(400).json({ success: false, message: "Valor numérico inválido para a compra" });
      return;
    }

    const defaultAccountId = await ensureDefaultAccount(userId);
    const transactionDate =
      typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : new Date().toISOString().slice(0, 10);

    const merchantName = body.merchant || body.merchantName || body.description || "Apple Pay";
    const description = body.description || `Compra via Apple Pay (${merchantName})`;

    const result = await createTransaction(userId, {
      accountId: defaultAccountId,
      merchantName,
      description,
      amountCents,
      type: "debit",
      transactionDate,
      source: "IMPORT",
    });

    res.status(201).json({
      success: true,
      message: "Transação criada com sucesso via iOS Shortcut",
      data: result,
    });
    return;
  }

  res.status(400).json({
    success: false,
    message:
      "Formato de payload não reconhecido. Envie { text: '...' } ou { amount: 100.00, merchant: '...' }",
  });
};
