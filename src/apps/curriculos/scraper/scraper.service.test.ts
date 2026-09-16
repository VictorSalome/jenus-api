import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { avaliarIdadePublicacao } from "./linkedin/linkedin-temporal.utils.js";
import {
  executarScraperVagas,
  carregarVagasExistentes,
  mesclarEDeduplicarVagas,
} from "./scraper.service.js";
import { vagasEmailWorker } from "../automacao/vagasEmailWorker.service.js";
import type { RawLinkedInPost, SelectedQuery } from "./linkedin/linkedin.types.js";
import type { VagaEmailRaw } from "../automacao/types.js";

async function runPhase3Tests() {
  console.log("=========================================================");
  console.log("  🧪 TESTES UNITÁRIOS: PIPELINE DO SCRAPER (FASE 3)");
  console.log("=========================================================\n");

  // ── 1. Teste do Filtro Temporal no Código ────────────────────────────────
  console.log("1. Testando filtro temporal de publicações (<= 24h vs > 24h)...");

  // Casos <= 24h
  assert.equal(avaliarIdadePublicacao("5 min").dentroDaJanela, true, "'5 min' deve estar dentro da janela");
  assert.equal(avaliarIdadePublicacao("2 h").dentroDaJanela, true, "'2 h' deve estar dentro da janela");
  assert.equal(avaliarIdadePublicacao("12 h").dentroDaJanela, true, "'12 h' deve estar dentro da janela");
  assert.equal(avaliarIdadePublicacao("ontem").dentroDaJanela, true, "'ontem' deve estar dentro da janela de 24h");
  assert.equal(avaliarIdadePublicacao("1 d").dentroDaJanela, true, "'1 d' deve estar dentro da janela de 24h");

  // Casos > 24h (devem ser descartados)
  assert.equal(avaliarIdadePublicacao("2 d").dentroDaJanela, false, "'2 d' deve estar FORA da janela de 24h");
  assert.equal(avaliarIdadePublicacao("5 d").dentroDaJanela, false, "'5 d' deve estar FORA da janela de 24h");
  assert.equal(avaliarIdadePublicacao("1 sem").dentroDaJanela, false, "'1 sem' deve estar FORA da janela de 24h");
  assert.equal(avaliarIdadePublicacao("2 semanas").dentroDaJanela, false, "'2 semanas' deve estar FORA da janela de 24h");
  assert.equal(avaliarIdadePublicacao("1 mês").dentroDaJanela, false, "'1 mês' deve estar FORA da janela de 24h");

  // Teste com tag <time datetime="..."> ISO
  const isoRecente = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3 horas atrás
  const isoAntigo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48 horas atrás
  assert.equal(avaliarIdadePublicacao("", isoRecente).dentroDaJanela, true, "Datetime de 3h atrás deve ser aceito");
  assert.equal(avaliarIdadePublicacao("", isoAntigo).dentroDaJanela, false, "Datetime de 48h atrás deve ser descartado");

  console.log("   ✅ Filtro temporal por texto relativo e atributo datetime: OK\n");

  // ── 2. Teste do Pipeline Completo (Mockado sem Navegador) ──────────────────
  console.log("2. Testando orquestrador com pipeline de posts simulados...");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scraper-test-"));
  const arquivoJsonSaida = path.join(tempDir, "vagas-email-teste.json");
  const arquivoHistorico = path.join(tempDir, "scraper-history-teste.json");

  try {
    const postsMockados: RawLinkedInPost[] = [
      // Post 1: Vaga legítima recente (deve ser APROVADA)
      {
        id: "activity-1001",
        url: "https://www.linkedin.com/feed/update/urn:li:activity:1001?trackingId=alpha",
        authorName: "Recrutadora Ana",
        companyName: "TechCorp",
        publishedAtText: "2 h",
        text: `
          Estamos contratando! Vaga Desenvolvedor Node.js Pleno.
          Regime Remoto CLT.
          Requisitos: 3 anos de experiência em Node, TypeScript e SQL.
          Interessados enviar currículo para talentos@techcorp.com.br
        `,
      },
      // Post 2: Vaga legítima recente (deve ser APROVADA)
      {
        id: "activity-1002",
        url: "https://www.linkedin.com/feed/update/urn:li:activity:1002",
        authorName: "Consultoria RH",
        companyName: "Nexus Digital",
        publishedAtText: "5 h",
        text: `
          Temos vaga aberta para Desenvolvedor React Sênior.
          Modalidade Híbrido em SP.
          Requisitos: Domínio de React, Next.js, TypeScript e testes automatizados.
          Envie seu cv para selecao@nexusdigital.com.br
        `,
      },
      // Post 3: Vaga duplicada do Post 1 com tracking param diferente (deve ser DEDUPLICADA)
      {
        id: "activity-1001-dup",
        url: "https://www.linkedin.com/feed/update/urn:li:activity:1001?trackingId=beta_999",
        authorName: "Recrutadora Ana",
        publishedAtText: "2 h",
        text: `
          Estamos contratando! Vaga Desenvolvedor Node.js Pleno.
          Regime Remoto CLT.
          Requisitos: 3 anos de experiência em Node, TypeScript e SQL.
          Interessados enviar currículo para talentos@techcorp.com.br
        `,
      },
      // Post 4: Vaga antiga > 24h (deve ser DESCARTADA POR DATA)
      {
        id: "activity-1004",
        url: "https://www.linkedin.com/feed/update/urn:li:activity:1004",
        publishedAtText: "3 d", // 3 dias atrás
        text: `
          Estamos contratando Desenvolvedor Python.
          Envie cv para rh@empresa.com.br
        `,
      },
      // Post 5: Post sem e-mail (deve ser DESCARTADO POR SEM EMAIL)
      {
        id: "activity-1005",
        url: "https://www.linkedin.com/feed/update/urn:li:activity:1005",
        publishedAtText: "1 h",
        text: `
          Estamos contratando Desenvolvedores. Inscrições pelo link na bio.
        `,
      },
      // Post 6: Post com e-mail + skills mas sem vaga (deve ser DESCARTADO POR CONFIDENCE)
      {
        id: "activity-1006",
        url: "https://www.linkedin.com/feed/update/urn:li:activity:1006",
        publishedAtText: "30 min",
        text: `
          Confira meu artigo sobre arquitetura React e Node.js no Medium!
          Dúvidas mandem e-mail em dev.autor@gmail.com
        `,
      },
      // Post 7: Post com URL de perfil (deve ser DESCARTADO POR SEM URL CANÔNICA)
      {
        id: "activity-1007",
        url: "https://www.linkedin.com/in/recrutador-teste/",
        publishedAtText: "1 h",
        text: `
          Estamos contratando Desenvolvedor Full Stack.
          Envie currículo para rh@empresa.com.br
        `,
      },
    ];

    const relatorio = await executarScraperVagas({
      postsMockados,
      arquivoSaida: arquivoJsonSaida,
      caminhoHistorico: arquivoHistorico,
      maxAgeHours: 24,
      minConfidenceScore: 0.65,
    });

    assert.equal(relatorio.postsEncontrados, 7, "Total de posts avaliados deve ser 7");
    assert.equal(relatorio.descartadosPorData, 1, "1 post deve ser descartado por filtro temporal (> 24h)");
    assert.equal(relatorio.descartadosSemEmail, 1, "1 post deve ser descartado por ausência de e-mail");
    assert.equal(relatorio.descartadosSemUrlCanonica, 1, "1 post deve ser descartado por URL de perfil/não-canônica");
    assert.equal(relatorio.descartadosPorConfidence, 1, "1 post deve ser descartado por score de confiança insuficiente");
    assert.equal(relatorio.duplicatasRemovidas, 1, "1 post deve ser removido por deduplicação");
    assert.equal(relatorio.vagasFinais, 2, "Devem restar exatamente 2 vagas legítimas e únicas");

    // Validação da telemetria de queries executadas
    assert.equal(relatorio.queriesExecutadas.length, 1, "Deve conter telemetria para 1 query executada");
    const qTelemetria = relatorio.queriesExecutadas[0];
    assert.equal(qTelemetria.postsFound, 7, "Posts encontrados na telemetria da query deve ser 7");
    assert.equal(qTelemetria.qualifiedJobs, 2, "Vagas qualificadas na telemetria da query deve ser 2");
    assert.ok(qTelemetria.query, "Query deve ser informada");
    assert.ok(qTelemetria.type, "Tipo da query deve ser informado");
    assert.ok(Array.isArray(qTelemetria.terms), "Termos da query deve ser um array");

    // Validação de gravação atômica no scraper-history
    assert.ok(fs.existsSync(arquivoHistorico), "Arquivo de histórico deve ter sido criado");
    const historicoSalvo = JSON.parse(fs.readFileSync(arquivoHistorico, "utf-8"));
    assert.equal(historicoSalvo.records.length, 1, "Histórico deve conter 1 registro");
    assert.equal(historicoSalvo.records[0].postsFound, 7);
    assert.equal(historicoSalvo.records[0].qualifiedJobs, 2);

    console.log(`   - Posts avaliados: ${relatorio.postsEncontrados}`);
    console.log(`   - Descartados por data (> 24h): ${relatorio.descartadosPorData}`);
    console.log(`   - Descartados sem e-mail: ${relatorio.descartadosSemEmail}`);
    console.log(`   - Descartados sem URL canônica: ${relatorio.descartadosSemUrlCanonica}`);
    console.log(`   - Descartados por confidence: ${relatorio.descartadosPorConfidence}`);
    console.log(`   - Duplicatas removidas: ${relatorio.duplicatasRemovidas}`);
    console.log(`   - Vagas aprovadas finais: ${relatorio.vagasFinais}`);
    console.log(`   - Telemetria de queries: ${relatorio.queriesExecutadas.length} query registrada (posts: ${qTelemetria.postsFound}, qualificadas: ${qTelemetria.qualifiedJobs})`);

    // ── 3. Validação do Arquivo JSON Gerado ──────────────────────────────────
    console.log("\n3. Validando integridade do arquivo JSON gerado...");
    assert.ok(fs.existsSync(arquivoJsonSaida), "Arquivo JSON deve ter sido gravado no disco");

    const jsonConteudo = JSON.parse(fs.readFileSync(arquivoJsonSaida, "utf-8"));
    assert.ok(Array.isArray(jsonConteudo), "JSON gerado deve ser um array");
    assert.equal(jsonConteudo.length, 2, "Array deve conter 2 vagas");

    const vaga1 = jsonConteudo[0];
    assert.ok(vaga1.id);
    assert.ok(vaga1.title);
    assert.ok(vaga1.company);
    assert.ok(vaga1.contactEmail);
    assert.ok(Array.isArray(vaga1.skills));
    assert.ok(Array.isArray(vaga1.requirements));

    // NUNCA deve conter campos internos de depuração no arquivo final
    assert.equal(vaga1.confidenceScore, undefined, "JSON final não deve expor confidenceScore");
    assert.equal(vaga1.confidenceReasons, undefined, "JSON final não deve expor confidenceReasons");
    assert.equal(vaga1.rawText, undefined, "JSON final não deve expor rawText");

    console.log("   ✅ Arquivo JSON gerado no contrato estrito VagaEmailRaw: OK\n");

    // ── 4. Validação com SelectedQuery customizada (dryRun) ───────────────────
    console.log("4. Validando execução com SelectedQuery explícita (dryRun)...");
    const queryCustom: SelectedQuery = {
      query: '"full stack" AND "react"',
      type: "combined",
      terms: ["full stack", "react"],
      priorityScore: 90,
      reason: "Query customizada para teste",
    };
    const relatorioCustom = await executarScraperVagas({
      postsMockados: postsMockados.slice(0, 2),
      queries: [queryCustom],
      dryRun: true,
    });
    assert.equal(relatorioCustom.queriesExecutadas.length, 1);
    assert.equal(relatorioCustom.queriesExecutadas[0].query, '"full stack" AND "react"');
    assert.equal(relatorioCustom.queriesExecutadas[0].type, "combined");
    assert.deepEqual(relatorioCustom.queriesExecutadas[0].terms, ["full stack", "react"]);
    assert.equal(relatorioCustom.queriesExecutadas[0].postsFound, 2);
    assert.equal(relatorioCustom.queriesExecutadas[0].qualifiedJobs, 2);
    console.log("   ✅ Suporte a SelectedQuery[] e telemetria: OK\n");

    // ── 5. Testes Unitários da FASE 2: Carregamento Seguro e Fallback ──────────
    console.log("5. Testando carregamento seguro de vagas existentes (carregarVagasExistentes)...");
    const caminhoInexistente = path.join(tempDir, "arquivo-que-nao-existe.json");
    assert.deepEqual(carregarVagasExistentes(caminhoInexistente), [], "Arquivo inexistente deve retornar array vazio");

    const caminhoVazio = path.join(tempDir, "arquivo-vazio.json");
    fs.writeFileSync(caminhoVazio, "", "utf-8");
    assert.deepEqual(carregarVagasExistentes(caminhoVazio), [], "Arquivo vazio deve retornar array vazio");

    const caminhoCorrompido = path.join(tempDir, "arquivo-corrompido.json");
    fs.writeFileSync(caminhoCorrompido, "{ json quebrado invalid syntax !!", "utf-8");
    assert.deepEqual(carregarVagasExistentes(caminhoCorrompido), [], "Arquivo corrompido deve retornar array vazio com fallback seguro");

    const caminhoNaoArray = path.join(tempDir, "arquivo-objeto.json");
    fs.writeFileSync(caminhoNaoArray, JSON.stringify({ mensagem: "nao e array" }), "utf-8");
    assert.deepEqual(carregarVagasExistentes(caminhoNaoArray), [], "Arquivo com objeto no lugar de array deve retornar []");
    console.log("   ✅ Fallback seguro contra arquivos inexistentes, vazios ou corrompidos: OK\n");

    // ── 6. Testes Unitários da FASE 2: Mesclagem Cumulativa e Deduplicação ─────
    console.log("6. Testando mesclagem cumulativa e regras de deduplicação (mesclarEDeduplicarVagas)...");
    const vagaExistente1: VagaEmailRaw = {
      id: "vaga-node-1",
      title: "Dev Node.js",
      company: "Alpha Corp",
      contactEmail: "vagas@alphacorp.com",
      description: "Desenvolvedor Backend Node.js Pleno",
      sourceUrl: "https://www.linkedin.com/feed/update/urn:li:activity:9001/",
    };
    const vagaExistente2: VagaEmailRaw = {
      id: "vaga-react-2",
      title: "Dev React",
      company: "Beta Tech",
      contactEmail: "talentos@betatech.com",
      description: "Desenvolvedor Frontend React Senior",
      sourceUrl: "https://www.linkedin.com/feed/update/urn:li:activity:9002/",
    };

    // Caso 6.1: Zero vagas na execução atual PRESERVA as existentes
    const preservadas = mesclarEDeduplicarVagas([], [vagaExistente1, vagaExistente2]);
    assert.equal(preservadas.length, 2, "Execução com zero vagas DEVE preservar vagas existentes");
    assert.equal(preservadas[0].id, "vaga-node-1");
    assert.equal(preservadas[1].id, "vaga-react-2");

    // Caso 6.2: Deduplicação por ID
    const vagaNovaComMesmoId: VagaEmailRaw = {
      ...vagaExistente1,
      title: "Dev Node.js Atualizado",
    };
    const mescladasId = mesclarEDeduplicarVagas([vagaNovaComMesmoId], [vagaExistente1]);
    assert.equal(mescladasId.length, 1, "Vaga com mesmo ID deve ser deduplicada");
    assert.equal(mescladasId[0].title, "Dev Node.js Atualizado", "Vaga nova deve ter precedência");

    // Caso 6.3: Deduplicação por URL canônica (mesmo post com query params de tracking diferentes)
    const vagaNovaMesmaUrl: VagaEmailRaw = {
      id: "outro-id-mesmo-post",
      title: "Dev Node.js",
      company: "Alpha Corp",
      contactEmail: "vagas@alphacorp.com",
      description: "Outra descrição",
      sourceUrl: "https://www.linkedin.com/feed/update/urn:li:activity:9001/?trackingId=xyz",
    };
    const mescladasUrl = mesclarEDeduplicarVagas([vagaNovaMesmaUrl], [vagaExistente1]);
    assert.equal(mescladasUrl.length, 1, "Vaga com mesma URL canônica deve ser deduplicada");

    // Caso 6.4: Deduplicação por Hash SHA-256 (conteúdo textual normalizado + email)
    const vagaNovaMesmoHash: VagaEmailRaw = {
      id: "id-diferente",
      title: "Dev React",
      company: "Beta Tech",
      contactEmail: "TALENTOS@betatech.com ", // case e espaços diferentes
      description: "Desenvolvedor Frontend React Senior!", // pontuação extra
      sourceUrl: "", // sem URL
    };
    const mescladasHash = mesclarEDeduplicarVagas([vagaNovaMesmoHash], [vagaExistente2]);
    assert.equal(mescladasHash.length, 1, "Vaga com mesmo hash texto normalizado + email deve ser deduplicada");

    // Caso 6.5: Adição de vaga genuinamente nova (cumulativo)
    const vagaGenuinaNova: VagaEmailRaw = {
      id: "vaga-python-3",
      title: "Dev Python",
      company: "Gama AI",
      contactEmail: "rh@gama.ai",
      description: "Engenheiro Python e IA",
      sourceUrl: "https://www.linkedin.com/feed/update/urn:li:activity:9003/",
    };
    const mescladasNova = mesclarEDeduplicarVagas([vagaGenuinaNova], [vagaExistente1, vagaExistente2]);
    assert.equal(mescladasNova.length, 3, "Vaga nova genuína deve ser adicionada resultando em 3 vagas");
    assert.equal(mescladasNova[0].id, "vaga-python-3");
    console.log("   ✅ Regras de mesclagem cumulativa, precedência e deduplicação (ID, URL, SHA-256): OK\n");

    // ── 7. Teste de Pipeline Cumulativo com Escrita Atômica no Scraper ──────────
    console.log("7. Testando execuções sucessivas do Scraper com preservação e escrita atômica...");
    const arquivoCumulativo = path.join(tempDir, "vagas-cumulativo.json");

    // Execução 1: Coleta 2 vagas válidas
    await executarScraperVagas({
      postsMockados: postsMockados.slice(0, 3), // posts 1, 2 e 3 (dup) -> 2 vagas
      arquivoSaida: arquivoCumulativo,
      caminhoHistorico: arquivoHistorico,
      maxAgeHours: 24,
      minConfidenceScore: 0.65,
    });
    const conteudoAposExec1 = JSON.parse(fs.readFileSync(arquivoCumulativo, "utf-8"));
    assert.equal(conteudoAposExec1.length, 2, "Execução 1 deve gravar 2 vagas no arquivo");
    assert.equal(fs.existsSync(`${arquivoCumulativo}.tmp`), false, "Arquivo temporário .tmp não deve restar no disco");

    // Execução 2: Simula execução sem novas vagas (apenas posts descartados)
    await executarScraperVagas({
      postsMockados: [postsMockados[3]], // Post 4: antigo > 24h -> 0 vagas
      arquivoSaida: arquivoCumulativo,
      caminhoHistorico: arquivoHistorico,
      maxAgeHours: 24,
      minConfidenceScore: 0.65,
    });
    const conteudoAposExec2 = JSON.parse(fs.readFileSync(arquivoCumulativo, "utf-8"));
    assert.equal(conteudoAposExec2.length, 2, "Execução com 0 vagas DEVE preservar as 2 vagas anteriores no arquivo!");

    // Execução 3: Coleta 1 nova vaga distinta
    const postNovo: RawLinkedInPost = {
      id: "activity-2001",
      url: "https://www.linkedin.com/feed/update/urn:li:activity:2001",
      authorName: "Recruiter Bob",
      companyName: "CloudScale",
      publishedAtText: "1 h",
      text: `
        Estamos contratando! Vaga Desenvolvedor Golang Sênior.
        Remoto CLT.
        Requisitos: 5 anos de experiência com Go, Docker e AWS.
        Envie cv para dev@cloudscale.io
      `,
    };
    await executarScraperVagas({
      postsMockados: [postNovo],
      arquivoSaida: arquivoCumulativo,
      caminhoHistorico: arquivoHistorico,
      maxAgeHours: 24,
      minConfidenceScore: 0.65,
    });
    const conteudoAposExec3 = JSON.parse(fs.readFileSync(arquivoCumulativo, "utf-8"));
    assert.equal(conteudoAposExec3.length, 3, "Execução 3 deve acumular a nova vaga, totalizando 3 vagas!");
    assert.equal(fs.existsSync(`${arquivoCumulativo}.tmp`), false, "Escrita atômica finalizada sem resíduos .tmp");
    console.log("   ✅ Execuções cumulativas sucessivas e preservação com escrita atômica: OK\n");

    // ── 8. Testes da Integração com Worker (buscarVagasDoFeed) ─────────────────
    console.log("8. Testando leitura no Worker (buscarVagasDoFeed com arquivo local e fallback)...");

    // Caso 8.1: Leitura direta do arquivo local gerado pelo scraper
    const vagasWorkerLocal = await vagasEmailWorker.buscarVagasDoFeed(arquivoCumulativo);
    assert.equal(vagasWorkerLocal.length, 3, "Worker deve carregar 3 vagas do arquivo local");
    assert.equal(vagasWorkerLocal[0].company, "CloudScale");

    // Caso 8.2: Leitura com prefixo file://
    const urlProtocoloFile = `file://${arquivoCumulativo}`;
    const vagasWorkerFileProtocol = await vagasEmailWorker.buscarVagasDoFeed(urlProtocoloFile);
    assert.equal(vagasWorkerFileProtocol.length, 3, "Worker deve suportar protocolo file://");

    // Caso 8.3: Fallback inteligente quando a URL remota falha
    // Cria um arquivo temporário no local padrão de fallback data/vagas-email.json
    const vagasWorkerFallback = await vagasEmailWorker.buscarVagasDoFeed(
      "https://dominio-inexistente-para-teste-fallback-1234.com/feed.json"
    );
    assert.ok(Array.isArray(vagasWorkerFallback), "Fallback para feed local deve retornar array mesmo se remoto falhar");
    console.log("   ✅ Suporte a arquivos locais, file:// e fallback inteligente no Worker: OK\n");

    console.log("=========================================================");
    console.log("  🎉 TODOS OS TESTES DAS FASES 2 E 3 PASSARAM COM SUCESSO!");
    console.log("=========================================================");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

runPhase3Tests().catch((err) => {
  console.error("❌ Falha nos testes da Fase 3:", err);
  process.exit(1);
});
