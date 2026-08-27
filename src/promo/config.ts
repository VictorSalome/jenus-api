import { z } from "zod";

const envSchema = z.object({
  API_ID: z.string().optional(),
  API_HASH: z.string().optional(),
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_GROUP_ID: z.string().optional(),
  CHECK_INTERVAL_SECONDS: z.string().default("30").transform(Number),
  MIN_TIME_BETWEEN_MESSAGES: z.string().default("30").transform(Number),
  URGENT_ENABLED: z.string().default("true").transform((v) => v === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Erro nas variáveis de ambiente do módulo promo:");
  parsed.error.errors.forEach((err) => {
    console.error(`  - ${err.path.join(".")}: ${err.message}`);
  });
  process.exit(1);
}

export const promoConfig = parsed.data;
