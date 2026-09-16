import { Request, Response } from "express";
import { processRawNotification } from "../services/notification-events.service.js";
import { sendPushNotification } from "../../promo/push/push.service.js";
import { getDb } from "../../../core/database.js";

interface BankPreset {
  packageName: string;
  appLabel: string;
  title: string;
  buildText: (amount: string, merchant: string, installments?: number) => string;
}

const BANK_PRESETS: Record<string, BankPreset> = {
  nubank: {
    packageName: "com.nu.production",
    appLabel: "Nubank",
    title: "Nubank",
    buildText: (amount, merchant, inst) =>
      inst && inst > 1
        ? `Compra aprovada de R$ ${amount} em ${inst}x no ${merchant}`
        : `Compra aprovada de R$ ${amount} no ${merchant}`,
  },
  itau: {
    packageName: "com.itau",
    appLabel: "Itaú",
    title: "Itaú Cartões",
    buildText: (amount, merchant, inst) =>
      inst && inst > 1
        ? `Compra aprovada no seu cartão em ${inst}x no valor total de R$ ${amount} em ${merchant}`
        : `Compra aprovada no seu cartão no valor de R$ ${amount} em ${merchant}`,
  },
  bradesco: {
    packageName: "com.bradesco",
    appLabel: "Bradesco",
    title: "Bradesco Cartões",
    buildText: (amount, merchant) =>
      `Compra aprovada R$ ${amount} em ${merchant}`,
  },
  inter: {
    packageName: "com.inter",
    appLabel: "Banco Inter",
    title: "Inter",
    buildText: (amount, merchant) =>
      `Compra no débito de R$ ${amount} realizada em ${merchant}`,
  },
  c6: {
    packageName: "com.c6bank",
    appLabel: "C6 Bank",
    title: "C6 Bank",
    buildText: (amount, merchant) =>
      `Compra aprovada no Cartão C6: R$ ${amount} em ${merchant}`,
  },
  mercadopago: {
    packageName: "com.mercadopago.wallet",
    appLabel: "Mercado Pago",
    title: "Mercado Pago",
    buildText: (amount, merchant) =>
      `Você pagou R$ ${amount} para ${merchant}`,
  },
};

export const simulatePurchaseNotification = async (req: Request, res: Response): Promise<void> => {
  const providedKey =
    (req.headers["x-webhook-key"] as string) ||
    (req.headers["x-api-key"] as string) ||
    (req.query.key as string) ||
    (req.body && req.body.key);

  const allowedKeys = (process.env.API_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const authenticatedUserId = (req as any).user?.userId;
  const isKeyValid = Boolean(
    providedKey &&
      (allowedKeys.includes(providedKey) || (allowedKeys.length === 0 && process.env.NODE_ENV !== "production")),
  );

  if (!authenticatedUserId && !isKeyValid) {
    res.status(401).json({
      success: false,
      message: "Acesso não autorizado. Envie um Bearer token válido ou header X-Webhook-Key / X-API-Key.",
    });
    return;
  }

  const userId =
    authenticatedUserId ||
    req.body?.userId ||
    (req.query?.userId as string) ||
    process.env.ADMIN_USERNAME ||
    "vssousa";

  const {
    bank,
    amount,
    merchant,
    installments,
    title,
    body,
    text,
    screen,
    token,
    packageName,
    appLabel,
    skipServerEvent,
  } = { ...req.query, ...req.body } as any;

  const bankKey = typeof bank === "string" ? bank.toLowerCase().trim() : "nubank";
  const preset = BANK_PRESETS[bankKey] || BANK_PRESETS.nubank;

  const finalMerchant =
    (typeof merchant === "string" && merchant.trim()) || "Supermercado Pão de Açúcar";

  let numAmount = 120.0;
  if (typeof amount === "number" && amount > 0) {
    numAmount = amount;
  } else if (typeof amount === "string") {
    const parsed = parseFloat(amount.replace("R$", "").replace(/\s/g, "").replace(",", "."));
    if (!isNaN(parsed) && parsed > 0) {
      numAmount = parsed;
    }
  }
  const formattedAmount = numAmount.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const parsedInstallments =
    typeof installments === "number" && installments > 1 ? installments : undefined;

  const rawPackageName = packageName || preset.packageName;
  const rawAppLabel = appLabel || preset.appLabel;
  const rawTitle = title || preset.title;
  const rawText =
    (typeof text === "string" && text.trim()) ||
    (typeof body === "string" && body.trim()) ||
    preset.buildText(formattedAmount, finalMerchant, parsedInstallments);

  let eventResult = null;
  const shouldSkipServerEvent = skipServerEvent === true || skipServerEvent === "true";
  if (!shouldSkipServerEvent) {
    try {
      eventResult = await processRawNotification(
        userId,
        {
          packageName: rawPackageName,
          appLabel: rawAppLabel,
          title: rawTitle,
          text: rawText,
          postTime: Date.now(),
        },
        { skipDispatch: true },
      );
    } catch (e) {
      console.warn("[PushSimulate] Erro ao registrar evento no banco:", e);
    }
  }

  const db = await getDb();
  let targetToken = token;
  let targetPlatform = "android";

  if (!targetToken) {
    const latestDevice = await db.get(
      `SELECT token, platform, last_used_at FROM promo_device_tokens
       WHERE is_active = 1 AND user_id = ?
       ORDER BY last_used_at DESC, id DESC LIMIT 1`,
      userId,
    );
    if (latestDevice) {
      targetToken = latestDevice.token;
      targetPlatform = latestDevice.platform;
    }
  }

  let eventParsedData = eventResult?.parsed;
  if (!eventParsedData && eventResult?.event?.parsed_json) {
    try {
      eventParsedData =
        typeof eventResult.event.parsed_json === "string"
          ? JSON.parse(eventResult.event.parsed_json)
          : eventResult.event.parsed_json;
    } catch {
      eventParsedData = null;
    }
  }

  const parsedMerchant = eventParsedData?.merchantName || finalMerchant;
  const parsedAmount = eventParsedData?.amountCents
    ? (eventParsedData.amountCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
    : formattedAmount;

  const pushTitle = title || `💳 ${parsedMerchant}`;
  const pushBody = body || `Compra de R$ ${parsedAmount} identificada. Toque para categorizar.`;

  const pushData: Record<string, string> = {
    screen: screen || "detected",
    route: "/(financas)/detected",
    typeId: "financas.transaction_detected",
    eventId: String(eventResult?.event?.id || ""),
    amount: String(numAmount),
    merchant: parsedMerchant,
    jenus_test_sim: "true",
    simulated_package: rawPackageName,
    is_test_notification: "true",
    simulated_title: rawTitle,
    simulated_text: rawText,
    appLabel: rawAppLabel,
  };

  let pushResult = { sent: 0, failed: 0 };
  try {
    pushResult = await sendPushNotification({
      title: pushTitle,
      body: pushBody,
      data: pushData,
      priority: "high",
      token: targetToken || undefined,
      userId: targetToken ? undefined : userId,
      android: {
        priority: "high",
        data: {
          jenus_test_sim: "true",
          simulated_package: rawPackageName,
          is_test_notification: "true",
          simulated_title: rawTitle,
          simulated_text: rawText,
          appLabel: rawAppLabel,
        },
      },
    });
  } catch (e: any) {
    console.warn("[PushSimulate] Erro ao disparar push:", e?.message || e);
  }

  try {
    await db.run(
      `INSERT INTO notifications_log (user_id, type_id, title, body, payload_json, fingerprint, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      userId,
      "financas.transaction_detected",
      pushTitle,
      pushBody,
      JSON.stringify(pushData),
      eventResult?.event?.fingerprint || null,
      pushResult.sent > 0 ? "sent" : "failed",
    );
  } catch {
    // best-effort
  }

  const delivered = pushResult.sent > 0;

  res.status(200).json({
    success: true,
    delivered,
    message: delivered
      ? `Simulação de compra concluída e push enviado com sucesso (${pushResult.sent} dispositivo notificado)!`
      : `Evento registrado em fin_notification_events (ID #${eventResult?.event?.id || "N/A"}), mas nenhum dispositivo ativo recebeu o push.`,
    data: {
      simulated: {
        bank: preset.appLabel,
        merchant: parsedMerchant,
        amount: numAmount,
        formattedAmount: `R$ ${parsedAmount}`,
        rawNotification: {
          packageName: rawPackageName,
          title: rawTitle,
          text: rawText,
        },
      },
      event: {
        id: eventResult?.event?.id,
        status: eventResult?.event?.status,
        parsed: Boolean(eventResult?.parsed),
        duplicate: Boolean(eventResult?.duplicate),
      },
      push: {
        sent: pushResult.sent,
        failed: pushResult.failed,
        token: targetToken
          ? `${targetToken.slice(0, 15)}...${targetToken.slice(-6)}`
          : null,
        platform: targetPlatform,
      },
    },
  });
};

export const sendTestPush = simulatePurchaseNotification;
