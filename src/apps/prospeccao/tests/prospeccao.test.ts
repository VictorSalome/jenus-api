import assert from "node:assert/strict";
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

async function runTests() {
  console.log("==================================================");
  console.log("🧪 Iniciando Validação Fase 1 - Prospecção");
  console.log("==================================================\n");

  let testCompanyId: string | null = null;
  const testSlug = "barbearia-teste-alpha";

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
    // 5. Limpeza de dados de teste
    // ----------------------------------------------------
    console.log("▶ [5/6] Limpando dados de teste da base SQLite...");
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
