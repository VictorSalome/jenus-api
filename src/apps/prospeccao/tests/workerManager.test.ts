import assert from "node:assert/strict";
import { fileURLToPath } from "url";
import path from "path";

// Set environment variable before importing workerManager
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ext = path.extname(__filename);
process.env.SCRAPER_WORKER_PATH = path.resolve(__dirname, `mockWorker${ext}`);

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

export async function runWorkerTests() {
  const { scraperWorkerManager } = await import("../scraper/workerManager.js");

  console.log("=======================================================================");
  console.log("🚀 INICIANDO TESTES DO WORKER MANAGER DE PROSPECÇÃO");
  console.log("=======================================================================\n");

  try {
    // -------------------------------------------------------------------------
    // 1. Sucesso na execução do worker
    // -------------------------------------------------------------------------
    await runStep("Worker Manager - Deve retornar sucesso", async () => {
      let progressCalled = false;
      const res = await scraperWorkerManager.enqueue("TEST_SUCCESS", {
        headless: true,
        limite: 10,
        onProgress: (etapa, atual, total) => {
          progressCalled = true;
          assert.equal(etapa, "Iniciando");
        },
      });

      assert.ok(progressCalled, "A callback onProgress deve ter sido chamada");
      assert.equal((res as any).termo_busca, "TEST_SUCCESS");
      assert.equal((res as any).total_encontrado, 10);
    });

    // -------------------------------------------------------------------------
    // 2. Erro no worker propaga corretamente
    // -------------------------------------------------------------------------
    await runStep("Worker Manager - Deve propagar erro do worker", async () => {
      let errMessage = "";
      try {
        await scraperWorkerManager.enqueue("TEST_ERROR");
      } catch (err: any) {
        errMessage = err.message;
      }
      assert.equal(errMessage, "Erro forçado no worker");
    });

    // -------------------------------------------------------------------------
    // 3. Crash no worker (process.exit) é lidado corretamente
    // -------------------------------------------------------------------------
    await runStep("Worker Manager - Deve falhar se worker der exit", async () => {
      let errMessage = "";
      try {
        await scraperWorkerManager.enqueue("TEST_CRASH");
      } catch (err: any) {
        errMessage = err.message;
      }
      assert.ok(errMessage.includes("Worker encerrado prematuramente"));
    });

    // -------------------------------------------------------------------------
    // 4. Limite de concorrência e filas
    // -------------------------------------------------------------------------
    await runStep("Worker Manager - Concorrência e Filas", async () => {
      // Mandamos 4 tarefas. MAX_CONCURRENCY é 2 por padrão.
      const start = Date.now();
      
      const p1 = scraperWorkerManager.enqueue("TEST_CONCURRENCY_1");
      const p2 = scraperWorkerManager.enqueue("TEST_CONCURRENCY_2");
      const p3 = scraperWorkerManager.enqueue("TEST_CONCURRENCY_3");
      const p4 = scraperWorkerManager.enqueue("TEST_CONCURRENCY_4");
      
      // As tarefas 1 e 2 rodam em paralelo (levam ~200ms).
      // As tarefas 3 e 4 rodam em paralelo depois (levam mais ~200ms).
      // Total de tempo deve ser em torno de 400ms.
      const results = await Promise.all([p1, p2, p3, p4]);
      
      const timeTaken = Date.now() - start;
      
      assert.equal(results.length, 4);
      assert.equal((results[0] as any).termo_busca, "TEST_CONCURRENCY_1");
      assert.equal((results[3] as any).termo_busca, "TEST_CONCURRENCY_4");
      
      // Se fosse tudo em série, levaria 800ms. Se tudo paralelo, 200ms.
      // O limite é 2, então 2 batches de 200ms = 400ms.
      assert.ok(timeTaken >= 350, "Deve ter enfileirado as chamadas excedentes");
    });

    // -------------------------------------------------------------------------
    // 5. Timeout (Hard Kill)
    // -------------------------------------------------------------------------
    await runStep("Worker Manager - Deve matar worker se exceder o tempo limite", async () => {
      // Como o WORKER_TIMEOUT_MS é 15 min, não podemos esperar.
      // Então nós hackeamos o timeout da classe pra ser 100ms
      (scraperWorkerManager as any).WORKER_TIMEOUT_MS = 100;

      let errMessage = "";
      const start = Date.now();
      try {
        await scraperWorkerManager.enqueue("TEST_TIMEOUT");
      } catch (err: any) {
        errMessage = err.message;
      }
      const timeTaken = Date.now() - start;
      assert.ok(timeTaken < 200, "Timeout deve matar rapidamente o processo");
      assert.ok(errMessage.includes("timeout"), "Deve retornar mensagem de timeout");
      
      // Reseta o timeout da classe para evitar problemas depois (opcional)
      (scraperWorkerManager as any).WORKER_TIMEOUT_MS = 15 * 60 * 1000;
    });

  } catch (globalErr) {
    console.error("\n❌ Erro fatal durante a execução dos testes:", globalErr);
  } finally {
    console.log("\n=======================================================================");
    console.log("📊 RESUMO DOS TESTES DO WORKER MANAGER");
    console.log("=======================================================================");
    console.log(`✅ Sucessos: ${stats.passed}`);
    console.log(`❌ Falhas:   ${stats.failed}`);
    console.log(`📈 Taxa:     ${((stats.passed / (stats.passed + stats.failed || 1)) * 100).toFixed(1)}%`);
    console.log("=======================================================================\n");

    if (stats.failed > 0) {
      console.log("❌ Testes com falha:");
      for (const m of stats.modules.filter((mod) => mod.status === "FAIL")) {
        console.log(`  - ${m.name}: ${m.error}`);
      }
      process.exit(1);
    } else {
      console.log("🎉 TODOS OS TESTES PASSARAM COM SUCESSO! (100%)");
      process.exit(0);
    }
  }
}

// Se executado diretamente pelo tsx
if (process.argv[1]?.endsWith("workerManager.test.ts")) {
  runWorkerTests().catch((e) => {
    console.error("Erro não capturado:", e);
    process.exit(1);
  });
}
