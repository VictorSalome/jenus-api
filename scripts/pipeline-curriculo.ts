#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { initDb, getDb } from "../src/core/database.js";
import {
  verificarSessaoSalva,
  obterCaminhoSessao,
} from "../src/apps/curriculos/scraper/linkedin/linkedin-session.service.js";
import { executarScraperVagas } from "../src/apps/curriculos/scraper/scraper.service.js";
import { adquirirLockScraper } from "../src/apps/curriculos/scraper/scraper-lock.js";
import { vagasEmailWorker } from "../src/apps/curriculos/automacao/vagasEmailWorker.service.js";
import { pathConfig } from "../src/apps/curriculos/config/index.js";
import type { AutomacaoConfig, SkipReason } from "../src/apps/curriculos/automacao/types.js";

interface PipelineOptions {
  preview: boolean;
  queries: number;
  overrideEmail?: string;
  semIa: boolean;
  skipScrape: boolean;
  help: boolean;
}

function parseArgs(): PipelineOptions {
  const args = process.argv.slice(2);
  const options: PipelineOptions = {
    preview: false,
    queries: 2,
    overrideEmail: undefined,
    semIa: true, // ponytail: default sem IA para envio determinístico e rápido sem custos de LLM
    skipScrape: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--preview" || arg === "-p") {
      options.preview = true;
    } else if (arg === "--skip-scrape") {
      options.skipScrape = true;
    } else if (arg === "--sem-ia") {
      options.semIa = true;
    } else if (arg === "--com-ia") {
      options.semIa = false;
    } else if (arg.startsWith("--queries=")) {
      options.queries = parseInt(arg.split("=")[1], 10) || 2;
    } else if (arg === "--queries" || arg === "-q") {
      options.queries = parseInt(args[++i], 10) || 2;
    } else if (arg.startsWith("-q=")) {
      options.queries = parseInt(arg.split("=")[1], 10) || 2;
    } else if (arg.startsWith("--override-email=")) {
      options.overrideEmail = arg.split("=")[1].trim();
    } else if (arg === "--override-email") {
      options.overrideEmail = args[++i]?.trim();
    }
  }

  return options;
}

function exibirAjuda(): void {
  console.log(`
===================================================================
  🚀 JENUS - PIPELINE COMPLETO DE CANDIDATURAS AUTOMATIZADAS
===================================================================

Orquestrador único: Coleta no LinkedIn -> Parsing -> Filtros -> Envio

Uso:
  npm run pipeline:curriculo [opções]

Opções:
  -p, --preview               Executa coleta e análise sem disparar e-mails
  -q, --queries <N>           Limita número de queries de busca do scraper (default: 2)
      --override-email <mail> Modo sandbox: redireciona todos os e-mails para este endereço
      --sem-ia                Personalização de currículo sem LLM externa (default)
      --com-ia                Ativa personalização de currículo com IA
      --skip-scrape           Pula scraper e usa vagas existentes em data/vagas-email.json
  -h, --help                  Exibe este menu de ajuda
`);
}

function formatarDuracao(ms: number): string {
  const segTotal = Math.round(ms / 1000);
  const min = Math.floor(segTotal / 60);
  const seg = segTotal % 60;
  return min > 0 ? `${min}m ${seg}s` : `${seg}s`;
}

async function limparArquivosTemporarios(tempDir: string = pathConfig.temp): Promise<number> {
  let removidos = 0;
  try {
    if (!fs.existsSync(tempDir)) return 0;
    const entries = await fs.promises.readdir(tempDir);
    for (const entry of entries) {
      if (entry.endsWith(".pdf") || entry.endsWith(".tmp")) {
        const fullPath = path.join(tempDir, entry);
        try {
          const stat = await fs.promises.stat(fullPath);
          if (stat.isFile()) {
            await fs.promises.unlink(fullPath);
            removidos++;
          }
        } catch {}
      }
    }
  } catch {}
  return removidos;
}

async function obterCotasRestantes(hourlyLimit: number, dailyLimit: number) {
  try {
    const db = await getDb();
    const rowHora = await db.get<{ total: number }>(
      `SELECT count(*) as total
       FROM curriculo_automacao_candidaturas
       WHERE status = 'SENT' AND sent_at >= strftime('%Y-%m-%d %H:00:00', 'now')`,
    );
    const rowDia = await db.get<{ total: number }>(
      `SELECT count(*) as total
       FROM curriculo_automacao_candidaturas
       WHERE status = 'SENT' AND sent_at >= datetime('now', '-24 hours')`,
    );
    const enviadasHora = rowHora?.total || 0;
    const enviadasDia = rowDia?.total || 0;
    return {
      enviadasHora,
      enviadasDia,
      restanteHora: Math.max(0, hourlyLimit - enviadasHora),
      restanteDia: Math.max(0, dailyLimit - enviadasDia),
    };
  } catch {
    return {
      enviadasHora: 0,
      enviadasDia: 0,
      restanteHora: hourlyLimit,
      restanteDia: dailyLimit,
    };
  }
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    exibirAjuda();
    process.exit(0);
  }

  const inicioPipeline = Date.now();
  let vagasColetadasLinkedIn = 0;
  let relatorioScraper: any = null;

  console.log("===================================================================");
  console.log("  🚀 JENUS - PIPELINE AUTOMATIZADO DE CANDIDATURAS");
  console.log("===================================================================");
  console.log(`• Modo: ${options.preview ? "🔍 PREVIEW (somente leitura - sem disparos)" : "⚡ EXECUÇÃO REAL"}`);
  console.log(`• Motor de Conteúdo: ${options.semIa ? "📄 NORMAL / SEM IA (currículo fiel ao perfil)" : "🤖 COM IA"}`);
  if (options.overrideEmail) {
    console.log(`• Sandbox de E-mail: 🛡️ ${options.overrideEmail}`);
  }
  console.log(`• Scraper LinkedIn: ${options.skipScrape ? "⏭️  PULADO (--skip-scrape)" : `ATIVO (limite: ${options.queries} queries)`}`);
  console.log("───────────────────────────────────────────────────────────────────\n");

  // ── ETAPA 1 & 2: SCRAPER DO LINKEDIN ──────────────────────────────────────────
  if (!options.skipScrape) {
    console.log("📍 ETAPA 1: Validando sessão do LinkedIn...");
    const sessionPath = obterCaminhoSessao();
    const statusSessao = verificarSessaoSalva(sessionPath);

    if (!statusSessao.valida) {
      console.error(`\n❌ Sessão do LinkedIn inválida ou não encontrada: ${statusSessao.motivo}`);
      console.error("👉 Execute primeiro o comando de login assistido:");
      console.error("   npm run linkedin:login\n");
      process.exit(1);
    }

    console.log("   ✅ Sessão válida confirmada.");
    if (statusSessao.diasRestantes !== undefined) {
      console.log(`   ⏳ Validade estimada da sessão: ~${statusSessao.diasRestantes} dias\n`);
    }

    console.log("📍 ETAPA 2: Adquirindo lock e executando Scraper de Vagas...");
    const lock = adquirirLockScraper();
    if (!lock.adquirido) {
      console.warn(`⚠️  [Lock] Execução ativa do Scraper detectada (PID: ${lock.pidExistente}).`);
      console.warn("   Encerrando execução do pipeline de forma limpa para evitar concorrência.\n");
      process.exit(0);
    }

    try {
      relatorioScraper = await executarScraperVagas({
        maxSearchesPerRun: options.queries,
      });
      vagasColetadasLinkedIn = relatorioScraper.vagasFinais;
    } catch (err: any) {
      console.error(`\n❌ Erro durante o scraper: ${err?.message || err}\n`);
      process.exit(1);
    } finally {
      lock.liberar();
    }

    // ── ETAPA 3 & 4: TELEMETRIA DA COLETA E GRAVAÇÃO ATÔMICA ──────────────────
    console.log("\n📍 ETAPA 3 & 4: Telemetria da Coleta no LinkedIn");
    console.log("───────────────────────────────────────────────────────────────────");
    console.log(`🔍 Buscas executadas: ${relatorioScraper.buscasExecutadas}`);
    console.log(`📄 Páginas processadas: ${relatorioScraper.paginasProcessadas}`);
    console.log(`📥 Total de posts encontrados: ${relatorioScraper.postsEncontrados}`);
    console.log(`🚫 Descartados sem e-mail: ${relatorioScraper.descartadosSemEmail}`);
    console.log(`🔗 Descartados sem URL canônica: ${relatorioScraper.descartadosSemUrlCanonica}`);
    console.log(`📉 Descartados por score confiança (< 0.65): ${relatorioScraper.descartadosPorConfidence}`);
    console.log(`⏳ Descartados por filtro temporal (> 24h): ${relatorioScraper.descartadosPorData}`);
    console.log(`🔄 Duplicatas unificadas: ${relatorioScraper.duplicatasRemovidas}`);
    console.log(`🎯 Vagas qualificadas salvas atomicamente: ${relatorioScraper.vagasFinais}`);
    if (relatorioScraper.arquivoGerado) {
      console.log(`💾 Base atualizada cumulativamente: ${relatorioScraper.arquivoGerado}`);
    }

    if (relatorioScraper.queriesExecutadas && relatorioScraper.queriesExecutadas.length > 0) {
      console.log("\n📈 Telemetria por Query:");
      relatorioScraper.queriesExecutadas.forEach((q: any, idx: number) => {
        console.log(`   [#${idx + 1}] "${q.query}" (${q.type}): ${q.postsFound} posts -> ${q.qualifiedJobs} vagas qualificadas`);
      });
    }
  } else {
    console.log("📍 ETAPAS 1 a 4: Scraper do LinkedIn pulado (--skip-scrape).");
    console.log("   Utilizando dados cumulativos existentes em data/vagas-email.json.");
  }

  // ── ETAPA 5 & 6: ANÁLISE DE ELEGIBILIDADE COM WORKER ─────────────────────────
  console.log("\n📍 ETAPA 5: Inicializando banco de dados e motor de vagas...");
  await initDb();

  const workerConfig: Partial<AutomacaoConfig> = {
    feedUrl: "./data/vagas-email.json",
    semIa: options.semIa,
    ...(options.overrideEmail ? { overrideEmail: options.overrideEmail } : {}),
  };

  console.log("📍 ETAPA 6: Gerando preview e analisando elegibilidade...");
  const preview = await vagasEmailWorker.gerarPreview(workerConfig);

  console.log("\n📊 Resumo da Análise de Elegibilidade:");
  console.log("───────────────────────────────────────────────────────────────────");
  console.log(`   • Total de vagas no feed: ${preview.totalNoFeed}`);
  console.log(`   • Vagas elegíveis (Score >= ${preview.config.minScore}%): ${preview.elegiveis.length}`);
  console.log(`   • Vagas descartadas/puladas: ${preview.puladas.length}`);
  console.log(`   • Envios realizados nesta hora: ${preview.enviosHoraAtual} / ${preview.config.hourlyLimit}`);
  console.log(`   • Cota horária restante: ${preview.limiteHorarioRestante}`);
  console.log(`   • Envios nas últimas 24h: ${preview.enviosUltimas24h} / ${preview.config.dailyLimit}`);
  console.log(`   • Cota diária restante: ${preview.limiteDiarioRestante}`);

  // Agrupamento de motivos de descarte
  const contagemMotivos: Record<string, number> = {};
  for (const vaga of preview.puladas) {
    const motivo = (vaga.skipReason as SkipReason) || "OUTRO";
    contagemMotivos[motivo] = (contagemMotivos[motivo] || 0) + 1;
  }

  if (Object.keys(contagemMotivos).length > 0) {
    console.log("\n📉 Motivos de Descarte:");
    for (const [motivo, qtd] of Object.entries(contagemMotivos)) {
      console.log(`   • [${motivo}]: ${qtd} vaga(s)`);
    }
  }

  if (preview.elegiveis.length > 0) {
    console.log("\n🎯 Detalhamento das Vagas Elegíveis:");
    preview.elegiveis.slice(0, 10).forEach((vaga, idx) => {
      console.log(`   ${idx + 1}. [Score: ${vaga.score}%] ${vaga.title} @ ${vaga.company} -> ${vaga.contactEmail}`);
    });
    if (preview.elegiveis.length > 10) {
      console.log(`   ... e mais ${preview.elegiveis.length - 10} vaga(s) elegível(eis).`);
    }
  }

  // ── ETAPAS 7 a 11: CICLO DE ENVIO DO WORKER (SE NÃO FOR PREVIEW) ─────────────
  let enviosSucesso = 0;
  let enviosFalhas = 0;

  if (options.preview) {
    console.log("\n🔍 MODO PREVIEW ATIVO: Nenhum e-mail foi disparado.");
    console.log("   Para realizar os disparos reais, execute sem a flag --preview:");
    console.log("   npm run pipeline:curriculo");
  } else {
    if (preview.elegiveis.length === 0) {
      console.log("\n⚠️  Nenhuma vaga elegível para envio neste momento.");
    } else if (preview.limiteDiarioRestante <= 0) {
      console.log(`\n⚠️  Limite diário de ${preview.config.dailyLimit} envios atingido. Encerrando disparos.`);
    } else {
      console.log("\n📍 ETAPAS 7 a 11: Disparando ciclo de envio com o Worker...");
      if (options.overrideEmail) {
        console.log(`🛡️  MODO SANDBOX: Todos os e-mails serão redirecionados para: ${options.overrideEmail}`);
      }

      // Handler gracioso de SIGINT (Ctrl+C)
      let cancelando = false;
      const onSigint = async () => {
        if (cancelando) return;
        cancelando = true;
        console.log("\n\n🛑 [Ctrl+C] Interrupção detectada. Solicitando parada segura do worker...");
        await vagasEmailWorker.parar("Interrompido pelo usuário");
        await limparArquivosTemporarios();
        process.exit(0);
      };
      process.on("SIGINT", onSigint);

      await vagasEmailWorker.iniciar(workerConfig);

      // Loop de monitoramento do worker
      let ultimoLog = "";
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const status = vagasEmailWorker.getStatus();

        const logMsg = `[${status.state}] Enviadas: ${status.enviadas} | Hora: ${status.enviadasNestaHora}/${status.hourlyLimit} | Falhas: ${status.falhas} | Restantes: ${status.aguardando} | ${status.mensagem}`;
        if (logMsg !== ultimoLog) {
          console.log(`⏱️  ${logMsg}`);
          ultimoLog = logMsg;
        }

        if (status.proximaJanelaEmSegundos && status.proximaJanelaEmSegundos > 0) {
          const minRestantes = Math.floor(status.proximaJanelaEmSegundos / 60);
          const segRestantes = status.proximaJanelaEmSegundos % 60;
          process.stdout.write(`   ⏳ Limite horário atingido! Próxima janela em ${minRestantes}m ${segRestantes}s...\r`);
        } else if (status.proximoEnvioEmSegundos && status.proximoEnvioEmSegundos > 0) {
          process.stdout.write(`   ⏳ Próximo envio em ${status.proximoEnvioEmSegundos}s...\r`);
        }

        if (status.state === "COMPLETED" || status.state === "STOPPED" || status.state === "FAILED") {
          enviosSucesso = status.enviadas;
          enviosFalhas = status.falhas;
          process.removeListener("SIGINT", onSigint);
          break;
        }
      }
    }
  }

  // ── ETAPA 12: LIMPEZA DE ARQUIVOS TEMPORÁRIOS RESIDUAIS ──────────────────────
  console.log("\n📍 ETAPA 12: Garantindo limpeza de arquivos residuais em temp/...");
  const removidos = await limparArquivosTemporarios();
  console.log(`   🧹 Arquivos residuais limpos: ${removidos}`);

  // ── ETAPA 13: RELATÓRIO CONSOLIDADO FINAL ────────────────────────────────────
  const duracaoTotalMs = Date.now() - inicioPipeline;
  const cotas = await obterCotasRestantes(preview.config.hourlyLimit || 30, preview.config.dailyLimit);

  console.log("\n===================================================================");
  console.log("  📊 RELATÓRIO CONSOLIDADO DO PIPELINE");
  console.log("===================================================================");
  console.log(`⏱️  Duração total: ${formatarDuracao(duracaoTotalMs)}`);
  console.log(`📥 Vagas coletadas no LinkedIn: ${options.skipScrape ? "Pulado (--skip-scrape)" : vagasColetadasLinkedIn}`);
  console.log(`🎯 Vagas elegíveis vs descartadas: ${preview.elegiveis.length} elegíveis | ${preview.puladas.length} descartadas`);
  console.log(`📨 E-mails enviados com sucesso: ${enviosSucesso}`);
  console.log(`❌ Falhas de envio: ${enviosFalhas}`);
  console.log("───────────────────────────────────────────────────────────────────");
  console.log(`⏳ Cota restante na hora atual: ${cotas.restanteHora} / ${preview.config.hourlyLimit || 30}`);
  console.log(`📅 Cota restante no dia (24h): ${cotas.restanteDia} / ${preview.config.dailyLimit}`);
  console.log("===================================================================\n");
}

main().catch(async (err) => {
  console.error("\n❌ Erro fatal no pipeline de currículo:", err);
  await limparArquivosTemporarios();
  process.exit(1);
});
