import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { verificarSessaoSalva } from "../src/apps/curriculos/scraper/linkedin/linkedin-session.service.js";
import { pathConfig } from "../src/apps/curriculos/config/index.js";

async function runPipelineTests() {
  console.log("=========================================================");
  console.log("  🧪 TESTES DO ORQUESTRADOR DO PIPELINE (FASE 4)");
  console.log("=========================================================\n");

  const cwd = path.resolve(process.cwd());

  // ── 1. Testar flag --help / -h
  console.log("1. Testando exibição de ajuda (--help e -h)...");
  const outputHelp = execSync("npm run pipeline:curriculo -- --help", { cwd, encoding: "utf-8" });
  assert.ok(outputHelp.includes("npm run pipeline:curriculo [opções]"), "Deve conter instrução de uso");
  assert.ok(outputHelp.includes("--preview"), "Deve listar flag --preview");
  assert.ok(outputHelp.includes("--queries"), "Deve listar flag --queries");
  assert.ok(outputHelp.includes("--override-email"), "Deve listar flag --override-email");
  assert.ok(outputHelp.includes("--sem-ia"), "Deve listar flag --sem-ia");
  assert.ok(outputHelp.includes("--com-ia"), "Deve listar flag --com-ia");
  assert.ok(outputHelp.includes("--skip-scrape"), "Deve listar flag --skip-scrape");
  console.log("   ✅ --help exibido corretamente com todas as flags documentadas");

  // ── 2. Testar validação de sessão LinkedIn ausente / inválida
  console.log("\n2. Testando comportamento quando sessão do LinkedIn é inválida...");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-test-"));
  const invalidSessionFile = path.join(tempDir, "invalid-session.json");
  fs.writeFileSync(invalidSessionFile, JSON.stringify({ cookies: [] }), "utf-8");

  const checkRes = verificarSessaoSalva(invalidSessionFile);
  assert.equal(checkRes.valida, false, "Sessão sem li_at deve ser inválida");
  assert.ok(checkRes.motivo?.includes("li_at"), "Motivo deve apontar cookie li_at");
  console.log("   ✅ Função verificarSessaoSalva rejeita sessão sem li_at");

  // ── 3. Testar pipeline em modo --skip-scrape e --preview
  console.log("\n3. Testando execução do pipeline em modo --skip-scrape e --preview...");
  const outputPreview = execSync(
    "npm run pipeline:curriculo -- --skip-scrape --preview --override-email=teste@sandbox.com",
    { cwd, encoding: "utf-8" },
  );

  assert.ok(outputPreview.includes("PREVIEW (somente leitura - sem disparos)"), "Deve indicar modo preview");
  assert.ok(outputPreview.includes("PULADO (--skip-scrape)"), "Deve indicar que scraper foi pulado");
  assert.ok(outputPreview.includes("teste@sandbox.com"), "Deve registrar email de override");
  assert.ok(outputPreview.includes("ETAPA 5: Inicializando banco de dados"), "Deve inicializar banco");
  assert.ok(outputPreview.includes("ETAPA 6: Gerando preview e analisando elegibilidade"), "Deve analisar elegibilidade");
  assert.ok(outputPreview.includes("ETAPA 12: Garantindo limpeza de arquivos residuais"), "Deve executar etapa 12");
  assert.ok(outputPreview.includes("RELATÓRIO CONSOLIDADO DO PIPELINE"), "Deve gerar relatório consolidado");
  assert.ok(outputPreview.includes("Cota restante na hora atual"), "Deve exibir cota horária restante");
  assert.ok(outputPreview.includes("Cota restante no dia (24h)"), "Deve exibir cota diária restante");
  console.log("   ✅ Pipeline executa ponta a ponta em modo preview com relatório completo");

  // ── 4. Testar limpeza de arquivos residuais na pasta temp/
  console.log("\n4. Testando limpeza de arquivos residuais na pasta temp/...");
  const fakePdf = path.join(pathConfig.temp, `test_residual_${Date.now()}.pdf`);
  const fakeTmp = path.join(pathConfig.temp, `test_residual_${Date.now()}.tmp`);
  fs.writeFileSync(fakePdf, "dummy pdf", "utf-8");
  fs.writeFileSync(fakeTmp, "dummy tmp", "utf-8");
  assert.equal(fs.existsSync(fakePdf), true, "Arquivo dummy pdf deve existir antes da limpeza");
  assert.equal(fs.existsSync(fakeTmp), true, "Arquivo dummy tmp deve existir antes da limpeza");

  // Executar pipeline (que chama etapa 12)
  execSync("npm run pipeline:curriculo -- --skip-scrape --preview", { cwd, encoding: "utf-8" });

  assert.equal(fs.existsSync(fakePdf), false, "Arquivo dummy pdf deve ter sido removido na limpeza");
  assert.equal(fs.existsSync(fakeTmp), false, "Arquivo dummy tmp deve ter sido removido na limpeza");
  console.log("   ✅ Limpeza de arquivos residuais em temp/ executada com sucesso");

  // Cleanup dir temporário
  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log("\n=========================================================");
  console.log("  🎉 TODOS OS TESTES DO PIPELINE PASSARAM COM SUCESSO!");
  console.log("=========================================================\n");
}

runPipelineTests().catch((err) => {
  console.error("❌ Falha nos testes do pipeline:", err);
  process.exit(1);
});
