import fetch from "node-fetch";
import { promoConfig } from "../config.js";
import * as logger from "../../core/logger.js";

const BOT_TOKEN = promoConfig.TELEGRAM_BOT_TOKEN;
const GROUP_ID = promoConfig.TELEGRAM_BOT_GROUP_ID;

export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!BOT_TOKEN || !GROUP_ID) {
    logger.warn("TELEGRAM_BOT_TOKEN ou TELEGRAM_BOT_GROUP_ID não configurados", "Bot");
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: Number(GROUP_ID),
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });

    if (res.ok) {
      logger.info("Mensagem enviada ao grupo Telegram de teste", "Bot");
      return true;
    }

    const errText = await res.text().catch(() => "");
    logger.error(`Telegram Bot API retornou ${res.status}: ${errText}`, "Bot");
    return false;
  } catch (err) {
    logger.error(`Erro ao enviar mensagem Telegram: ${err}`, "Bot");
    return false;
  }
}
