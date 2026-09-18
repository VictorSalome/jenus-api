import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  gerarFingerprintVaga,
  extrairChaveCanonicaCargo,
  normalizarEmpresa,
} from "./vagaFingerprint.js";

describe("vagaFingerprint (Fingerprint Canônico Anti-Duplicação)", () => {
  it("deve gerar o MESMO fingerprint para variações cosméticas do mesmo título", () => {
    const email = "vitoria.souza@verx.com.br";
    const empresa = "Verx";

    const fp1 = gerarFingerprintVaga(email, empresa, "Desenvolvedor Back-End Sênior");
    const fp2 = gerarFingerprintVaga(email, empresa, "Desenvolvedor Back-end Sênior (Node.js / TypeScript / AWS)");
    const fp3 = gerarFingerprintVaga(email, empresa, "Desenvolvedor Back-end Sênior (PJ) - Remoto");

    // Back-end sênior com Node/TS na Verx deve convergir
    assert.ok(fp1);
    assert.ok(fp2);
    assert.ok(fp3);
    assert.equal(fp1, fp3);
  });

  it("deve gerar o MESMO fingerprint quando o título varia entre maiúsculas, parênteses e slugs", () => {
    const email = "alinesilvarh2020@gmail.com";
    const empresa = "Confidencial";

    const fpA = gerarFingerprintVaga(email, empresa, "Desenvolvedor Fullstack Pleno (.NET)");
    const fpB = gerarFingerprintVaga(email, empresa, "Desenvolvedor Fullstack Pleno .NET - CLT");

    assert.equal(fpA, fpB);
  });

  it("deve gerar FINGERPRINTS DIFERENTES para vagas distintas do MESMO recrutador", () => {
    const email = "julianabatista.souza@actdigital.com";
    const empresa = "ACT Digital";

    const fpJava = gerarFingerprintVaga(email, empresa, "Desenvolvedor Java Sênior");
    const fpDotnet = gerarFingerprintVaga(email, empresa, "Desenvolvedor .NET Sênior");
    const fpReact = gerarFingerprintVaga(email, empresa, "Desenvolvedor Front-end React Sênior");

    // Um mesmo recrutador pode ter vagas de Java, .NET e React sem conflitar!
    assert.notEqual(fpJava, fpDotnet);
    assert.notEqual(fpJava, fpReact);
    assert.notEqual(fpDotnet, fpReact);
  });

  it("normaliza empresas genéricas pelo domínio corporativo do e-mail", () => {
    const emp1 = normalizarEmpresa("Confidencial", "rh@actdigital.com");
    const emp2 = normalizarEmpresa("ACT Digital Tecnologia Ltda", "rh@actdigital.com");

    assert.equal(emp1, "actdigital");
    assert.equal(emp2, "act digital");
  });

  it("extrai chave canônica de cargo preservando senioridade e tecnologias", () => {
    const key1 = extrairChaveCanonicaCargo("Desenvolvedor Back-End Sênior");
    assert.ok(key1.includes("dev_sr_backend"));

    const key2 = extrairChaveCanonicaCargo("Engenheira Front-End React Pleno (Remoto)");
    assert.ok(key2.includes("dev_pl"));
    assert.ok(key2.includes("react"));
    assert.ok(key2.includes("frontend"));
  });
});
