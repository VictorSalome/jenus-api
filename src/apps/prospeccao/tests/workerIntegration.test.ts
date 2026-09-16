import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { fileURLToPath } from "url";
import path from "path";

// 1. Apontar o worker para o mock ANTES de qualquer import estático que puxe o workerManager
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ext = path.extname(__filename);
process.env.SCRAPER_WORKER_PATH = path.resolve(__dirname, `mockWorker${ext}`);

import { initDb } from "../../../core/database.js";
import { generateAccessToken } from "../../../shared/auth/jwt-auth.js";

interface TestStats {
  passed: number;
  failed: number;
  modules: { name: string; status: "OK" | "FAIL"; error?: string }[];
}

const stats: TestStats = {
  passed: 0,
  failed: 0,
  modules: [],
};

async function runStep(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ⏳ ${name}... `);
  try {
    await fn();
    stats.passed++;
    stats.modules.push({ name, status: "OK" });
    console.log("✅ OK");
  } catch (err: any) {
    stats.failed++;
    const errMsg = err?.message || String(err);
    stats.modules.push({ name, status: "FAIL", error: errMsg });
    console.log(`❌ FALHOU: ${errMsg}`);
  }
}

export async function runWorkerIntegrationTests() {
  console.log("=======================================================================");
  console.log("🚀 INICIANDO TESTES DE INTEGRAÇÃO EXPRESS -> WORKER");
  console.log("=======================================================================\n");

  await initDb();
  
  // Usar import dinâmico para garantir que process.env foi aplicado
  const { default: prospeccaoRouter } = await import("../routes/prospeccao.routes.js");
  const { setExecutarCicloOverride } = await import("../services/scheduler.service.js");

  const app = express();
  app.use(express.json());
  app.use("/api/prospeccao", prospeccaoRouter);
  
  // Garantir que NÃO estamos mockando o ExecutarCiclo, queremos testar o fluxo real até o Worker.
  setExecutarCicloOverride(null);

  const server = http.createServer(app);
  let port = 0;

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      port = (server.address() as any).port;
      resolve();
    });
  });

  const BASE_URL = `http://127.0.0.1:${port}`;
  const TEST_TOKEN = generateAccessToken({ id: "test", email: "test@local", role: "admin" });

  async function api(path: string, options: RequestInit = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
        ...(options.headers || {}),
      },
    });
    const data = (await res.json().catch(() => null)) as any;
    return { status: res.status, ok: res.ok, data };
  }

  try {
    // Teste sincrono que envia termo e espera o worker retornar success (usando nosso Mock)
    await runStep("Express -> Worker (Síncrono)", async () => {
      const res = await api("/api/prospeccao/executar", {
        method: "POST",
        body: JSON.stringify({ termo: "TEST_SUCCESS", limite: 10 }),
      });
      
      assert.equal(res.status, 200, "Deve retornar 200 OK");
      assert.equal(res.data.success, true);
      assert.ok(res.data.data, "Deve conter dados de retorno do ciclo");
    });
    
    await runStep("Express -> Worker (Assíncrono)", async () => {
      const res = await api("/api/prospeccao/executar", {
        method: "POST",
        body: JSON.stringify({ termo: "TEST_SUCCESS", limite: 10, async: true }),
      });
      
      assert.equal(res.status, 202, "Deve retornar 202 Accepted para execução em segundo plano");
      assert.equal(res.data.success, true);
      assert.equal(res.data.message, "Mineração iniciada em segundo plano");
      
      // Checar progresso após iniciar assíncrono
      const prog = await api("/api/prospeccao/progresso");
      assert.equal(prog.status, 200);
      assert.equal(prog.data.success, true);
    });

  } catch (globalErr) {
    console.error("\n❌ Erro fatal durante a execução dos testes:", globalErr);
  } finally {
    server.close();
    
    console.log("\n=======================================================================");
    console.log("📊 RESUMO DOS TESTES DE INTEGRAÇÃO");
    console.log("=======================================================================");
    console.log(`✅ Sucessos: ${stats.passed}`);
    console.log(`❌ Falhas:   ${stats.failed}`);
    console.log(`📈 Taxa:     ${((stats.passed / (stats.passed + stats.failed || 1)) * 100).toFixed(1)}%`);
    console.log("=======================================================================\n");

    if (stats.failed > 0) {
      process.exit(1);
    } else {
      console.log("🎉 TODOS OS TESTES PASSARAM COM SUCESSO! (100%)");
      process.exit(0);
    }
  }
}

if (process.argv[1]?.endsWith("workerIntegration.test.ts")) {
  runWorkerIntegrationTests().catch((e) => {
    console.error("Erro não capturado:", e);
    process.exit(1);
  });
}
