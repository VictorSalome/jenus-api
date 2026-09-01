import { getDb } from "../../../core/database.js";
import { DiscordWebhookConfig } from "./discord-webhook-config.types.js";

export const getConfig = async (): Promise<DiscordWebhookConfig | null> => {
  const db = await getDb();
  const row = await db.get(
    "SELECT * FROM promo_discord_webhook_config WHERE id = 1",
  );
  if (!row || !row.webhook_url) return null;

  return {
    id: row.id,
    webhookUrl: row.webhook_url,
    updatedAt: row.updated_at,
  };
};

export const saveConfig = async (webhookUrl: string): Promise<void> => {
  const db = await getDb();
  await db.run(
    `INSERT INTO promo_discord_webhook_config (id, webhook_url, updated_at)
     VALUES (1, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       webhook_url = excluded.webhook_url,
       updated_at = CURRENT_TIMESTAMP`,
    webhookUrl,
  );
};

export const clearConfig = async (): Promise<void> => {
  const db = await getDb();
  await db.run("DELETE FROM promo_discord_webhook_config WHERE id = 1");
};
