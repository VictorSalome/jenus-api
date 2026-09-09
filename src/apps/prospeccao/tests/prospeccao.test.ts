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
  HD_RESOLUTION_SUFFIX,
} from "../scraper/utils/googlePhotos.js";
import {
  executarDisparador,
  dispararParaEmpresa,
} from "../services/dispatcher.service.js";
import prospeccaoRouter from "../routes/prospeccao.routes.js";
import { setExecutarCicloOverride } from "../services/scheduler.service.js";

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

    // Descarte de avatares/tiles
    const avatarUrl = "https://maps.gstatic.com/tactile/pane/default_avatar.png";
    assert.equal(normalizarFotoGoogle(avatarUrl), "", "Avatares devem ser descartados");

    // Teste de lista com deduplicação
    const listaNormalizada = normalizarListaFotos([
      googleFotoOriginal,
      "https://lh3.googleusercontent.com/p/AF1QipNxyz=s400", // duplicada na mesma chave base
      avatarUrl,
      "https://lh3.googleusercontent.com/p/AF1QipOutra=w100",
    ]);
    assert.equal(listaNormalizada.length, 2, "Lista deve descartar avatar e deduplicar foto repetida");
    console.log("  ✓ googlePhotos: conversão HD, StreetView e descarte de avatares validados.\n");

    // ----------------------------------------------------
    // 4. Disparador dispatcher.service.ts
    // ----------------------------------------------------
    console.log("▶ [4/6] Testando Disparador (dispatcher.service.ts)...");

    // 4.1 Testar dispararParaEmpresa diretamente com WhatsApp
    const leadWhatsAppApenas = {
      ...buscadaPorSlug!,
      email: null,
      whatsapp: "+55 (11) 99999-8888",
    };
    const resWa = await dispararParaEmpresa(leadWhatsAppApenas, { dryRun: true });
    assert.equal(resWa.canal, "WHATSAPP");
    assert.equal(resWa.sucesso, true);
    assert.ok(resWa.waLink?.startsWith("https://wa.me/5511999998888"));
    console.log("  ✓ Disparo WhatsApp individual gerou link wa.me válido.");

    // 4.2 Testar executarDisparador com dryRun: true
    // Garantir que a empresa de teste está APROVADA com email preenchido
    await db.run(
      "UPDATE prospeccao_empresas SET status = ?, email = ? WHERE id = ?",
      StatusLead.APROVADA,
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
    assert.equal(resultadoTeste.statusFinal, StatusLead.ENVIADA);
    console.log("  ✓ executarDisparador executado em dryRun com sucesso (email processado sem quebra).\n");

    // ----------------------------------------------------
    // 5. Testes de Rotas e Endpoints HTTP da API
    // ----------------------------------------------------
    console.log("▶ [5/6] Testando Rotas e Endpoints HTTP (/api/prospeccao)...");

    // Inicializar servidor Express em porta dinâmica
    const app = express();
    app.use(express.json());
    app.use("/api/prospeccao", prospeccaoRouter);

    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address() as any;
    const apiBase = `http://127.0.0.1:${address.port}/api/prospeccao`;
    console.log(`  ✓ Servidor de teste HTTP ouvindo em: ${apiBase}`);

    // Helper para requisições
    const requestJson = async (url: string, options?: RequestInit): Promise<{ status: number; ok: boolean; data: any }> => {
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
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
    assert.equal(resAprovarOk.data.message, "Lead aprovado com sucesso");
    assert.equal(resAprovarOk.data.data.status, StatusLead.APROVADA);

    // 5.5.2 ID inexistente (404)
    const resAprovarIdInexistente = await requestJson(`${apiBase}/empresa/00000000-0000-0000-0000-000000000000/aprovar`, {
      method: "POST",
    });
    assert.equal(resAprovarIdInexistente.status, 404, "POST /aprovar com ID inexistente deve responder 404");
    assert.equal(resAprovarIdInexistente.data.success, false);
    assert.equal(resAprovarIdInexistente.data.message, "Lead não encontrado");
    console.log("  ✓ [5/9] POST /empresa/:id/aprovar validado (200 aprovado e 404 para ID inexistente).");

    // 5.6 POST /api/prospeccao/empresa/:id/rejeitar
    // 5.6.1 Rejeição com sucesso e motivo
    const resRejeitarOk = await requestJson(`${apiBase}/empresa/${testCompanyId}/rejeitar`, {
      method: "POST",
      body: JSON.stringify({ motivo: "TESTE_REJEICAO_INTEGRACAO" }),
    });
    assert.equal(resRejeitarOk.status, 200, "POST /rejeitar deve responder 200");
    assert.equal(resRejeitarOk.data.success, true);
    assert.equal(resRejeitarOk.data.message, "Lead rejeitado com sucesso");
    assert.equal(resRejeitarOk.data.data.status, StatusLead.REJEITADA);
    assert.equal(resRejeitarOk.data.data.motivo_rejeicao, "TESTE_REJEICAO_INTEGRACAO");

    // 5.6.2 ID inexistente (404)
    const resRejeitarIdInexistente = await requestJson(`${apiBase}/empresa/00000000-0000-0000-0000-000000000000/rejeitar`, {
      method: "POST",
      body: JSON.stringify({ motivo: "NÃO_EXISTE" }),
    });
    assert.equal(resRejeitarIdInexistente.status, 404, "POST /rejeitar com ID inexistente deve responder 404");
    assert.equal(resRejeitarIdInexistente.data.success, false);
    assert.equal(resRejeitarIdInexistente.data.message, "Lead não encontrado");
    console.log("  ✓ [6/9] POST /empresa/:id/rejeitar validado (200 rejeitado com motivo e 404 para ID inexistente).");

    // 5.7 POST /api/prospeccao/empresa/:id/disparar (com dryRun: true)
    // 5.7.1 Primeiro re-aprovar para poder disparar
    await requestJson(`${apiBase}/empresa/${testCompanyId}/aprovar`, { method: "POST" });

    // Disparo em dryRun
    const resDispararOk = await requestJson(`${apiBase}/empresa/${testCompanyId}/disparar`, {
      method: "POST",
      body: JSON.stringify({ dryRun: true }),
    });
    assert.equal(resDispararOk.status, 200, "POST /disparar com dryRun: true deve responder 200");
    assert.equal(resDispararOk.data.success, true);
    assert.ok(resDispararOk.data.data.sucesso, "Resultado do disparo deve indicar sucesso");
    assert.equal(resDispararOk.data.data.empresaId, testCompanyId);
    assert.equal(resDispararOk.data.data.canal, "EMAIL");

    // 5.7.2 ID inexistente (404)
    const resDispararIdInexistente = await requestJson(`${apiBase}/empresa/00000000-0000-0000-0000-000000000000/disparar`, {
      method: "POST",
      body: JSON.stringify({ dryRun: true }),
    });
    assert.equal(resDispararIdInexistente.status, 404, "POST /disparar com ID inexistente deve responder 404");
    assert.equal(resDispararIdInexistente.data.success, false);
    assert.equal(resDispararIdInexistente.data.message, "Lead não encontrado");
    console.log("  ✓ [7/9] POST /empresa/:id/disparar validado (200 dryRun ok e 404 para ID inexistente).");

    // 5.8 POST /api/prospeccao/empresa/:id/converter
    // 5.8.1 Conversão com sucesso
    const resConverterOk = await requestJson(`${apiBase}/empresa/${testCompanyId}/converter`, {
      method: "POST",
    });
    assert.equal(resConverterOk.status, 200, "POST /converter deve responder 200");
    assert.equal(resConverterOk.data.success, true);
    assert.equal(resConverterOk.data.message, "Lead convertido com sucesso em cliente oficial");
    assert.equal(resConverterOk.data.data.status, StatusLead.CONVERTIDA);

    // 5.8.2 ID inexistente (404)
    const resConverterIdInexistente = await requestJson(`${apiBase}/empresa/00000000-0000-0000-0000-000000000000/converter`, {
      method: "POST",
    });
    assert.equal(resConverterIdInexistente.status, 404, "POST /converter com ID inexistente deve responder 404");
    assert.equal(resConverterIdInexistente.data.success, false);
    assert.equal(resConverterIdInexistente.data.message, "Lead não encontrado");
    console.log("  ✓ [8/9] POST /empresa/:id/converter validado (200 convertido e 404 para ID inexistente).");

    // 5.9 POST /api/prospeccao/executar (verificar resposta quando termo fornecido)
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
    assert.equal(resExecutarErro.data.message, "Erro ao executar ciclo de prospecção");
    assert.equal(resExecutarErro.data.error, "Simulação de falha no pipeline de prospecção");

    // Restaurar override
    setExecutarCicloOverride(null);
    console.log("  ✓ [9/9] POST /executar validado (200 com payload estruturado e 500 no tratamento de erros).\n");

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
