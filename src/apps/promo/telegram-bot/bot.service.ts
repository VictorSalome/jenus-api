import fetch from "node-fetch";
import { promoConfig } from "../config.js";
import * as logger from "../../../core/logger.js";
import * as botConfigRepo from "../telegram-bot-config/telegram-bot-config.repository.js";

/**
 * Strip Outlook SafeLinks wrapper if present.
 * e.g. https://na01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fapi.telegram.org%2FbotTOKEN%2FsendMessage
 * → 8924330809:AAHd-...
 */
function sanitizeBotToken(token: string | undefined): string | undefined {
  if (!token) return undefined;
  if (!token.includes("safelinks.protection.outlook.com")) return token;

  try {
    const url = new URL(token);
    const realUrl = url.searchParams.get("url");
    if (realUrl) {
      const parsed = new URL(realUrl);
      // Extract just the token from /bot<TOKEN>/sendMessage
      const match = parsed.pathname.match(/^\/bot(.+)\/sendMessage$/);
      if (match) {
        logger.warn("BOT_TOKEN estava com URL SafeLinks — token extraído automaticamente", "Bot");
        return match[1];
      }
    }
  } catch {}

  logger.warn("BOT_TOKEN parece ser uma URL SafeLinks inválida — verifique o .env", "Bot");
  return token;
}

/**
 * Credenciais do bot: prioriza a config salva pelo app (permite trocar o
 * token sem redeploy, importante se o token vazar/for comprometido) e cai
 * pro .env só quando nunca foi configurado nada pelo app.
 */
async function getBotCredentials(): Promise<{ token: string | undefined; groupId: string | undefined }> {
  const saved = await botConfigRepo.getConfig();
  if (saved) {
    return { token: sanitizeBotToken(saved.botToken), groupId: saved.groupId };
  }
  return {
    token: sanitizeBotToken(promoConfig.TELEGRAM_BOT_TOKEN),
    groupId: promoConfig.TELEGRAM_BOT_GROUP_ID,
  };
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const { token: BOT_TOKEN, groupId: GROUP_ID } = await getBotCredentials();

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
