import assert from "node:assert/strict";
import {
  extrairEmails,
  extrairSkills,
  extrairTitulo,
  extrairEmpresa,
  extrairRequisitos,
  calcularConfidence,
  parsePostParaVaga,
  deduplicarVagas,
  exportarParaVagasEmailFormat,
  normalizarUrlPost,
  normalizarTextoParaDeduplicacao,
  isCanonicalLinkedInPostUrl,
  normalizarParaCanonicalPostUrl,
} from "./linkedin-job.parser.js";
import type { RawLinkedInPost } from "./linkedin.types.js";

async function runTests() {
  console.log("=========================================================");
  console.log("  🧪 TESTES UNITÁRIOS: LINKEDIN JOB PARSER (FASE 1)");
  console.log("=========================================================\n");

  // ── 1. Teste de Extração de E-mails ──────────────────────────────────────
  console.log("1. Testando extração e sanitização de e-mails...");
  const textoComEmails = `
    Interessados enviar currículo para vagas.tech@empresa.com.br.
    Ou para contato@startup.io;
    Evitar emails como support@linkedin.com ou erro@sentry.io ou avatar@2x.png
    Mais um e-mail válido: recrutamento_ti@grupotalentos.com.br!
  `;
  const emails = extrairEmails(textoComEmails);
  assert.equal(emails.length, 3, "Deve extrair exatamente 3 e-mails válidos");
  assert.ok(emails.includes("vagas.tech@empresa.com.br"), "Deve conter vagas.tech@empresa.com.br");
  assert.ok(emails.includes("contato@startup.io"), "Deve conter contato@startup.io");
  assert.ok(emails.includes("recrutamento_ti@grupotalentos.com.br"), "Deve conter recrutamento_ti@grupotalentos.com.br");
  assert.ok(!emails.includes("support@linkedin.com"), "Deve ignorar linkedin.com");
  assert.ok(!emails.includes("erro@sentry.io"), "Deve ignorar sentry.io");
  assert.ok(!emails.some((e) => e.endsWith(".png")), "Deve ignorar extensão de imagem");
  console.log("   ✅ Extração de e-mails sanitizada: OK\n");

  // ── 2. Teste de Extração de Skills ─────────────────────────────────────────
  console.log("2. Testando extração de skills técnicas...");
  const textoComSkills = `
    Procuramos desenvolvedor com experiência sólida em React, Next.js e TypeScript.
    Desejável conhecimento em Node.js, Docker e bancos SQL (PostgreSQL).
  `;
  const skills = extrairSkills(textoComSkills);
  assert.ok(skills.includes("React"), "Deve identificar React");
  assert.ok(skills.includes("Next.js"), "Deve identificar Next.js");
  assert.ok(skills.includes("TypeScript"), "Deve identificar TypeScript");
  assert.ok(skills.includes("Node.js"), "Deve identificar Node.js");
  assert.ok(skills.includes("Docker"), "Deve identificar Docker");
  assert.ok(skills.includes("SQL"), "Deve identificar SQL");
  console.log(`   ✅ Skills encontradas (${skills.join(", ")}): OK\n`);

  // ── 3. Teste de Garantia de Teto (1.00) e Piso (0.00) no Confidence Score ─
  console.log("3. Testando garantia de teto (1.00) e piso (0.00) no confidence score...");
  // Texto que acumula mais de 1.30 em indicadores positivos
  const textoSuperPositivo = `
    Estamos contratando! Vaga aberta para Desenvolvedor Full Stack Sênior.
    Requisitos: Principais atividades e perfil desejado.
    Modalidade: Remoto PJ.
    Salário e remuneração atrativa com benefícios.
    Envie seu currículo para rh@empresa.com.
    React, Node.js, TypeScript, Python, Docker.
  `;
  const confSuperPositivo = calcularConfidence(textoSuperPositivo, true, 5);
  assert.equal(confSuperPositivo.score, 1.0, "Score com múltiplos indicadores positivos deve ter teto estrito de 1.00");
  assert.ok(confSuperPositivo.score <= 1.0, "Score nunca pode ultrapassar 1.00");

  // Texto com múltiplas penalidades (novo cargo + opentowork + artigo)
  const textoSuperNegativo = `
    Comecei em um novo cargo e estou em busca de recolocação profissional #OpenToWork.
    Confira a matéria completa no link.
  `;
  const confSuperNegativo = calcularConfidence(textoSuperNegativo, false, 0);
  assert.equal(confSuperNegativo.score, 0.0, "Score com penalidades pesadas deve ter piso estrito de 0.00");
  assert.ok(confSuperNegativo.score >= 0.0, "Score nunca pode ser negativo");
  console.log("   ✅ Garantia de teto 1.00 e piso 0.00 rigorosamente respeitados: OK\n");

  // ── 4. Teste de Parsing de Post Legítimo Completo ─────────────────────────
  console.log("4. Testando parsing de post legítimo de vaga...");
  const postVagaLegitima: RawLinkedInPost = {
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678",
    authorName: "Mariana Silva",
    authorHeadline: "Tech Recruiter na Acme Tech",
    companyName: "Acme Tech",
    publishedAt: "2026-09-12T10:00:00.000Z",
    text: `
      🚀 ESTAMOS CONTRATANDO!
      Vaga: Desenvolvedor Full Stack Sênior (Node.js + React)

      Modalidade: 100% Remoto
      Contratação: CLT ou PJ

      Requisitos:
      • 5+ anos de experiência com desenvolvimento web
      • Domínio de Node.js, TypeScript e React
      • Experiência com arquitetura de microsserviços e Docker
      • Vivência com testes automatizados

      Interessados enviar currículo com pretensão salarial para:
      carreiras@acmetech.com.br
    `,
  };

  const resultadoVaga = parsePostParaVaga(postVagaLegitima, 0.65);
  assert.equal(resultadoVaga.isJob, true, "Post legítimo DEVE ser classificado como vaga");
  assert.ok(resultadoVaga.job !== null, "Objeto de vaga deve existir");
  assert.ok(resultadoVaga.confidenceScore >= 0.80, `Confidence deve ser alto (obtido: ${resultadoVaga.confidenceScore})`);
  assert.equal(resultadoVaga.job?.contactEmail, "carreiras@acmetech.com.br");
  assert.equal(resultadoVaga.job?.company, "Acme Tech");
  assert.ok(resultadoVaga.job?.title.includes("Desenvolvedor Full Stack Sênior"));
  assert.ok(resultadoVaga.job?.requirements.length >= 3, "Deve extrair lista de requisitos");
  assert.equal(resultadoVaga.job?.rawText, postVagaLegitima.text, "Deve preservar rawText na Fase 1");

  console.log("   Detalhes da pontuação calculada:");
  resultadoVaga.confidenceReasons.forEach((r) => console.log(`     ${r}`));
  console.log(`   Score final: ${resultadoVaga.confidenceScore}`);
  console.log("   ✅ Parsing de vaga legítima: OK\n");

  // ── 5. Caso Intermediário: Vaga sem E-mail (deve ser descartada) ───────────
  console.log("5. Testando vaga sem e-mail (deve ser descartada)...");
  const postSemEmail: RawLinkedInPost = {
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7111111111111111111",
    authorName: "Recrutador XYZ",
    text: `
      Estamos contratando Desenvolvedor React Sênior!
      Remoto, CLT.
      Requisitos: 4 anos de experiência, TypeScript e Redux.
      Inscrições pelo link na bio ou direct.
    `,
  };
  const resSemEmail = parsePostParaVaga(postSemEmail, 0.65);
  assert.equal(resSemEmail.isJob, false, "Vaga sem e-mail não pode ser aceita pelo worker");
  assert.equal(resSemEmail.discardReason, "SEM_EMAIL_NO_POST", "Motivo deve ser SEM_EMAIL_NO_POST");
  assert.equal(resSemEmail.job, null);
  console.log(`   Motivo de descarte: ${resSemEmail.discardReason}`);
  console.log("   ✅ Vaga sem e-mail descartada com sucesso: OK\n");

  // ── 6. Caso Intermediário: Post com E-mail + Skills, mas sem vaga ─────────
  console.log("6. Testando post com e-mail + skills, mas sem evidência de contratação...");
  const postProjetoComEmail: RawLinkedInPost = {
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7222222222222222222",
    authorName: "Lucas Dev",
    text: `
      Fala pessoal! Desenvolvi um projeto open source utilizando React, Node.js e TypeScript.
      O código está no GitHub e quem quiser bater um papo ou trocar ideias me manda um e-mail em lucas.dev@gmail.com!
    `,
  };
  const resProjeto = parsePostParaVaga(postProjetoComEmail, 0.65);
  assert.equal(resProjeto.isJob, false, "Projeto pessoal com e-mail não é vaga de emprego");
  assert.ok(resProjeto.confidenceScore < 0.65, `Confidence deve ser menor que 0.65 (obtido: ${resProjeto.confidenceScore})`);
  assert.ok(resProjeto.discardReason?.includes("CONFIDENCE_INSUFICIENTE"));
  console.log(`   Score obtido: ${resProjeto.confidenceScore} (abaixo do corte de 0.65)`);
  console.log(`   Motivo de descarte: ${resProjeto.discardReason}`);
  console.log("   ✅ Post com e-mail + skills sem contratação descartado: OK\n");

  // ── 7. Caso Intermediário: Vaga com poucos dados que atinge threshold ─────
  console.log("7. Testando vaga concisa com e-mail que atinge o threshold...");
  const postConcisoAprovado: RawLinkedInPost = {
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7333333333333333333",
    authorName: "RH Tech",
    text: `
      Temos vaga para Desenvolvedor.
      Interessados enviar currículo para recrutamento@empresa.com.br
    `,
  };
  const resConciso = parsePostParaVaga(postConcisoAprovado, 0.65);
  // +0.30 termo de vaga + 0.25 envio de cv + 0.20 email = 0.75 >= 0.65
  assert.equal(resConciso.isJob, true, "Vaga concisa que atinge 0.75 DEVE ser aprovada");
  assert.ok(resConciso.confidenceScore >= 0.65, `Score deve ser >= 0.65 (obtido: ${resConciso.confidenceScore})`);
  assert.equal(resConciso.job?.contactEmail, "recrutamento@empresa.com.br");
  console.log(`   Score obtido: ${resConciso.confidenceScore} (atingiu corte >= 0.65)`);
  console.log("   ✅ Vaga concisa com evidência real aprovada: OK\n");

  // ── 8. Teste de Falso Positivo: Celebração de Novo Cargo ────────────────────
  console.log("8. Testando filtro contra post de novo cargo (falso positivo)...");
  const postNovoCargo: RawLinkedInPost = {
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7999999999999999999",
    authorName: "João Souza",
    text: `
      É com muita alegria que compartilho que comecei em um novo cargo de Desenvolvedor Frontend na Empresa Tal!
      Gostaria de agradecer a todos que me apoiaram nessa jornada.
      Quem quiser trocar uma ideia, pode me chamar no email joao.dev@gmail.com!
    `,
  };

  const resultadoNovoCargo = parsePostParaVaga(postNovoCargo, 0.65);
  assert.equal(resultadoNovoCargo.isJob, false, "Post de novo cargo NÃO deve ser aceito como vaga");
  assert.ok(
    resultadoNovoCargo.confidenceReasons.some((r) => r.includes("Celebração de novo emprego")),
    "Deve apontar penalidade de novo cargo",
  );
  console.log(`   Motivo de descarte: ${resultadoNovoCargo.discardReason}`);
  console.log(`   Score: ${resultadoNovoCargo.confidenceScore}`);
  console.log("   ✅ Descarte de falso positivo (novo cargo): OK\n");

  // ── 9. Teste de Falso Positivo: Candidato Procurando Emprego (#OpenToWork) ─
  console.log("9. Testando filtro contra candidato buscando emprego (#OpenToWork)...");
  const postBuscandoEmprego: RawLinkedInPost = {
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7888888888888888888",
    authorName: "Carlos Pereira",
    text: `
      Olá rede, estou em busca de recolocação profissional como Desenvolvedor Backend Node.js.
      #OpenToWork
      Tenho experiência com APIs REST e bancos de dados SQL.
      Meu currículo está anexo e meu contato é carlos.ti@gmail.com.
    `,
  };

  const resultadoBuscando = parsePostParaVaga(postBuscandoEmprego, 0.65);
  assert.equal(resultadoBuscando.isJob, false, "Candidato buscando emprego NÃO é uma vaga");
  assert.ok(
    resultadoBuscando.confidenceReasons.some((r) => r.includes("OpenToWork")),
    "Deve conter penalidade de OpenToWork",
  );
  console.log(`   Motivo de descarte: ${resultadoBuscando.discardReason}`);
  console.log(`   Score: ${resultadoBuscando.confidenceScore}`);
  console.log("   ✅ Descarte de falso positivo (OpenToWork): OK\n");

  // ── 10. Teste de Deduplicação com Pequenas Diferenças de Texto / URL ───────
  console.log("10. Testando deduplicação com variações de tracking URL e pequenas variações de texto...");
  const vagaOriginal = resultadoVaga.job!;

  // Variação A: Mesma URL mas com query params de tracking diferentes (?trackingId=123 vs ?rcm=abc)
  const vagaTrackingA = {
    ...vagaOriginal,
    id: "vaga-track-a",
    sourceUrl: "https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678?trackingId=alpha_123",
  };
  const vagaTrackingB = {
    ...vagaOriginal,
    id: "vaga-track-b",
    sourceUrl: "https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678?trackingId=beta_999&rcm=xyz",
  };

  const deduplicadasUrl = deduplicarVagas([vagaTrackingA, vagaTrackingB]);
  assert.equal(deduplicadasUrl.length, 1, "Mesma activity com query params de tracking diferentes deve ser deduplicada");

  // Variação B: Posts com mesma URL canônica e pequenas variações de emojis/pontuações
  const vagaTextoA: typeof vagaOriginal = {
    ...vagaOriginal,
    id: "vaga-texto-a",
    sourceUrl: "https://www.linkedin.com/feed/update/urn:li:activity:7999888777666555444/",
    description: "🚀 Vaga Desenvolvedor Node.js! Envie seu cv: rh@empresa.com",
    contactEmail: "rh@empresa.com",
  };
  const vagaTextoB: typeof vagaOriginal = {
    ...vagaOriginal,
    id: "vaga-texto-b",
    sourceUrl: "https://www.linkedin.com/feed/update/urn:li:activity:7999888777666555444/?trackingId=xyz",
    description: "Vaga Desenvolvedor Node.js... Envie seu cv: rh@empresa.com.",
    contactEmail: "rh@empresa.com",
  };

  const deduplicadasTexto = deduplicarVagas([vagaTextoA, vagaTextoB]);
  assert.equal(deduplicadasTexto.length, 1, "Vagas com mesma activity e pequenas variações de texto devem ser deduplicadas");
  console.log("   ✅ Deduplicação robusta contra tracking URLs e pequenas variações de texto: OK\n");

  // ── 11. Teste de Exportação para o Contrato VagaEmailRaw ──────────────────
  console.log("11. Testando exportação para formato do worker (VagaEmailRaw)...");
  const vagasExportadas = exportarParaVagasEmailFormat([vagaOriginal]);
  assert.equal(vagasExportadas.length, 1);
  const vagaExportada = vagasExportadas[0];

  assert.ok(vagaExportada.id);
  assert.ok(vagaExportada.title);
  assert.ok(vagaExportada.company);
  assert.ok(vagaExportada.contactEmail);
  assert.ok(Array.isArray(vagaExportada.requirements));
  assert.ok(Array.isArray(vagaExportada.skills));

  // Garante que campos internos de depuração NÃO vazam para o JSON de produção
  assert.equal((vagaExportada as any).confidenceScore, undefined, "confidenceScore deve ser omitido no JSON final");
  assert.equal((vagaExportada as any).confidenceReasons, undefined, "confidenceReasons deve ser omitido no JSON final");
  assert.equal((vagaExportada as any).rawText, undefined, "rawText deve ser omitido no JSON final");
  console.log("   ✅ Exportação limpa conforme contrato VagaEmailRaw: OK\n");

  // ── 12. Teste Estrito de Validação de sourceUrl Canônica ─────────────────
  console.log("12. Testando validação estrita de sourceUrl da publicação...");

  // 12.1 Validação de URLs legítimas
  assert.equal(
    isCanonicalLinkedInPostUrl("https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/"),
    true,
    "URL /feed/update/urn:li:activity:... DEVE ser válida",
  );
  assert.equal(
    isCanonicalLinkedInPostUrl("https://www.linkedin.com/posts/empresa_vaga-activity-7123456789012345678-abcd/"),
    true,
    "URL /posts/...activity... DEVE ser válida",
  );
  assert.equal(
    isCanonicalLinkedInPostUrl("https://www.linkedin.com/posts/recrutador_vaga-share-7123456789012345678-xyz/"),
    true,
    "URL /posts/...share... DEVE ser válida",
  );

  // 12.2 Rejeição de URLs inválidas (Perfil, Company, Busca, Vazia)
  assert.equal(
    isCanonicalLinkedInPostUrl("https://www.linkedin.com/in/eliza-zanesco-546570263/"),
    false,
    "URL de perfil (/in/...) DEVE ser REJEITADA",
  );
  assert.equal(
    isCanonicalLinkedInPostUrl("https://www.linkedin.com/company/acmetech/"),
    false,
    "URL de empresa (/company/...) DEVE ser REJEITADA",
  );
  assert.equal(
    isCanonicalLinkedInPostUrl("https://www.linkedin.com/search/results/content/"),
    false,
    "URL de busca (/search/...) DEVE ser REJEITADA",
  );
  assert.equal(
    isCanonicalLinkedInPostUrl(""),
    false,
    "String vazia DEVE ser REJEITADA",
  );
  assert.equal(
    isCanonicalLinkedInPostUrl(undefined),
    false,
    "URL undefined DEVE ser REJEITADA",
  );

  // 12.3 Descarte no parser de post com URL inválida ou ausente
  const postComPerfil: RawLinkedInPost = {
    url: "https://www.linkedin.com/in/recrutador-teste/", // URL de perfil
    text: "Estamos contratando Desenvolvedor React! Envie cv para rh@empresa.com",
  };
  const resPerfil = parsePostParaVaga(postComPerfil, 0.65);
  assert.equal(resPerfil.isJob, false, "Post com URL de perfil DEVE ser descartado");
  assert.equal(resPerfil.discardReason, "SEM_URL_CANONICA_PUBLICACAO");

  const postSemUrl: RawLinkedInPost = {
    url: "", // URL vazia
    text: "Estamos contratando Desenvolvedor Node.js! Envie cv para rh@empresa.com",
  };
  const resSemUrl = parsePostParaVaga(postSemUrl, 0.65);
  assert.equal(resSemUrl.isJob, false, "Post com URL vazia DEVE ser descartado");
  assert.equal(resSemUrl.discardReason, "SEM_URL_CANONICA_PUBLICACAO");

  console.log("   ✅ sourceUrl de perfil, vazia ou inválida rejeitada com sucesso: OK\n");

  // ── 13. Teste de Extração Refinada de Empresa (company) ───────────────────
  console.log("13. Testando extração refinada de empresa (company)...");

  // 13.1 Extração a partir do domínio corporativo de e-mail
  const empEmail = extrairEmpresa(
    "Vaga desenvolvedor em Salvador. Envie CV",
    "Geane Barros",
    "",
    "",
    "geane.barros@tessatalent.com",
  );
  assert.equal(empEmail, "Tessatalent", "Deve extrair nome da empresa a partir do domínio corporativo");

  // 13.2 Extração a partir da headline do recrutador
  const empHeadline = extrairEmpresa(
    "Vaga desenvolvedor Full Stack. Envie CV",
    "Simone Santos",
    "",
    "Tech Recruiter na Pasquali Solution | TI",
    "simone.recruiter@gmail.com",
  );
  assert.equal(empHeadline, "Pasquali Solution", "Deve extrair empresa da headline do autor");

  // 13.3 Extração a partir do padrão no texto da vaga
  const empTexto = extrairEmpresa(
    "Oportunidade para atuar na ACT Digital como Desenvolvedor .NET. Envie cv para recrutamento@gmail.com",
    "Recrutador",
    "",
    "",
    "recrutamento@gmail.com",
  );
  assert.equal(empTexto, "ACT Digital", "Deve extrair empresa citada no texto");

  console.log("   ✅ Extração de empresa por domínio corporativo, headline e texto: OK\n");

  console.log("=========================================================");
  console.log("  🎉 TODOS OS 13 TESTES DO PARSER PASSARAM COM SUCESSO!");
  console.log("=========================================================");
}

runTests().catch((err) => {
  console.error("❌ Falha nos testes:", err);
  process.exit(1);
});
