import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import {
  calcularPrioridadeTermo,
  selecionarQueriesBalanceadas,
  salvarRegistroExecucao,
  carregarHistorico,
  formatarQueryLinkedin,
} from "./query-builder.service.js";
import {
  CATALOGO_CARGOS,
  CATALOGO_TECNOLOGIAS,
  SINAIS_CONTRATACAO,
} from "./linkedin.constants.js";
import type { QueryExecutionRecord, ScraperHistory } from "./linkedin.types.js";

async function runTests() {
  console.log("=========================================================");
  console.log("  🧪 TESTES UNITÁRIOS: QUERY BUILDER SERVICE (FASE 3.2)");
  console.log("=========================================================\n");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "query-builder-test-"));
  const historyPath = path.join(tempDir, "scraper-history.json");
  const nowMs = 1710000000000; // Fixed timestamp for deterministic testing

  try {
    // ── 1. Cálculo de Prioridade (calcularPrioridadeTermo) ───────────────────
    console.log("1. Testando cálculo de prioridade por recência e rendimento...");

    // 1.1 Termo nunca pesquisado tem prioridade máxima (score 100)
    const historicoVazio: ScraperHistory = { records: [] };
    const prioridadeNuncaBuscado = calcularPrioridadeTermo("React", historicoVazio, nowMs);
    assert.equal(
      prioridadeNuncaBuscado.score,
      100,
      "Termo nunca pesquisado deve ter score 100 (prioridade máxima)",
    );
    assert.ok(
      prioridadeNuncaBuscado.reason.toLowerCase().includes("nunca pesquisado"),
      "Motivo deve indicar que termo nunca foi pesquisado",
    );

    // 1.2 Termo pesquisado há muito tempo tem prioridade maior que termo recente (< 3h)
    const historicoRecencia: ScraperHistory = {
      records: [
        {
          query: '"React" AND email',
          type: "technology",
          terms: ["React"],
          executedAt: new Date(nowMs - 1 * 60 * 60 * 1000).toISOString(), // 1 hora atrás (< 3h)
          postsFound: 10,
          qualifiedJobs: 0,
        },
        {
          query: '"Node.js" AND email',
          type: "technology",
          terms: ["Node.js"],
          executedAt: new Date(nowMs - 24 * 60 * 60 * 1000).toISOString(), // 24 horas atrás
          postsFound: 10,
          qualifiedJobs: 0,
        },
      ],
    };

    const prioridadeRecente = calcularPrioridadeTermo("React", historicoRecencia, nowMs);
    const prioridadeAntigo = calcularPrioridadeTermo("Node.js", historicoRecencia, nowMs);
    assert.ok(
      prioridadeAntigo.score > prioridadeRecente.score,
      `Termo pesquisado há 24h (${prioridadeAntigo.score}) deve ter prioridade maior que pesquisado há 1h (${prioridadeRecente.score})`,
    );
    assert.ok(
      prioridadeRecente.score <= 10,
      `Termo pesquisado há menos de 3h deve sofrer penalidade de recência (score=${prioridadeRecente.score})`,
    );

    // 1.3 Alto rendimento de vagas qualificadas (+10 por vaga) aumenta o score
    const historicoRendimento: ScraperHistory = {
      records: [
        {
          query: '"TypeScript" AND email',
          type: "technology",
          terms: ["TypeScript"],
          executedAt: new Date(nowMs - 12 * 60 * 60 * 1000).toISOString(),
          postsFound: 15,
          qualifiedJobs: 0,
        },
        {
          query: '"Python" AND email',
          type: "technology",
          terms: ["Python"],
          executedAt: new Date(nowMs - 12 * 60 * 60 * 1000).toISOString(),
          postsFound: 15,
          qualifiedJobs: 3, // +30 pontos de rendimento
        },
      ],
    };

    const prioridadeSemVagas = calcularPrioridadeTermo("TypeScript", historicoRendimento, nowMs);
    const prioridadeComVagas = calcularPrioridadeTermo("Python", historicoRendimento, nowMs);
    const diferencaRendimento = prioridadeComVagas.score - prioridadeSemVagas.score;
    assert.equal(
      diferencaRendimento,
      30,
      `3 vagas qualificadas devem conceder exatamente +30 pontos de bônus (+10 por vaga) (esperado: 30, obtido: ${diferencaRendimento})`,
    );

    // 1.4 Rendimento zero após múltiplas buscas (>= 2) sofre penalidade (-15 pts)
    const historicoPenalidade: ScraperHistory = {
      records: [
        {
          query: '"Ruby" AND email',
          type: "technology",
          terms: ["Ruby"],
          executedAt: new Date(nowMs - 12 * 60 * 60 * 1000).toISOString(),
          postsFound: 5,
          qualifiedJobs: 0,
        },
        {
          query: '"Ruby" AND email',
          type: "technology",
          terms: ["Ruby"],
          executedAt: new Date(nowMs - 18 * 60 * 60 * 1000).toISOString(),
          postsFound: 8,
          qualifiedJobs: 0,
        },
      ],
    };

    const prioridadeComPenalidade = calcularPrioridadeTermo("Ruby", historicoPenalidade, nowMs);
    // TypeScript acima teve 1 busca há 12h e 0 vagas qualificadas -> score 40
    // Ruby teve 2 buscas há 12h e 0 vagas qualificadas -> score 40 - 15 = 25
    assert.equal(
      prioridadeSemVagas.score - prioridadeComPenalidade.score,
      15,
      "Duas buscas sem vagas qualificadas devem sofrer penalidade de 15 pontos em relação a busca única",
    );
    console.log("   ✅ Prioridade por recência e rendimento: OK\n");

    // ── 2. Distribuição Balanceada (selecionarQueriesBalanceadas) ────────────
    console.log("2. Testando distribuição balanceada de queries...");

    // 2.1 Por padrão seleciona exatamente 8 queries
    const queriesPadrao = selecionarQueriesBalanceadas({}, historicoVazio, nowMs);
    assert.equal(queriesPadrao.length, 8, "Deve selecionar exatamente 8 queries no modo padrão");

    // 2.2 Exatamente 2 queries de Cargo (Tipo 1)
    const tipo1Role = queriesPadrao.filter((q) => q.type === "role");
    assert.equal(tipo1Role.length, 2, "Devem haver exatamente 2 queries de Cargo (Tipo 1)");
    for (const q of tipo1Role) {
      assert.equal(q.terms.length, 1, "Query de cargo deve conter exatamente 1 termo");
      assert.ok(
        CATALOGO_CARGOS.includes(q.terms[0]),
        `Termo '${q.terms[0]}' deve pertencer ao CATALOGO_CARGOS`,
      );
      assert.ok(
        q.query.startsWith(`"${q.terms[0]}" AND `),
        "Formato booleano de cargo deve iniciar com o termo e operador AND",
      );
    }

    // 2.3 Exatamente 3 queries de Tecnologia (Tipo 2)
    const tipo2Tech = queriesPadrao.filter((q) => q.type === "technology");
    assert.equal(tipo2Tech.length, 3, "Devem haver exatamente 3 queries de Tecnologia (Tipo 2)");
    for (const q of tipo2Tech) {
      assert.equal(q.terms.length, 1, "Query de tecnologia deve conter exatamente 1 termo");
      assert.ok(
        CATALOGO_TECNOLOGIAS.core.includes(q.terms[0]),
        `Termo '${q.terms[0]}' deve pertencer ao CATALOGO_TECNOLOGIAS.core`,
      );
      assert.ok(
        q.query.startsWith(`"${q.terms[0]}" AND `),
        "Formato booleano de tecnologia deve iniciar com o termo e operador AND",
      );
    }

    // 2.4 Exatamente 3 queries Combinadas Cargo + Tech (Tipo 3)
    const tipo3Combined = queriesPadrao.filter((q) => q.type === "combined");
    assert.equal(tipo3Combined.length, 3, "Devem haver exatamente 3 queries Combinadas (Tipo 3)");
    for (const q of tipo3Combined) {
      assert.equal(q.terms.length, 2, "Query combinada deve conter 2 termos (cargo e tech)");
      assert.ok(
        CATALOGO_CARGOS.includes(q.terms[0]),
        `Termo de cargo '${q.terms[0]}' deve pertencer ao catálogo`,
      );
      assert.ok(
        CATALOGO_TECNOLOGIAS.core.includes(q.terms[1]),
        `Termo de tech '${q.terms[1]}' deve pertencer ao catálogo`,
      );
      assert.ok(
        q.query.startsWith(`"${q.terms[0]}" AND "${q.terms[1]}" AND `),
        "Formato booleano combinado deve conter ambos os termos e operador AND",
      );
    }

    // 2.5 Sem explosão cartesiana: não gera combinações excessivas
    const totalCombinacoesPossiveis = CATALOGO_CARGOS.length * CATALOGO_TECNOLOGIAS.core.length;
    assert.ok(
      totalCombinacoesPossiveis > 100,
      "Pool completo geraria mais de 100 combinações cartesianas",
    );
    assert.equal(
      queriesPadrao.length,
      8,
      "Motor deve limitar a seleção estritamente ao número planejado (8) sem explosão",
    );

    // 2.6 Respeita maxQueries configurado
    const queriesCustom = selecionarQueriesBalanceadas(
      { maxQueries: 4 },
      historicoVazio,
      nowMs,
    );
    assert.equal(
      queriesCustom.length,
      4,
      "Deve respeitar o teto de maxQueries quando configurado (4)",
    );
    console.log("   ✅ Distribuição balanceada (2 role, 3 tech, 3 combined) sem explosão: OK\n");

    // ── 3. Persistência e Recuperação de Histórico ──────────────────────────
    console.log("3. Testando persistência e recuperação do histórico de execuções...");

    // 3.1 Histórico inicial quando arquivo não existe
    const historicoInexistente = carregarHistorico(historyPath);
    assert.deepEqual(
      historicoInexistente,
      { records: [] },
      "Histórico de arquivo inexistente deve retornar records vazio",
    );

    // 3.2 Salva primeiro registro com telemetria completa
    const registro1: QueryExecutionRecord = {
      query: '"React" AND ("enviar currículo" OR "email")',
      type: "technology",
      terms: ["React"],
      executedAt: new Date(nowMs).toISOString(),
      postsFound: 18,
      qualifiedJobs: 4,
    };

    salvarRegistroExecucao(registro1, historyPath);

    // 3.3 Carrega e valida persistência de todos os campos
    const historicoAposSalvar1 = carregarHistorico(historyPath);
    assert.equal(historicoAposSalvar1.records.length, 1, "Deve conter exatamente 1 registro");
    const salvo1 = historicoAposSalvar1.records[0];
    assert.equal(salvo1.query, registro1.query, "Query persistida deve ser idêntica");
    assert.equal(salvo1.type, registro1.type, "Tipo persistido deve ser idêntico");
    assert.deepEqual(salvo1.terms, registro1.terms, "Termos persistidos devem ser idênticos");
    assert.equal(salvo1.executedAt, registro1.executedAt, "Timestamp persistido deve ser idêntico");
    assert.equal(salvo1.postsFound, 18, "Posts encontrados deve ser 18");
    assert.equal(salvo1.qualifiedJobs, 4, "Vagas qualificadas deve ser 4");
    assert.ok(historicoAposSalvar1.lastRunAt, "Deve preencher lastRunAt");

    // 3.4 Atualiza com segurança sem corromper histórico existente
    const registro2: QueryExecutionRecord = {
      query: '"desenvolvedor" AND ("enviar currículo" OR "email")',
      type: "role",
      terms: ["desenvolvedor"],
      executedAt: new Date(nowMs + 60000).toISOString(),
      postsFound: 22,
      qualifiedJobs: 2,
    };

    salvarRegistroExecucao(registro2, historyPath);

    const historicoAposSalvar2 = carregarHistorico(historyPath);
    assert.equal(historicoAposSalvar2.records.length, 2, "Deve conter 2 registros");
    assert.equal(
      historicoAposSalvar2.records[0].query,
      registro2.query,
      "Registro mais recente deve ser inserido no topo (unshift)",
    );
    assert.equal(
      historicoAposSalvar2.records[1].query,
      registro1.query,
      "Registro anterior deve ser preservado intacto",
    );

    // 3.5 Arquivo corrompido é tratado de forma segura sem lançar exceção
    const corruptPath = path.join(tempDir, "corrupted-history.json");
    fs.writeFileSync(corruptPath, "{ json invalido incompleto", "utf-8");
    const historicoCorrompido = carregarHistorico(corruptPath);
    assert.deepEqual(
      historicoCorrompido,
      { records: [] },
      "Arquivo corrompido deve retornar fallback { records: [] } sem quebrar",
    );

    console.log("   ✅ Persistência de telemetria e integridade de histórico: OK\n");

    console.log("=========================================================");
    console.log("  🎉 TODOS OS TESTES DO QUERY BUILDER PASSARAM COM SUCESSO!");
    console.log("=========================================================");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error("\n❌ ERRO NA EXECUÇÃO DOS TESTES:", err);
  process.exit(1);
});
