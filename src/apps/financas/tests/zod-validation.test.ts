import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { initDb, getDb } from "../../../core/database.js";
import { config } from "../../../core/config.js";
import authApp from "../../../apps/auth/index.js";
import financasRouter from "../routes/financas.routes.js";
import { globalErrorHandler } from "../../../shared/http/index.js";
import { seedHouseholdDatabase } from "../migrations/index.js";

interface TestStats {
  passed: number;
  failed: number;
  steps: { name: string; status: "OK" | "FAIL"; error?: string }[];
}

const stats: TestStats = {
  passed: 0,
  failed: 0,
  steps: [],
};

async function runStep(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ⏳ ${name}... `);
  try {
    await fn();
    stats.passed++;
    stats.steps.push({ name, status: "OK" });
    console.log("✅ OK");
  } catch (err: any) {
    stats.failed++;
    const errMsg = err?.message || String(err);
    stats.steps.push({ name, status: "FAIL", error: errMsg });
    console.log(`❌ FALHOU: ${errMsg}`);
    throw err;
  }
}

export async function runZodValidationTests() {
  console.log("=======================================================================");
  console.log("🛡️  SUÍTE DE TESTES: VALIDAÇÃO HTTP COM ZOD E PROTEÇÃO DE CONTROLLERS");
  console.log("=======================================================================\n");

  await initDb();
  const db = await getDb();
  await seedHouseholdDatabase(db);

  // Servidor Express efêmero para testes HTTP ponta a ponta
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authApp);
  app.use("/api/financas", financasRouter);
  app.use(globalErrorHandler);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as any;
  const BASE_URL = `http://127.0.0.1:${address.port}`;
  console.log(`📡 Servidor de teste ouvindo em: ${BASE_URL}\n`);

  async function api(path: string, options: RequestInit = {}, token?: string) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });

    const contentType = res.headers.get("content-type") || "";
    let data: any = null;
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    return { status: res.status, ok: res.ok, data, headers: res.headers };
  }

  // Token para uso nos testes
  let victorToken = "";

  try {
    console.log("📌 [SETUP] Autenticação");

    await runStep("Autenticação de Victor ('vssousa')", async () => {
      const vRes = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: "vssousa", password: "Iphone5s.@" }),
      });
      assert.equal(vRes.status, 200);
      victorToken = vRes.data.accessToken;
    });

    console.log("\n📌 [CENÁRIO 1] Validação de Body (Campos faltantes ou tipos errados)");
    
    await runStep("1. POST payload com tipo errado deve retornar HTTP 400 sem atingir o controller", async () => {
      const res = await api("/api/financas/categories", {
        method: "POST",
        body: JSON.stringify({ 
          name: 12345, // deveria ser string
          type: "expense" 
        }),
      }, victorToken);
      
      assert.equal(res.status, 400);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.code, "VALIDATION_ERROR");
      assert.ok(res.data.error.details, "Deve conter detalhes do ZodError");
    });

    await runStep("2. POST payload com campo faltando (nome obrigatório) deve retornar HTTP 400", async () => {
      const res = await api("/api/financas/categories", {
        method: "POST",
        body: JSON.stringify({ 
          type: "expense" // Falta o 'name'
        }),
      }, victorToken);
      
      assert.equal(res.status, 400);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.code, "VALIDATION_ERROR");
      assert.ok(res.data.error.details, "Deve conter detalhes do ZodError");
    });

    console.log("\n📌 [CENÁRIO 2] Validação e Coerção de Query Params");

    await runStep("1. Query ?limit=999999 coagido ou rejeitado pelo Zod", async () => {
      const res = await api("/api/financas/categories?limit=999999", { method: "GET" }, victorToken);
      
      // PaginationQuerySchema tem um .max(100), logo deve falhar
      assert.equal(res.status, 400, "Deve falhar por estourar o limite max de 100");
      assert.equal(res.data.error.code, "VALIDATION_ERROR");
    });
    
    await runStep("2. Query ?limit=abc falha por erro de coerção (NaN)", async () => {
      const res = await api("/api/financas/categories?limit=abc", { method: "GET" }, victorToken);
      
      assert.equal(res.status, 400, "Deve falhar pois abc não pode ser convertido para número");
      assert.equal(res.data.error.code, "VALIDATION_ERROR");
    });

    console.log("\n📌 [CENÁRIO 3] Validação de Path Params");
    
    await runStep("1. Path :id inválido (não numérico) deve retornar HTTP 400", async () => {
      const res = await api("/api/financas/transactions/abc", { method: "GET" }, victorToken);
      
      assert.equal(res.status, 400, "Deve falhar na validação do ID param");
      assert.equal(res.data.error.code, "VALIDATION_ERROR");
    });
    
    await runStep("2. Path :id negativo deve retornar HTTP 400", async () => {
      const res = await api("/api/financas/transactions/-5", { method: "GET" }, victorToken);
      
      assert.equal(res.status, 400, "Deve falhar na validação do ID param pois não é positivo");
      assert.equal(res.data.error.code, "VALIDATION_ERROR");
    });

    console.log("\n📌 [CENÁRIO 4] Stripping de Campos Maliciosos");

    await runStep("1. Campos desconhecidos injetados maliciosamente no body são ignorados no controller (stripping)", async () => {
      const uniqueName = `Categoria Teste Strip ${Date.now()}`;
      
      const res = await api("/api/financas/categories", {
        method: "POST",
        body: JSON.stringify({ 
          name: uniqueName,
          type: "expense",
          isAdmin: true, // Campo que o Zod deve dar strip
          hacked_id: 9999, // Campo não especificado
        }),
      }, victorToken);
      
      assert.equal(res.status, 201, "Criação deve ocorrer com sucesso");
      assert.equal(res.data.data.name, uniqueName, "Nome esperado na criação");
      
      // O objeto retornado (que normalmente espelha o banco) não deve conter os campos injetados
      assert.equal(res.data.data.isAdmin, undefined, "Campo isAdmin deve ter sido removido");
      assert.equal(res.data.data.hacked_id, undefined, "Campo hacked_id deve ter sido removido");

      // Verificação extra diretamente no banco para garantir
      const catId = res.data.data.id;
      const row = await db.get("SELECT * FROM fin_categories WHERE id = ?", catId);
      
      assert.equal(row.name, uniqueName);
      
      // Apenas para confirmar não há lixo adicional:
      const rowKeys = Object.keys(row);
      assert.ok(!rowKeys.includes("isAdmin"), "Tabela fin_categories não deve ter armazenado isAdmin");
      
      // Apagamos a categoria de teste
      await db.run("DELETE FROM fin_categories WHERE id = ?", catId);
    });

    console.log("\n📌 [CENÁRIO 5] globalErrorHandler mapeia ZodError para HTTP 400");
    await runStep("1. Status final validado como 400 em invocações falhas por erro do Zod", async () => {
      const res = await api("/api/financas/categories", {
        method: "POST",
        body: JSON.stringify({}),
      }, victorToken);
      
      // ZodError foi emitido pelo validateBody e deve ter sido capturado pelo handler 
      assert.equal(res.status, 400, "Deve ser capturado com HTTP 400 pelo globalErrorHandler");
      assert.equal(res.data.error.code, "VALIDATION_ERROR", "Código de erro formatado pelo globalErrorHandler");
      assert.equal(res.data.error.status, 400);
      assert.ok(Array.isArray(res.data.error.details), "Deve conter o array de erros emitido pelo Zod");
    });

    console.log("\n=======================================================================");
    console.log("🛡️  TODOS OS TESTES DE VALIDAÇÃO ZOD PASSARAM COM SUCESSO!");
    console.log(`📊 Estatísticas: ${stats.passed} passos executados, 0 falhas.`);
    console.log("=======================================================================");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// Execução direta via tsx
if (process.argv[1]?.endsWith("zod-validation.test.ts")) {
  runZodValidationTests().catch((err) => {
    console.error("\n❌ ERRO FATAL NA EXECUÇÃO DOS TESTES DE VALIDAÇÃO ZOD:", err);
    process.exit(1);
  });
}
