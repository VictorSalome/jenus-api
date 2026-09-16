#!/usr/bin/env node
import { verificarSessaoSalva, obterCaminhoSessao } from "../src/apps/curriculos/scraper/linkedin/linkedin-session.service.js";
import { executarScraperVagas } from "../src/apps/curriculos/scraper/scraper.service.js";
import { adquirirLockScraper } from "../src/apps/curriculos/scraper/scraper-lock.js";

function parseArgs() {
  const args = process.argv.slice(2);
  let maxQueries: number | undefined = undefined;
  let maxPages: number | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--maxQueries=") || arg.startsWith("--max-queries=")) {
      maxQueries = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--maxQueries" || arg === "-q") {
      maxQueries = parseInt(args[++i], 10);
    } else if (arg.startsWith("--maxPages=") || arg.startsWith("--max-pages=")) {
      maxPages = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--maxPages" || arg === "-p") {
      maxPages = parseInt(args[++i], 10);
    }
  }

  return { maxQueries, maxPages };
}

async function main() {
  const { maxQueries, maxPages } = parseArgs();

  console.log("=========================================================");
  console.log("  🔍 LINKEDIN: SCRAPER DE VAGAS EM MODO SOMENTE LEITURA");
  console.log("=========================================================\n");

  // Lock de execução: impede múltiplas instâncias simultâneas do Scraper
  const lock = adquirirLockScraper();
  if (!lock.adquirido) {
    console.warn(`⚠️  [Lock] Execução ativa do Scraper do LinkedIn detectada (PID: ${lock.pidExistente}).`);
    console.warn("   Evitando concorrência de processos e abertura redundante de sessões do Chromium.");
    console.warn("   Encerrando execução de forma limpa.\n");
    process.exit(0);
  }

  try {
    const sessionPath = obterCaminhoSessao();
    console.log("1. Validando sessão do LinkedIn...");
    const statusSessao = verificarSessaoSalva(sessionPath);

    if (!statusSessao.valida) {
      console.error(`\n❌ Sessão inválida ou não encontrada: ${statusSessao.motivo}`);
      console.error("👉 Execute primeiro o comando de login assistido:");
      console.error("   npm run linkedin:login\n");
      process.exit(1);
    }

    console.log("   ✅ Sessão válida confirmada.");
    if (statusSessao.diasRestantes !== undefined) {
      console.log(`   ⏳ Validade restante: ~${statusSessao.diasRestantes} dias`);
    }

    const limiteStr = maxQueries ? ` (limite: ${maxQueries} query${maxQueries > 1 ? "s" : ""})` : "";
    console.log(`\n2. Executando busca conservadora de posts${limiteStr} (somente leitura)...`);
    console.log("   (Sem interações sociais, sem cliques de candidatura, sem escrita)\n");

    const inicio = Date.now();
    const relatorio = await executarScraperVagas({
      ...(maxQueries !== undefined ? { maxSearchesPerRun: maxQueries } : {}),
      ...(maxPages !== undefined ? { maxPagesPerSearch: maxPages } : {}),
    });
    const duracaoSeg = Math.round((Date.now() - inicio) / 1000);

    console.log("=========================================================");
    console.log("  📊 RELATÓRIO DA COLETA DE VAGAS");
    console.log("=========================================================");
    console.log(`⏱️  Duração total: ${duracaoSeg}s`);
    console.log(`🔍 Buscas executadas: ${relatorio.buscasExecutadas}`);
    console.log(`📄 Páginas processadas: ${relatorio.paginasProcessadas}`);
    console.log(`📥 Total de posts encontrados: ${relatorio.postsEncontrados}`);
    console.log("─────────────────────────────────────────────────────────");
    console.log(`🚫 Descartados sem e-mail de contato: ${relatorio.descartadosSemEmail}`);
    console.log(`🔗 Descartados por sourceUrl inválida/ausente: ${relatorio.descartadosSemUrlCanonica}`);
    console.log(`📉 Descartados por confidence score (< 0.65): ${relatorio.descartadosPorConfidence}`);
    console.log(`⏳ Descartados por filtro temporal (> 24h): ${relatorio.descartadosPorData}`);
    console.log(`🔄 Duplicatas removidas: ${relatorio.duplicatasRemovidas}`);
    console.log(`⚠️  Erros de parsing/extração: ${relatorio.erros.length}`);
    console.log("─────────────────────────────────────────────────────────");
    console.log(`🎯 Vagas aprovadas finais: ${relatorio.vagasFinais}`);

    if (relatorio.queriesExecutadas && relatorio.queriesExecutadas.length > 0) {
      console.log("\n📈 Telemetria por Query:");
      console.log("─────────────────────────────────────────────────────────");
      relatorio.queriesExecutadas.forEach((q, idx) => {
        console.log(`[Query #${idx + 1}]`);
        console.log(`  Query: ${q.query}`);
        console.log(`  Tipo: ${q.type}`);
        console.log(`  Posts Encontrados: ${q.postsFound}`);
        console.log(`  Vagas Qualificadas: ${q.qualifiedJobs}`);
      });
    }

    if (relatorio.vagasColetadas.length > 0) {
      console.log("\n📋 Detalhamento das Vagas Aprovadas:");
      relatorio.vagasColetadas.forEach((vaga, idx) => {
        console.log(`\n[Vaga #${idx + 1}]`);
        console.log(`  Título: ${vaga.title}`);
        console.log(`  Empresa: ${vaga.company}`);
        console.log(`  E-mail: ${vaga.contactEmail}`);
        console.log(`  Horário da Publicação: ${vaga.postedAt || "N/D"}`);
        console.log(`  Score de Confiança: ${vaga.confidenceScore.toFixed(2)}`);
        console.log(`  URL Canônica: ${vaga.sourceUrl || "N/D"}`);
        console.log(`  Skills Identificadas: ${vaga.skills.join(", ") || "Geral"}`);
        console.log(`  Motivos Principais de Aceite:`);
        vaga.confidenceReasons.forEach((r) => console.log(`    • ${r}`));
      });
    }

    if (relatorio.erros.length > 0) {
      console.log("\n⚠️  Ocorrências durante a coleta:");
      relatorio.erros.forEach((err) => console.log(`  - ${err}`));
    }

    if (relatorio.arquivoGerado) {
      console.log(`\n💾 Arquivo gerado com sucesso: ${relatorio.arquivoGerado}`);
    }

    console.log("\n🔒 AVISO DE ISOLAMENTO: O worker de envio NÃO foi acionado.");
    console.log("   O arquivo gerado está disponível exclusivamente para auditoria e conferência.\n");
  } catch (err: any) {
    console.error(`\n❌ Erro durante a execução do scraper: ${err?.message || err}\n`);
    process.exitCode = 1;
  } finally {
    lock.liberar();
  }
}

main();
