import { Request, Response } from "express";
import { processRawNotification } from "../services/notification-events.service.js";
import { sendPushNotification } from "../../promo/push/push.service.js";

/**
 * Central de Disparo de Push Notification de Teste (para Android e iOS).
 */
export const sendTestPush = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user?.userId;
  if (!userId) {
    res.status(401).json({ success: false, message: "Acesso não autorizado." });
    return;
  }

  const { title, body, amount, merchant, screen, token } = req.body || {};

  const pushTitle = title || "Notificação de Teste";
  const pushBody = body || "Compra de R$ 120,00 no Supermercado aprovada";

  // 1. Processa no motor financeiro para salvar o evento no banco
  let eventResult = null;
  try {
    eventResult = await processRawNotification(userId, {
      packageName: "com.nu.production",
      appLabel: "Nubank Teste",
      title: pushTitle,
      text: pushBody,
    });
  } catch (e) {
    console.warn("Erro ao registrar evento no banco:", e);
  }

  // Extrai valores do evento parseado se não fornecidos explicitamente
  let finalAmount = amount;
  let finalMerchant = merchant;
  if (eventResult?.event?.parsed_json) {
    try {
      const parsed = typeof eventResult.event.parsed_json === 'string'
        ? JSON.parse(eventResult.event.parsed_json)
        : eventResult.event.parsed_json;
      if (finalAmount === undefined && parsed?.amountCents) {
        finalAmount = (parsed.amountCents / 100).toFixed(2);
      }
      if (finalMerchant === undefined && parsed?.merchantName) {
        finalMerchant = parsed.merchantName;
      }
    } catch {
      // best-effort
    }
  }

  const pushData: Record<string, string> = {
    screen: screen || "detected",
  };
  if (finalAmount !== undefined && finalAmount !== null) {
    pushData.amount = String(finalAmount);
  }
  if (finalMerchant !== undefined && finalMerchant !== null) {
    pushData.merchant = String(finalMerchant);
  }
  if (eventResult?.event?.id !== undefined && eventResult?.event?.id !== null) {
    pushData.eventId = String(eventResult.event.id);
  }

  // 2. Dispara o Push Notification (FCM, Expo ou Simulador) para o usuário ou token fornecido
  let pushResult = { sent: 0, failed: 0 };
  try {
    pushResult = await sendPushNotification({
      title: pushTitle,
      body: pushBody,
      data: pushData,
      priority: "high",
      token: token || undefined,
      userId: token ? undefined : userId,
    });
  } catch (e) {
    console.warn("Erro ao disparar push:", e);
  }

  const delivered = pushResult.sent > 0;

  res.status(200).json({
    success: delivered,
    message: delivered
      ? `Push Notification enviado com sucesso! (${pushResult.sent} dispositivos notificados)`
      : "Evento registrado, mas nenhum dispositivo ativo foi notificado.",
    data: {
      title: pushTitle,
      body: pushBody,
      event: eventResult?.event,
      pushResult,
    },
  });
};
