import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import {
  verificarSessaoSalva,
  verificarSinaisAutenticacao,
  obterCaminhoSessao,
} from "./linkedin-session.service.js";

async function runSessionTests() {
  console.log("=========================================================");
  console.log("  🧪 TESTES UNITÁRIOS: LINKEDIN SESSION SERVICE (FASE 2)");
  console.log("=========================================================\n");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-test-"));

  try {
    // 1. Arquivo não existente
    console.log("1. Testando quando o arquivo não existe...");
    const resNaoExiste = verificarSessaoSalva(path.join(tempDir, "nao-existe.json"));
    assert.equal(resNaoExiste.valida, false);
    assert.ok(resNaoExiste.motivo?.includes("não encontrado"));
    console.log("   ✅ Arquivo inexistente tratado corretamente: OK\n");

    // 2. Arquivo corrompido / JSON inválido
    console.log("2. Testando arquivo com JSON inválido / incompleto...");
    const corruptedPath = path.join(tempDir, "corrupted.json");
    fs.writeFileSync(corruptedPath, "{ invalid json", "utf-8");
    const resCorrompido = verificarSessaoSalva(corruptedPath);
    assert.equal(resCorrompido.valida, false);
    assert.ok(resCorrompido.motivo?.includes("Falha ao ler"));
    console.log("   ✅ JSON inválido tratado com segurança: OK\n");

    // 3. Ausência do cookie li_at
    console.log("3. Testando storageState sem cookie 'li_at'...");
    const semLiAtPath = path.join(tempDir, "sem-liat.json");
    fs.writeFileSync(
      semLiAtPath,
      JSON.stringify({ cookies: [{ name: "bcookie", value: "test" }] }),
      "utf-8",
    );
    const resSemLiAt = verificarSessaoSalva(semLiAtPath);
    assert.equal(resSemLiAt.valida, false);
    assert.ok(resSemLiAt.motivo?.includes("li_at"));
    console.log("   ✅ Cookie 'li_at' obrigatório validado: OK\n");

    // 4. Cookie li_at expirado no passado
    console.log("4. Testando cookie 'li_at' expirado...");
    const expiradoPath = path.join(tempDir, "expirado.json");
    const expiradoSec = Math.floor((Date.now() - 1000000) / 1000);
    fs.writeFileSync(
      expiradoPath,
      JSON.stringify({
        cookies: [
          {
            name: "li_at",
            value: "AQEDAS_valid_token_long_string_1234567890",
            expires: expiradoSec,
          },
        ],
      }),
      "utf-8",
    );
    const resExpirado = verificarSessaoSalva(expiradoPath);
    assert.equal(resExpirado.valida, false);
    assert.ok(resExpirado.motivo?.includes("expirado"));
    console.log("   ✅ Cookie expirado rejeitado corretamente: OK\n");

    // 5. Cookie li_at válido no futuro
    console.log("5. Testando cookie 'li_at' válido e no futuro...");
    const validoPath = path.join(tempDir, "valido.json");
    const futuroSec = Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000);
    fs.writeFileSync(
      validoPath,
      JSON.stringify({
        cookies: [
          {
            name: "li_at",
            value: "AQEDAS_valid_token_long_string_1234567890_abcdef",
            expires: futuroSec,
          },
        ],
      }),
      "utf-8",
    );
    const resValido = verificarSessaoSalva(validoPath);
    assert.equal(resValido.valida, true);
    assert.ok((resValido.diasRestantes ?? 0) >= 28);
    console.log("   ✅ Cookie futuro aceito com sucesso: OK\n");

    // 6. Testando função verificarSinaisAutenticacao (múltiplos sinais)
    console.log("6. Testando múltiplos sinais de autenticação interativa...");

    const cookiesValidos = [
      { name: "li_at", value: "AQEDAS_valid_token_long_string_1234567890_abcdef" },
      { name: "JSESSIONID", value: "ajax:12345" },
    ];

    // Cenário: Sem li_at
    assert.equal(
      verificarSinaisAutenticacao([], "https://www.linkedin.com/feed"),
      false,
      "Sem li_at deve retornar false mesmo na URL /feed",
    );

    // Cenário: Com li_at mas preso na tela de checkpoint/desafio
    assert.equal(
      verificarSinaisAutenticacao(cookiesValidos, "https://www.linkedin.com/checkpoint/challenge"),
      false,
      "Em tela de desafio/checkpoint deve retornar false",
    );

    // Cenário: Com li_at mas ainda na tela de login
    assert.equal(
      verificarSinaisAutenticacao(cookiesValidos, "https://www.linkedin.com/login"),
      false,
      "Em tela de login deve retornar false",
    );

    // Cenário: Com li_at e na URL /feed
    assert.equal(
      verificarSinaisAutenticacao(cookiesValidos, "https://www.linkedin.com/feed/"),
      true,
      "Na URL /feed deve retornar true",
    );

    // Cenário: Com li_at e redirecionado para /mynetwork
    assert.equal(
      verificarSinaisAutenticacao(cookiesValidos, "https://www.linkedin.com/mynetwork/"),
      true,
      "Redirecionado para /mynetwork deve retornar true",
    );

    // Cenário: Com li_at e redirecionado para /jobs
    assert.equal(
      verificarSinaisAutenticacao(cookiesValidos, "https://www.linkedin.com/jobs/"),
      true,
      "Redirecionado para /jobs deve retornar true",
    );

    // Cenário: Com li_at e em rota de busca
    assert.equal(
      verificarSinaisAutenticacao(cookiesValidos, "https://www.linkedin.com/search/results/all/?keywords=tech"),
      true,
      "Na rota de busca deve retornar true",
    );
    console.log("   ✅ Sinais múltiplos de autenticação funcionando corretamente: OK\n");

    console.log("=========================================================");
    console.log("  🎉 TODOS OS TESTES DO SESSION SERVICE PASSARAM!");
    console.log("=========================================================");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

runSessionTests().catch((err) => {
  console.error("❌ Falha nos testes de sessão:", err);
  process.exit(1);
});
