import { initDb } from "../src/core/database.js";
import { vagasEmailWorker } from "../src/apps/curriculos/automacao/vagasEmailWorker.service.js";

async function runTest() {
  console.log("=== INICIANDO TESTE DA AUTOMAÇÃO DE CURRÍCULOS ===");

  await initDb();

  console.log("\n1. Testando geração de Preview...");
  const preview = await vagasEmailWorker.gerarPreview({
    minScore: 70,
    dailyLimit: 20,
    windowHours: 72,
  });

  console.log(`- Total no feed: ${preview.totalNoFeed}`);
  console.log(`- Elegíveis (score >= 70%): ${preview.elegiveis.length}`);
  console.log(`- Puladas: ${preview.puladas.length}`);
  console.log(`- Envios últimas 24h: ${preview.enviosUltimas24h}`);
  console.log(`- Limite diário restante: ${preview.limiteDiarioRestante}`);

  console.log("\nTop 5 Vagas Mais Elegíveis:");
  preview.elegiveis.slice(0, 5).forEach((v, idx) => {
    console.log(
      `  ${idx + 1}. [${v.score}%] ${v.title} @ ${v.company} | ${v.contactEmail}`,
    );
  });

  if (preview.puladas.length > 0) {
    console.log("\nExemplos de Vagas Puladas:");
    preview.puladas.slice(0, 3).forEach((v, idx) => {
      console.log(
        `  ${idx + 1}. [${v.score}%] ${v.title} @ ${v.company} | Motivo: ${v.skipReason}`,
      );
    });
  }

  if (preview.elegiveis.length > 0) {
    const primeira = preview.elegiveis[0];
    console.log(`\n2. Testando Preview de Currículo para: ${primeira.title}...`);
    const curriculo = await vagasEmailWorker.gerarPreviewCurriculoVaga(primeira.jobId);
    console.log(`- Título Personalizado: ${curriculo.personalInfo.title}`);
    console.log(`- Resumo Gerado: ${curriculo.summary.substring(0, 120)}...`);
    console.log(`- Experiências filtradas: ${curriculo.experiences.length}`);
  }

  console.log("\n3. Testando Status do Worker...");
  const status = vagasEmailWorker.getStatus();
  console.log(`- Estado: ${status.state}`);
  console.log(`- Mensagem: ${status.mensagem}`);

  console.log("\n✅ Teste da automação executado com sucesso!");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("❌ Erro no teste:", err);
  process.exit(1);
});
