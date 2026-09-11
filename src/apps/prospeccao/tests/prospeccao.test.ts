import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { initDb, getDb } from "../../../core/database.js";
import {
  salvarEmpresa,
  buscarPorSlug,
  buscarPorId,
  listarEmpresas,
  listarPorStatus,
  atualizarStatus,
  obterEstatisticas,
} from "../repositories/empresa.repository.js";
import { StatusLead } from "../types.js";
import { slugify } from "../scraper/utils/slugify.js";
import { sanitizePhone } from "../scraper/utils/phoneSanitizer.js";
import {
  normalizarFotoGoogle,
  normalizarListaFotos,
  normalizarListaFotosComMeta,
  calcularConfiancaFoto,
  HD_RESOLUTION_SUFFIX,
} from "../scraper/utils/googlePhotos.js";
import {
  executarDisparador,
  dispararParaEmpresa,
} from "../services/dispatcher.service.js";
import prospeccaoRouter from "../routes/prospeccao.routes.js";
import { setExecutarCicloOverride } from "../services/scheduler.service.js";
import { generateAccessToken } from "../../../shared/auth/jwt-auth.js";
import { globalErrorHandler } from "../../../shared/http/error-handler.js";

async function runTests() {
  console.log("==================================================");
  console.log("🧪 Iniciando Validação Fase 1 - Prospecção");
  console.log("==================================================\n");

  let testCompanyId: string | null = null;
  const testSlug = "barbearia-teste-alpha";
  let server: http.Server | null = null;

  try {
    // ----------------------------------------------------
    // 1. Migração do SQLite (initDb e prospeccao_empresas)
    // ----------------------------------------------------
    console.log("▶ [1/6] Testando inicialização do banco e migração...");
    const db = await initDb();
    assert.ok(db, "Banco de dados deve ser retornado por initDb");

    const tableInfo = await db.all(
      "PRAGMA table_info(prospeccao_empresas)"
    );
    assert.ok(
      tableInfo && tableInfo.length > 0,
      "Tabela 'prospeccao_empresas' deve existir após migrações"
    );

    const colNames = tableInfo.map((c: any) => c.name);
    const requiredCols = [
      "id",
      "nome",
      "slug",
      "segmento",
      "cidade",
      "bairro",
      "endereco",
      "telefone",
      "whatsapp",
      "email",
      "maps_url",
      "avaliacao",
      "total_avaliacoes",
      "fotos",
      "status",
      "motivo_rejeicao",
      "created_at",
      "updated_at",
    ];
    for (const col of requiredCols) {
      assert.ok(
        colNames.includes(col),
        `Coluna '${col}' deve estar presente na tabela prospeccao_empresas`
      );
    }
    console.log("  ✓ Tabela 'prospeccao_empresas' verificada com sucesso (18 colunas operacionais).\n");

    // Limpar resíduo anterior se houver
    await db.run("DELETE FROM prospeccao_empresas WHERE slug = ?", testSlug);

    // ----------------------------------------------------
    // 2. Repositório empresa.repository.ts
    // ----------------------------------------------------
    console.log("▶ [2/6] Testando Repositório (empresa.repository.ts)...");

    // 2.1 Salvar empresa teste
    const empresaCriada = await salvarEmpresa({
      nome: "Barbearia Teste Alpha",
      slug: testSlug,
      segmento: "Barbearia",
      cidade: "São Paulo",
      bairro: "Pinheiros",
      endereco: "Rua Teste Alpha, 123",
      telefone: "+55 (11) 98765-4321",
      whatsapp: "+55 (11) 98765-4321",
      email: "contato@barbeariaalpha.com.br",
      avaliacao: 4.9,
      total_avaliacoes: 150,
      fotos: ["https://lh3.googleusercontent.com/p/AF1QipNxyz=w100"],
      status: StatusLead.PENDENTE,
    });

    assert.ok(empresaCriada.id, "Empresa salva deve possuir um id");
    assert.equal(empresaCriada.slug, testSlug);
    assert.equal(empresaCriada.status, StatusLead.PENDENTE);
    testCompanyId = empresaCriada.id;
    console.log(`  ✓ Empresa salva com ID: ${testCompanyId}`);

    // 2.2 Buscar por slug
    const buscadaPorSlug = await buscarPorSlug(testSlug);
    assert.ok(buscadaPorSlug, "Empresa deve ser encontrada por slug");
    assert.equal(buscadaPorSlug.id, testCompanyId);
    assert.equal(buscadaPorSlug.nome, "Barbearia Teste Alpha");
    assert.equal(buscadaPorSlug.email, "contato@barbeariaalpha.com.br");
    assert.deepEqual(buscadaPorSlug.fotos, ["https://lh3.googleusercontent.com/p/AF1QipNxyz=w100"]);
    console.log("  ✓ Busca por slug validada.");

    // 2.3 Deduplicação (salvar novamente mesma empresa pelo slug/telefone)
    const empresaAtualizada = await salvarEmpresa({
      nome: "Barbearia Teste Alpha Renovada",
      slug: testSlug,
      segmento: "Barbearia Premium",
    });
    assert.equal(
      empresaAtualizada.id,
      testCompanyId,
      "Deduplicação deve atualizar registro existente mantendo o mesmo ID"
    );
    assert.equal(empresaAtualizada.nome, "Barbearia Teste Alpha Renovada");

    const totalSlug = await db.get<{ total: number }>(
      "SELECT count(*) as total FROM prospeccao_empresas WHERE slug = ?",
      testSlug
    );
    assert.equal(totalSlug?.total, 1, "Não devem existir registros duplicados com mesmo slug");
    console.log("  ✓ Deduplicação validada (idempotência confirmada).");

    // 2.4 Listar por status e atualizar status
    await atualizarStatus(testCompanyId, StatusLead.APROVADA);
    const atualizada = await buscarPorId(testCompanyId);
    assert.equal(atualizada?.status, StatusLead.APROVADA, "Status deve ser APROVADA");

    const listaAprovadas = await listarPorStatus(StatusLead.APROVADA);
    assert.ok(
      listaAprovadas.some((e) => e.id === testCompanyId),
      "Empresa deve constar na listagem de APROVADA"
    );
    console.log("  ✓ Atualização e listagem por status validadas.");

    // 2.5 Obter estatísticas
    const stats = await obterEstatisticas();
    assert.ok(typeof stats[StatusLead.PENDENTE] === "number");
    assert.ok(typeof stats[StatusLead.APROVADA] === "number");
    assert.ok(stats[StatusLead.APROVADA] >= 1, "Stats deve refletir pelo menos 1 aprovada");
    console.log("  ✓ Obtenção de estatísticas validada:", stats);
    console.log("");

    // ----------------------------------------------------
    // 3. Utilitários de Scraper
    // ----------------------------------------------------
    console.log("▶ [3/6] Testando Utilitários de Scraper...");

    // 3.1 slugify
    const slug1 = slugify("Barbearia & Cabelo São João!");
    assert.equal(slug1, "barbearia-cabelo-sao-joao", "Slugify deve remover acentos e símbolos");
    const slug2 = slugify("   Múltiplos    Espaços --- e Traços   ");
    assert.equal(slug2, "multiplos-espacos-e-tracos");
    const slug3 = slugify("Café com Açúcar 100% Ótimo");
    assert.equal(slug3, "cafe-com-acucar-100-otimo");
    console.log("  ✓ slugify: conversão com acentos, pontuações e espaçamento validada.");

    // 3.2 phoneSanitizer
    // Celular com 55
    const telCelCom55 = sanitizePhone("+55 (11) 98765-4321");
    assert.equal(telCelCom55.raw, "5511987654321");
    assert.equal(telCelCom55.isWhatsapp, true);
    assert.equal(telCelCom55.waLink, "https://wa.me/5511987654321");

    // Celular sem 55
    const telCelSem55 = sanitizePhone("(11) 98765-4321");
    assert.equal(telCelSem55.raw, "5511987654321");
    assert.equal(telCelSem55.isWhatsapp, true);
    assert.equal(telCelSem55.waLink, "https://wa.me/5511987654321");

    // Celular com zero DDD
    const telComZero = sanitizePhone("011987654321");
    assert.equal(telComZero.raw, "5511987654321");
    assert.equal(telComZero.isWhatsapp, true);

    // Telefone fixo (8 dígitos após DDD)
    const telFixo = sanitizePhone("(11) 3456-7890");
    assert.equal(telFixo.raw, "551134567890");
    assert.equal(telFixo.isWhatsapp, false);
    assert.equal(telFixo.waLink, null);
    assert.equal(telFixo.formatted, "+55 (11) 3456-7890");

    // Telefone fixo com 55
    const telFixoCom55 = sanitizePhone("+55 11 3456-7890");
    assert.equal(telFixoCom55.raw, "551134567890");
    assert.equal(telFixoCom55.isWhatsapp, false);
    assert.equal(telFixoCom55.waLink, null);

    console.log("  ✓ phoneSanitizer: celular/fixo, com/sem 55, DDD e links wa.me validados.");

    // 3.3 googlePhotos
    const googleFotoOriginal = "https://lh3.googleusercontent.com/p/AF1QipNxyz=w200-h150-k-no";
    const googleFotoHD = normalizarFotoGoogle(googleFotoOriginal);
    assert.equal(
      googleFotoHD,
      `https://lh3.googleusercontent.com/p/AF1QipNxyz${HD_RESOLUTION_SUFFIX}`,
      "Foto do Google deve ser convertida com sufixo HD"
    );

    const streetView = "https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=abc&w=400&h=200";
    const streetViewHD = normalizarFotoGoogle(streetView);
    assert.ok(streetViewHD.includes("w=1200") && streetViewHD.includes("h=800"));

    // Descarte de avatares de revisores (/a/, /a-/) e ícones gstatic
    const avatarUrl = "https://maps.gstatic.com/tactile/pane/default_avatar.png";
    const reviewerAvatarUrl = "https://lh3.googleusercontent.com/a/ACg8ocLxyz=s120-c";
    const placeIconUrl = "https://gstatic.com/local/placeinfo/lgbtq_friendly_ic_24dp.png";
    assert.equal(normalizarFotoGoogle(avatarUrl), "", "Avatares padrão devem ser descartados");
    assert.equal(normalizarFotoGoogle(reviewerAvatarUrl), "", "Avatares de clientes (/a/) devem ser descartados");
    assert.equal(normalizarFotoGoogle(placeIconUrl), "", "Ícones gstatic devem ser descartados");
    assert.equal(calcularConfiancaFoto(googleFotoOriginal), "alta", "Fotos com /p/ devem ter confiança alta");
    assert.equal(calcularConfiancaFoto(reviewerAvatarUrl), null, "Avatares devem retornar confiança nula");

    // Teste de lista com FotoMeta e deduplicação
    const listaMeta = normalizarListaFotosComMeta([
      { url: googleFotoOriginal, source: "capa" },
      { url: "https://lh3.googleusercontent.com/p/AF1QipNxyz=s400", source: "galeria" }, // duplicada na mesma chave base
      { url: reviewerAvatarUrl },
      { url: placeIconUrl },
      { url: "https://lh3.googleusercontent.com/p/AF1QipOutra=w100", source: "galeria" },
    ]);
    assert.equal(listaMeta.length, 2, "Lista com meta deve descartar avatares, ícones e duplicatas");
    assert.equal(listaMeta[0].source, "capa");
    assert.equal(listaMeta[0].confianca, "alta");

    // Teste de lista legada com strings
    const listaNormalizada = normalizarListaFotos([
      googleFotoOriginal,
      "https://lh3.googleusercontent.com/p/AF1QipNxyz=s400",
      avatarUrl,
      "https://lh3.googleusercontent.com/p/AF1QipOutra=w100",
    ]);
    assert.equal(listaNormalizada.length, 2, "Lista deve descartar avatar e deduplicar foto repetida");
    console.log("  ✓ googlePhotos: conversão HD, StreetView, FotoMeta e descarte de avatares/ícones validados.\n");

    // ----------------------------------------------------
    // 4. Disparador dispatcher.service.ts
    // ----------------------------------------------------
    console.log("▶ [4/6] Testando Disparador (dispatcher.service.ts)...");

    // 4.1 Testar bloqueio de segurança: lead PENDING_REVIEW não pode ser disparado
    const leadPendente = {
      ...buscadaPorSlug!,
      email: null,
      whatsapp: "+55 (11) 99999-8888",
      status: StatusLead.PENDING_REVIEW,
    };
    const resBloqueado = await dispararParaEmpresa(leadPendente, { dryRun: true });
    assert.equal(resBloqueado.sucesso, false);
    assert.ok(resBloqueado.motivo?.includes("BLOQUEADO_NAO_APROVADO"), "Lead pendente deve ser bloqueado");
    console.log("  ✓ Trava de segurança validada: lead pendente não pode ser disparado.");

    // 4.2 Testar dispararParaEmpresa após aprovação explícita
    const leadAprovado = {
      ...leadPendente,
      status: StatusLead.APPROVED,
    };
    const resWa = await dispararParaEmpresa(leadAprovado, { dryRun: true });
    assert.equal(resWa.canal, "WHATSAPP");
    assert.equal(resWa.sucesso, true);
    assert.ok(resWa.waLink?.startsWith("https://wa.me/5511999998888"));
    console.log("  ✓ Disparo WhatsApp de lead aprovado gerou link wa.me válido.");

    // 4.3 Testar executarDisparador com dryRun: true
    // Garantir que a empresa de teste está APROVADA com email preenchido
    await db.run(
      "UPDATE prospeccao_empresas SET status = ?, email = ? WHERE id = ?",
      StatusLead.APPROVED,
      "contato@barbeariaalpha.com.br",
      testCompanyId
    );

    const resultadosDisparo = await executarDisparador({
      dryRun: true,
      minDelayMs: 0,
      maxDelayMs: 0,
    });

    assert.ok(Array.isArray(resultadosDisparo));
    const resultadoTeste = resultadosDisparo.find((r) => r.empresaId === testCompanyId);
    assert.ok(resultadoTeste, "Empresa de teste deve ter sido processada no dryRun");
    assert.equal(resultadoTeste.canal, "EMAIL");
    assert.equal(resultadoTeste.sucesso, true);
    assert.equal(resultadoTeste.statusFinal, StatusLead.SENT);
    console.log("  ✓ executarDisparador executado em dryRun com sucesso (email processado sem quebra).\n");

    // ----------------------------------------------------
    // 5. Testes de Rotas e Endpoints HTTP da API
    // ----------------------------------------------------
    console.log("▶ [5/6] Testando Rotas e Endpoints HTTP (/api/prospeccao)...");

    // Inicializar servidor Express em porta dinâmica
    const app = express();
    app.use(express.json());
    app.use("/api/prospeccao", prospeccaoRouter);
    app.use(globalErrorHandler);

    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address() as any;
    const apiBase = `http://127.0.0.1:${address.port}/api/prospeccao`;
    console.log(`  ✓ Servidor de teste HTTP ouvindo em: ${apiBase}`);

    // Helper para requisições
    const testToken = generateAccessToken({
      id: "test-admin",
      email: "admin@test.com",
      role: "admin",
    });

    const requestJson = async (url: string, options?: RequestInit): Promise<{ status: number; ok: boolean; data: any }> => {
      const res = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testToken}`,
          ...(options?.headers || {}),
        },
        ...options,
      });
      const data: any = await res.json().catch(() => null);
      return { status: res.status, ok: res.ok, data };
    };

    // 5.1 GET /api/prospeccao/status
    const resStatus = await requestJson(`${apiBase}/status`);
    assert.equal(resStatus.status, 200, "GET /status deve responder 200");
    assert.equal(resStatus.data.success, true);
    assert.ok(resStatus.data.data.estatisticas, "Deve conter estatisticas");
    assert.equal(typeof resStatus.data.data.estatisticas[StatusLead.PENDENTE], "number");
    assert.equal(typeof resStatus.data.data.estatisticas[StatusLead.APROVADA], "number");
    assert.equal(typeof resStatus.data.data.estatisticas[StatusLead.REJEITADA], "number");
    assert.equal(typeof resStatus.data.data.estatisticas[StatusLead.ENVIADA], "number");
    assert.equal(typeof resStatus.data.data.estatisticas[StatusLead.CONVERTIDA], "number");
    assert.ok(resStatus.data.data.scheduler, "Deve conter dados do scheduler");
    assert.equal(typeof resStatus.data.data.scheduler.rodando, "boolean");
    assert.equal(typeof resStatus.data.data.scheduler.cronExpressao, "string");
    console.log("  ✓ [1/9] GET /status validado (200, estatísticas e status scheduler ok).");

    // 5.2 GET /api/prospeccao/empresas (sem e com query param ?status=...)
    // 5.2.1 Sem query param
    const resEmpresasTodas = await requestJson(`${apiBase}/empresas`);
    assert.equal(resEmpresasTodas.status, 200, "GET /empresas deve responder 200");
    assert.equal(resEmpresasTodas.data.success, true);
    assert.ok(Array.isArray(resEmpresasTodas.data.data), "data deve ser array");
    assert.ok(
      resEmpresasTodas.data.data.some((e: any) => e.id === testCompanyId),
      "Empresa de teste deve constar na listagem geral"
    );

    // 5.2.2 Com ?status=PENDENTE
    const resEmpresasPendente = await requestJson(`${apiBase}/empresas?status=PENDENTE`);
    assert.equal(resEmpresasPendente.status, 200);
    assert.equal(resEmpresasPendente.data.success, true);
    for (const emp of resEmpresasPendente.data.data) {
      assert.equal(emp.status, StatusLead.PENDENTE, "Todos os itens devem ter status PENDENTE");
    }

    // 5.2.3 Com ?status=APROVADA
    const resEmpresasAprovada = await requestJson(`${apiBase}/empresas?status=APROVADA`);
    assert.equal(resEmpresasAprovada.status, 200);
    assert.equal(resEmpresasAprovada.data.success, true);
    for (const emp of resEmpresasAprovada.data.data) {
      assert.equal(emp.status, StatusLead.APROVADA, "Todos os itens devem ter status APROVADA");
    }

    // 5.2.4 Com ?status=ENVIADA
    const resEmpresasEnviada = await requestJson(`${apiBase}/empresas?status=ENVIADA`);
    assert.equal(resEmpresasEnviada.status, 200);
    assert.equal(resEmpresasEnviada.data.success, true);
    for (const emp of resEmpresasEnviada.data.data) {
      assert.equal(emp.status, StatusLead.ENVIADA, "Todos os itens devem ter status ENVIADA");
    }
    console.log("  ✓ [2/9] GET /empresas validado (com e sem query param ?status=PENDENTE/APROVADA/ENVIADA).");

    // 5.3 GET /api/prospeccao/empresa/:slug
    // 5.3.1 Slug existente
    const resSlugValido = await requestJson(`${apiBase}/empresa/${testSlug}`);
    assert.equal(resSlugValido.status, 200, "GET /empresa/:slug existente deve responder 200");
    assert.equal(resSlugValido.data.success, true);
    assert.equal(resSlugValido.data.data.id, testCompanyId);
    assert.equal(resSlugValido.data.data.slug, testSlug);
    assert.equal(resSlugValido.data.data.nome, "Barbearia Teste Alpha Renovada");

    // 5.3.2 Slug inexistente (404)
    const resSlugInexistente = await requestJson(`${apiBase}/empresa/slug-totalmente-inexistente-xyz`);
    assert.equal(resSlugInexistente.status, 404, "GET /empresa/:slug inexistente deve responder 404");
    assert.equal(resSlugInexistente.data.success, false);
    assert.equal(resSlugInexistente.data.message, "Empresa não encontrada");
    console.log("  ✓ [3/9] GET /empresa/:slug validado (200 com payload correto e 404 para slug inexistente).");

    // 5.4 PATCH /api/prospeccao/empresa/:id/status
    // 5.4.1 Atualização com sucesso
    const resPatchOk = await requestJson(`${apiBase}/empresa/${testCompanyId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: StatusLead.PENDENTE }),
    });
    assert.equal(resPatchOk.status, 200, "PATCH /empresa/:id/status deve responder 200");
    assert.equal(resPatchOk.data.success, true);
    assert.equal(resPatchOk.data.data.id, testCompanyId);
    assert.equal(resPatchOk.data.data.status, StatusLead.PENDENTE);

    // 5.4.2 Falha por body inválido (status ausente -> 400)
    const resPatchSemStatus = await requestJson(`${apiBase}/empresa/${testCompanyId}/status`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    assert.equal(resPatchSemStatus.status, 400, "PATCH sem status deve responder 400");
    assert.equal(resPatchSemStatus.data.success, false);
    assert.equal(resPatchSemStatus.data.message, "ID e status são obrigatórios");

    // 5.4.3 Falha por ID inexistente (404)
    const resPatchIdInexistente = await requestJson(`${apiBase}/empresa/00000000-0000-0000-0000-000000000000/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: StatusLead.APROVADA }),
    });
    assert.equal(resPatchIdInexistente.status, 404, "PATCH com ID inexistente deve responder 404");
    assert.equal(resPatchIdInexistente.data.success, false);
    assert.equal(resPatchIdInexistente.data.message, "Lead não encontrado");
    console.log("  ✓ [4/9] PATCH /empresa/:id/status validado (200 atualizado, 400 body inválido, 404 lead não encontrado).");

    // 5.5 POST /api/prospeccao/empresa/:id/aprovar
    // 5.5.1 Aprovação com sucesso
    const resAprovarOk = await requestJson(`${apiBase}/empresa/${testCompanyId}/aprovar`, {
      method: "POST",
    });
    assert.equal(resAprovarOk.status, 200, "POST /aprovar deve responder 200");
    assert.equal(resAprovarOk.data.success, true);
    assert.equal(resAprovarOk.data.message, "Lead aprovado na esteira de qualidade e pronto para envio");
    assert.equal(resAprovarOk.data.data.status, StatusLead.APPROVED);
    assert.ok(resAprovarOk.data.data.approved_at, "approved_at deve ser gravado");
    assert.equal(resAprovarOk.data.data.approved_by, "admin@test.com");

    // 5.5.2 ID inexistente (404)
    const resAprovarIdInexistente = await requestJson(`${apiBase}/empresa/00000000-0000-0000-0000-000000000000/aprovar`, {
      method: "POST",
    });
    assert.equal(resAprovarIdInexistente.status, 404, "POST /aprovar com ID inexistente deve responder 404");
    assert.equal(resAprovarIdInexistente.data.success, false);
    assert.equal(resAprovarIdInexistente.data.message, "Lead não encontrado");
    console.log("  ✓ [5/10] POST /empresa/:id/aprovar validado (200 aprovado com approved_at/by e 404 para ID inexistente).");

    // 5.6 POST /api/prospeccao/empresa/:id/rejeitar
    // 5.6.1 Rejeição com sucesso, motivo e auditoria
    const resRejeitarOk = await requestJson(`${apiBase}/empresa/${testCompanyId}/rejeitar`, {
      method: "POST",
      body: JSON.stringify({ motivo: "TESTE_REJEICAO_INTEGRACAO" }),
    });
    assert.equal(resRejeitarOk.status, 200, "POST /rejeitar deve responder 200");
    assert.equal(resRejeitarOk.data.success, true);
    assert.equal(resRejeitarOk.data.message, "Lead rejeitado com sucesso");
    assert.equal(resRejeitarOk.data.data.status, StatusLead.REJECTED);
    assert.equal(resRejeitarOk.data.data.rejection_reason, "TESTE_REJEICAO_INTEGRACAO");
    assert.ok(resRejeitarOk.data.data.rejected_at, "rejected_at deve ser gravado");
    assert.equal(resRejeitarOk.data.data.rejected_by, "admin@test.com");

    // 5.6.2 ID inexistente (404)
    const resRejeitarIdInexistente = await requestJson(`${apiBase}/empresa/00000000-0000-0000-0000-000000000000/rejeitar`, {
      method: "POST",
      body: JSON.stringify({ motivo: "NÃO_EXISTE" }),
    });
    assert.equal(resRejeitarIdInexistente.status, 404, "POST /rejeitar com ID inexistente deve responder 404");
    assert.equal(resRejeitarIdInexistente.data.success, false);
    assert.equal(resRejeitarIdInexistente.data.message, "Lead não encontrado");
    console.log("  ✓ [6/10] POST /empresa/:id/rejeitar validado (200 rejeitado com rejected_at/by/reason e 404 para ID inexistente).");

    // 5.7 POST /api/prospeccao/empresa/:id/disparar
    // 5.7.1 Bloqueio de segurança: lead rejeitado deve retornar 403 Forbidden
    const resDispararRejeitado = await requestJson(`${apiBase}/empresa/${testCompanyId}/disparar`, {
      method: "POST",
      body: JSON.stringify({ dryRun: true }),
    });
    assert.equal(resDispararRejeitado.status, 403, "Disparo de lead rejeitado deve retornar 403 Forbidden");
    assert.equal(resDispararRejeitado.data.success, false);
    assert.ok(resDispararRejeitado.data.message?.includes("BLOQUEADO_NAO_APROVADO"));

    // 5.7.2 Aprovar lead para liberar disparo
    await requestJson(`${apiBase}/empresa/${testCompanyId}/aprovar`, { method: "POST" });

    // Disparo em dryRun de lead aprovado
    const resDispararOk = await requestJson(`${apiBase}/empresa/${testCompanyId}/disparar`, {
      method: "POST",
      body: JSON.stringify({ dryRun: true }),
    });
    assert.equal(resDispararOk.status, 200, "POST /disparar com dryRun: true de lead aprovado deve responder 200");
    assert.equal(resDispararOk.data.success, true);
    assert.ok(resDispararOk.data.data.sucesso, "Resultado do disparo deve indicar sucesso");
    assert.equal(resDispararOk.data.data.empresaId, testCompanyId);
    assert.equal(resDispararOk.data.data.canal, "EMAIL");

    // 5.7.3 ID inexistente (404)
    const resDispararIdInexistente = await requestJson(`${apiBase}/empresa/00000000-0000-0000-0000-000000000000/disparar`, {
      method: "POST",
      body: JSON.stringify({ dryRun: true }),
    });
    assert.equal(resDispararIdInexistente.status, 404, "POST /disparar com ID inexistente deve responder 404");
    assert.equal(resDispararIdInexistente.data.success, false);
    assert.equal(resDispararIdInexistente.data.message, "Lead não encontrado");
    console.log("  ✓ [7/10] POST /empresa/:id/disparar validado (403 bloqueio não aprovado, 200 dryRun aprovado e 404 para ID inexistente).");

    // 5.8 POST /api/prospeccao/empresa/:id/responder
    const resResponderOk = await requestJson(`${apiBase}/empresa/${testCompanyId}/responder`, {
      method: "POST",
    });
    assert.equal(resResponderOk.status, 200, "POST /responder deve responder 200");
    assert.equal(resResponderOk.data.success, true);
    assert.equal(resResponderOk.data.message, "Lead marcado como respondido (em negociação)");
    assert.equal(resResponderOk.data.data.status, StatusLead.REPLIED);
    console.log("  ✓ [8/10] POST /empresa/:id/responder validado (200 marcado como REPLIED).");

    // 5.9 POST /api/prospeccao/empresa/:id/converter
    // 5.9.1 Conversão com sucesso
    const resConverterOk = await requestJson(`${apiBase}/empresa/${testCompanyId}/converter`, {
      method: "POST",
    });
    assert.equal(resConverterOk.status, 200, "POST /converter deve responder 200");
    assert.equal(resConverterOk.data.success, true);
    assert.equal(resConverterOk.data.message, "Lead convertido com sucesso em cliente oficial ativo");
    assert.equal(resConverterOk.data.data.status, StatusLead.CONVERTED);

    // 5.9.2 ID inexistente (404)
    const resConverterIdInexistente = await requestJson(`${apiBase}/empresa/00000000-0000-0000-0000-000000000000/converter`, {
      method: "POST",
    });
    assert.equal(resConverterIdInexistente.status, 404, "POST /converter com ID inexistente deve responder 404");
    assert.equal(resConverterIdInexistente.data.success, false);
    assert.equal(resConverterIdInexistente.data.message, "Lead não encontrado");
    console.log("  ✓ [9/10] POST /empresa/:id/converter validado (200 convertido e 404 para ID inexistente).");

    // 5.10 POST /api/prospeccao/executar (verificar resposta quando termo fornecido)
    // 5.9.1 Execução com termo fornecido (simulado de forma determinística)
    const mockTermo = "barbearia em osasco centro";
    setExecutarCicloOverride(async (termo, limite) => {
      return {
        data: new Date(),
        termo: termo || "padrão",
        coletados: limite || 3,
        enviados: 1,
        sucesso: true,
      };
    });

    const resExecutarOk = await requestJson(`${apiBase}/executar`, {
      method: "POST",
      body: JSON.stringify({ termo: mockTermo, limite: 3 }),
    });
    assert.equal(resExecutarOk.status, 200, "POST /executar deve responder 200 quando ciclo concluído");
    assert.equal(resExecutarOk.data.success, true);
    assert.equal(resExecutarOk.data.message, "Ciclo de prospecção executado com sucesso");
    assert.equal(resExecutarOk.data.data.termo, mockTermo);
    assert.equal(resExecutarOk.data.data.coletados, 3);
    assert.equal(resExecutarOk.data.data.enviados, 1);
    assert.equal(resExecutarOk.data.data.sucesso, true);

    // 5.9.2 Tratamento de erro na execução do ciclo (500)
    setExecutarCicloOverride(async () => {
      throw new Error("Simulação de falha no pipeline de prospecção");
    });

    const resExecutarErro = await requestJson(`${apiBase}/executar`, {
      method: "POST",
      body: JSON.stringify({ termo: "falha planejada" }),
    });
    assert.equal(resExecutarErro.status, 500, "POST /executar deve responder 500 em caso de erro no ciclo");
    assert.equal(resExecutarErro.data.success, false);
    assert.equal(resExecutarErro.data.error?.message, "Simulação de falha no pipeline de prospecção");

    // Restaurar override
    setExecutarCicloOverride(null);
    console.log("  ✓ [9/9] POST /executar validado (200 com payload estruturado e 500 no tratamento de erros).\n");

    // 5.10 GET /api/prospeccao/progresso
    const resProgresso = await requestJson(`${apiBase}/progresso`);
    assert.equal(resProgresso.status, 200, "GET /progresso deve responder 200");
    assert.equal(resProgresso.data.success, true);
    assert.ok(resProgresso.data.data, "Deve conter payload de progresso");
    assert.equal(typeof resProgresso.data.data.emExecucao, "boolean");
    assert.equal(typeof resProgresso.data.data.porcentagem, "number");
    assert.equal(typeof resProgresso.data.data.etapa, "string");
    console.log("  ✓ [10/11] GET /progresso validado (200 com estrutura ProgressoScraper).");

    // 5.11 POST /api/prospeccao/executar com async: true (202 Accepted)
    setExecutarCicloOverride(async (termo, limite) => {
      await new Promise((r) => setTimeout(r, 50));
      return {
        data: new Date(),
        termo: termo || "padrão",
        coletados: limite || 2,
        enviados: 1,
        sucesso: true,
      };
    });

    const resExecutarAsync = await requestJson(`${apiBase}/executar`, {
      method: "POST",
      body: JSON.stringify({ termo: "barbearia async", limite: 2, async: true }),
    });
    assert.equal(resExecutarAsync.status, 202, "POST /executar com async: true deve responder 202");
    assert.equal(resExecutarAsync.data.success, true);
    assert.equal(resExecutarAsync.data.message, "Mineração iniciada em segundo plano");
    assert.ok(resExecutarAsync.data.data, "Deve retornar estado do progresso");
    assert.equal(resExecutarAsync.data.data.termo, "barbearia async");

    // Aguardar conclusão da promessa de fundo
    await new Promise((r) => setTimeout(r, 100));

    const resProgressoAposAsync = await requestJson(`${apiBase}/progresso`);
    assert.equal(resProgressoAposAsync.data.data.emExecucao, false);
    assert.equal(resProgressoAposAsync.data.data.porcentagem, 100);
    assert.equal(resProgressoAposAsync.data.data.etapa, "Mineração concluída");
    setExecutarCicloOverride(null);
    console.log("  ✓ [11/11] POST /executar com async: true validado (202 Accepted e progresso finalizado em segundo plano).\n");

    // Fechar servidor HTTP
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    // ----------------------------------------------------
    // 6. Limpeza de dados de teste
    // ----------------------------------------------------
    console.log("▶ [6/6] Limpando dados de teste da base SQLite...");
    if (testCompanyId) {
      await db.run("DELETE FROM prospeccao_empresas WHERE id = ?", testCompanyId);
    }
    const cleanCheck = await buscarPorSlug(testSlug);
    assert.equal(cleanCheck, null, "Registro de teste deve ter sido completamente removido");
    console.log("  ✓ Base de dados limpa com sucesso.\n");

    console.log("==================================================");
    console.log("🎉 TODOS OS TESTES PASSARAM COM SUCESSO!");
    console.log("==================================================");
  } catch (error) {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve())).catch(() => {});
    }
    // Tentar limpar mesmo em caso de falha
    if (testCompanyId) {
      const db = await getDb();
      await db.run("DELETE FROM prospeccao_empresas WHERE id = ?", testCompanyId).catch(() => {});
    }
    console.error("❌ FALHA NOS TESTES:", error);
    process.exit(1);
  }
}

runTests();
