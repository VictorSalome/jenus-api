import { z } from "zod";

/**
 * Config específica desta app. Siga o mesmo padrão de core/config.ts e
 * apps/promo/config.ts: zod, com defaults sensatos, e SEM depender de
 * nenhuma variável que outra app já declara em core/config.ts.
 *
 * TODO: renomeie os campos abaixo (ou remova o exemplo) para as variáveis
 * reais desta app.
 */
const envSchema = z.object({
  // EXEMPLO_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Erro nas variáveis de ambiente do módulo <app>:");
  parsed.error.errors.forEach((err) => {
    console.error(`  - ${err.path.join(".")}: ${err.message}`);
  });
  process.exit(1);
}

// TODO: renomeie para <app>Config
export const templateConfig = parsed.data;
