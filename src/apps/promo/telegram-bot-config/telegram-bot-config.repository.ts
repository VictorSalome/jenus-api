import { getDb } from "../../../core/database.js";
import { TelegramBotConfig } from "./telegram-bot-config.types.js";

export const getConfig = async (): Promise<TelegramBotConfig | null> => {
  const db = await getDb();
  const row = await db.get(
    "SELECT * FROM promo_telegram_bot_config WHERE id = 1",
  );
  if (!row || !row.bot_token) return null;

  return {
    id: row.id,
    botToken: row.bot_token,
    groupId: row.group_id,
    updatedAt: row.updated_at,
  };
};

export const saveConfig = async (
  botToken: string,
  groupId: string,
): Promise<void> => {
  const db = await getDb();
  await db.run(
    `INSERT INTO promo_telegram_bot_config (id, bot_token, group_id, updated_at)
     VALUES (1, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       bot_token = excluded.bot_token,
       group_id = excluded.group_id,
       updated_at = CURRENT_TIMESTAMP`,
    botToken,
    groupId,
  );
};

export const clearConfig = async (): Promise<void> => {
  const db = await getDb();
  await db.run("DELETE FROM promo_telegram_bot_config WHERE id = 1");
};
