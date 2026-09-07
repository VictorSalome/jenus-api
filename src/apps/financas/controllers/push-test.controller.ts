import { Request, Response } from "express";
import { processRawNotification } from "../services/notification-events.service.js";
import { sendPushNotification } from "../../promo/push/push.service.js";

/**
 * Central de Disparo de Push Notification de Teste (para Android e iOS).
 */
export const sendTestPush = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user?.userId || "vssousa";
  const { title, body, amount, merchant, screen } = req.body || {};

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

  // 2. Dispara o Push Notification via Expo / FCM para os dispositivos registrados
  let pushResult = { sent: 0, failed: 0 };
  try {
    pushResult = await sendPushNotification({
      title: pushTitle,
      body: pushBody,
      data: {
        screen: screen || "detected",
        amount,
        merchant,
        eventId: eventResult?.event?.id,
      },
      priority: "high",
    });
  } catch (e) {
    console.warn("Erro ao disparar push via Expo/FCM:", e);
  }

  res.status(200).json({
    success: true,
    message: `Push Notification enviado com sucesso! (${pushResult.sent} dispositivos notificados)`,
    data: {
      title: pushTitle,
      body: pushBody,
      event: eventResult?.event,
      pushResult,
    },
  });
};
