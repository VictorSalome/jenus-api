import { initDb } from "../src/core/database.js";
import { vagasEmailWorker } from "../src/apps/curriculos/automacao/vagasEmailWorker.service.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: "run" as "preview" | "run",
    minScore: 70,
    hourlyLimit: 30,
    dailyLimit: 150,
    minDelay: 90,
    maxDelay: 150,
    overrideEmail: undefined as string | undefined,
    semIa: true,
  };

  for (const arg of args) {
    if (arg === "--preview" || arg === "-p") {
      options.mode = "preview";
    } else if (arg === "--run" || arg === "-r") {
      options.mode = "run";
    } else if (arg === "--sem-ia" || arg === "--semIa" || arg === "-s") {
      options.semIa = true;
    } else if (arg === "--com-ia" || arg === "--ia") {
      options.semIa = false;
    } else if (arg.startsWith("--score=")) {
      options.minScore = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--hourly-limit=")) {
      options.hourlyLimit = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--limit=")) {
      options.dailyLimit = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--min-delay=")) {
      options.minDelay = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--max-delay=")) {
      options.maxDelay = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--override-email=") || arg.startsWith("--test-email=")) {
      options.overrideEmail = arg.split("=")[1].trim();
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  console.log("==================================================");
  console.log("  🚀 JENUS - AUTOMAÇÃO DE CANDIDATURAS POR E-MAIL ");
  console.log("==================================================");

  await initDb();

  // 1. Sempre gera o Preview inicial
  console.log("\n📡 Consultando feed e calculando relevância das vagas...");
  const configCustom: Record<string, any> = {};
  if (options.minScore !== undefined) configCustom.minScore = options.minScore;
  if (options.hourlyLimit !== undefined) configCustom.hourlyLimit = options.hourlyLimit;
  if (options.dailyLimit !== undefined) configCustom.dailyLimit = options.dailyLimit;
  if (options.minDelay !== undefined) configCustom.minDelaySeconds = options.minDelay;
  if (options.maxDelay !== undefined) configCustom.maxDelaySeconds = options.maxDelay;
  if (options.overrideEmail !== undefined) configCustom.overrideEmail = options.overrideEmail;
  if (options.semIa !== undefined) configCustom.semIa = options.semIa;

  const preview = await vagasEmailWorker.gerarPreview(configCustom);

  console.log(`\n📊 Resumo da Análise:`);
  console.log(`   - Total no feed: ${preview.totalNoFeed} vagas`);
  console.log(`   - Elegíveis (Score >= ${preview.config.minScore}%): ${preview.elegiveis.length} vagas`);
  console.log(`   - Puladas: ${preview.puladas.length} vagas`);
  console.log(`   - Enviadas nesta hora: ${preview.enviosHoraAtual} / ${preview.config.hourlyLimit}`);
  console.log(`   - Limite horário restante nesta janela: ${preview.limiteHorarioRestante}`);
  console.log(`   - Envios nas últimas 24h: ${preview.enviosUltimas24h}`);
  console.log(`   - Limite diário restante: ${preview.limiteDiarioRestante}`);
  if (options.semIa) {
    console.log(`   - Modo: 📄 NORMAL / SEM IA (currículo padrão original do perfil)`);
  }

  if (preview.elegiveis.length > 0) {
    console.log(`\n🎯 Vagas Elegíveis Selecionadas:`);
    preview.elegiveis.slice(0, 10).forEach((v, idx) => {
      console.log(`   ${idx + 1}. [${v.score}%] ${v.title} @ ${v.company} -> ${v.contactEmail}`);
    });
    if (preview.elegiveis.length > 10) {
      console.log(`   ... e mais ${preview.elegiveis.length - 10} vagas`);
    }
  }

  // Se for apenas modo preview, encerra aqui
  if (options.mode === "preview") {
    console.log("\nℹ️  Modo Preview concluído! NENHUM e-mail foi enviado.");
    console.log("👉 Para executar o envio automático para as vagas:");
    console.log("   npm run curriculo:automacao");
    console.log("\n👉 Para testar antes no seu próprio e-mail:");
    console.log("   npm run curriculo:automacao -- --override-email=seu@email.com\n");
    process.exit(0);
  }

  // 2. Modo Execução
  if (preview.elegiveis.length === 0) {
    console.log("\n⚠️  Nenhuma vaga elegível para envio neste momento. Encerrando.");
    process.exit(0);
  }

  if (preview.limiteDiarioRestante <= 0) {
    console.log(`\n⚠️  Limite diário de ${preview.config.dailyLimit} envios já foi atingido nas últimas 24h. Encerrando.`);
    process.exit(0);
  }

  console.log("\n⚡ INICIANDO CICLO DE ENVIOS...");
  if (options.semIa) {
    console.log("📄 MODO NORMAL ATIVADO: Gerando currículos 100% fiéis ao perfil cadastrado (sem alterações dinâmicas).");
  }
  if (options.overrideEmail) {
    console.log(`🛡️  MODO TESTE ATIVADO: Todos os e-mails serão redirecionados para: ${options.overrideEmail}`);
  }

  // Tratamento de interrupção com Ctrl+C
  let encerrando = false;
  process.on("SIGINT", async () => {
    if (encerrando) return;
    encerrando = true;
    console.log("\n\n🛑 [Ctrl+C detectado] Solicitando parada segura do worker...");
    await vagasEmailWorker.parar("Cancelado pelo usuário via terminal (Ctrl+C)");
    console.log("✅ Worker parado com segurança. Até logo!\n");
    process.exit(0);
  });

  // Inicia o worker
  await vagasEmailWorker.iniciar(configCustom);

  // Loop de monitoramento em tempo real no terminal
  let ultimoStatusMsg = "";
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const status = vagasEmailWorker.getStatus();

    const infoLinha = `[${status.state}] Enviadas: ${status.enviadas} | Enviadas nesta hora: ${status.enviadasNestaHora} / ${status.hourlyLimit} | Falhas: ${status.falhas} | Restantes: ${status.aguardando} | ${status.mensagem}`;
    if (infoLinha !== ultimoStatusMsg) {
      console.log(`⏱️  ${infoLinha}`);
      ultimoStatusMsg = infoLinha;
    }

    if (status.proximaJanelaEmSegundos && status.proximaJanelaEmSegundos > 0) {
      const minRestantes = Math.floor(status.proximaJanelaEmSegundos / 60);
      const segRestantes = status.proximaJanelaEmSegundos % 60;
      process.stdout.write(`   ⏳ Limite horário atingido (${status.hourlyLimit}/h)! Próxima janela em ${minRestantes}m ${segRestantes}s (${status.proximaJanelaEmSegundos}s)...\r`);
    } else if (status.proximoEnvioEmSegundos && status.proximoEnvioEmSegundos > 0) {
      process.stdout.write(`   ⏳ Próximo envio em ${status.proximoEnvioEmSegundos}s...\r`);
    }

    if (status.state === "COMPLETED" || status.state === "STOPPED" || status.state === "FAILED") {
      console.log(`\n\n🏁 Ciclo finalizado com estado: ${status.state}`);
      console.log(`📈 Resumo Final:`);
      console.log(`   - Enviadas com sucesso: ${status.enviadas}`);
      console.log(`   - Enviadas nesta hora: ${status.enviadasNestaHora} / ${status.hourlyLimit}`);
      console.log(`   - Falhas: ${status.falhas}`);
      console.log(`   - Puladas: ${status.puladas}`);
      console.log(`   - Mensagem: ${status.mensagem}\n`);
      break;
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Erro na execução da automação:", err);
  process.exit(1);
});
