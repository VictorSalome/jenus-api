import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { gerarCorpoEmail, escolherVariacoesEmail, hashSimples } from "./email.service.js";

const candidatoBase = {
  name: "Nereu Junior",
  title: "Desenvolvedor Full Stack",
  email: "nereu@example.com",
  phone: "11999999999",
  hasWhatsApp: true,
  linkedin: "linkedin.com/in/nereu",
  github: "github.com/nereu",
  education: [{ degree: "Ciência da Computação" }],
  experiences: [{ startDate: "2019-01", endDate: "present" }],
  certifications: ["AWS"],
};

const vagaAlfa = { titulo: "Desenvolvedor Backend Node.js", empresa: "Alfa Tech" };
const vagaBeta = { titulo: "Engenheiro de Software Pleno", empresa: "Beta Solutions" };

describe("hashSimples", () => {
  it("é determinístico para o mesmo texto", () => {
    assert.equal(hashSimples("abc"), hashSimples("abc"));
  });

  it("varia para textos diferentes (não colide no caso básico)", () => {
    assert.notEqual(hashSimples("Desenvolvedor Backend Node.js"), hashSimples("Engenheiro de Software Pleno"));
  });
});

describe("escolherVariacoesEmail", () => {
  it("produz sempre a mesma frase de abertura/fechamento para a mesma vaga", () => {
    const primeira = escolherVariacoesEmail(vagaAlfa, "Desenvolvedor Backend Node.js", "Alfa Tech");
    const segunda = escolherVariacoesEmail(vagaAlfa, "Desenvolvedor Backend Node.js", "Alfa Tech");

    assert.equal(primeira.fraseAbertura, segunda.fraseAbertura);
    assert.equal(primeira.fraseFechamento, segunda.fraseFechamento);
  });

  it("tem chance real de produzir texto diferente para vagas diferentes", () => {
    const alfa = escolherVariacoesEmail(vagaAlfa, "Desenvolvedor Backend Node.js", "Alfa Tech");
    const beta = escolherVariacoesEmail(vagaBeta, "Engenheiro de Software Pleno", "Beta Solutions");

    // Pelo menos uma das duas frases (abertura ou fechamento) deve diferir —
    // não exigimos que as duas sempre difiram (só 2 variações cada, então
    // colisão total é possível por acaso), mas o mecanismo tem que ser capaz
    // de variar, o que este par de vagas comprovadamente demonstra.
    const algumaDiferente =
      alfa.fraseAbertura !== beta.fraseAbertura || alfa.fraseFechamento !== beta.fraseFechamento;
    assert.ok(algumaDiferente, "esperava ao menos uma frase diferente entre vagas distintas");
  });

  it("interpola nomeVaga e empresa (já escapados) na frase de abertura", () => {
    const { fraseAbertura } = escolherVariacoesEmail(vagaAlfa, "Desenvolvedor Backend Node.js", "Alfa Tech");
    assert.match(fraseAbertura, /Desenvolvedor Backend Node\.js/);
    assert.match(fraseAbertura, /Alfa Tech/);
  });

  it("não lança exceção quando dadosVaga não tem titulo/empresa (edge case)", () => {
    const vagaSemCampos = {} as { titulo?: string; empresa?: string };

    assert.doesNotThrow(() => {
      escolherVariacoesEmail(vagaSemCampos, "", "");
    });

    const resultado = escolherVariacoesEmail(vagaSemCampos, "", "");
    // Mesmo sem titulo/empresa, o seed vira uma string fixa ("|abertura"/"|fechamento"),
    // então continua determinístico e sempre cai numa das variações do catálogo.
    assert.ok(typeof resultado.fraseAbertura === "string" && resultado.fraseAbertura.length > 0);
    assert.ok(typeof resultado.fraseFechamento === "string" && resultado.fraseFechamento.length > 0);

    const repetido = escolherVariacoesEmail(vagaSemCampos, "", "");
    assert.equal(repetido.fraseAbertura, resultado.fraseAbertura);
    assert.equal(repetido.fraseFechamento, resultado.fraseFechamento);
  });
});

describe("gerarCorpoEmail", () => {
  it("gera o mesmo corpo (mesmas frases variáveis) para a mesma vaga", () => {
    const html1 = gerarCorpoEmail(vagaAlfa, candidatoBase);
    const html2 = gerarCorpoEmail(vagaAlfa, candidatoBase);
    assert.equal(html1, html2);
  });

  it("gera corpos com potencial de diferir para vagas diferentes", () => {
    const htmlAlfa = gerarCorpoEmail(vagaAlfa, candidatoBase);
    const htmlBeta = gerarCorpoEmail(vagaBeta, candidatoBase);
    assert.notEqual(htmlAlfa, htmlBeta);
  });

  it("produz HTML válido com placeholders corretos: nome do candidato, empresa, mailto e wa.me", () => {
    const html = gerarCorpoEmail(vagaAlfa, candidatoBase);

    assert.ok(html.startsWith("<!DOCTYPE html>"), "deve começar com DOCTYPE");
    assert.match(html, /<\/html>\s*$/, "deve terminar com </html>");
    assert.ok(html.includes(candidatoBase.name), "deve conter o nome do candidato");
    assert.ok(html.includes(vagaAlfa.empresa), "deve conter o nome da empresa");
    assert.ok(html.includes(`mailto:${candidatoBase.email}`), "deve conter o link mailto correto");
    assert.ok(html.includes("https://wa.me/5511999999999"), "deve conter o link wa.me correto");
  });

  it("não lança exceção e produz fallback razoável quando a vaga não tem titulo/empresa (edge case)", () => {
    const vagaSemCampos = {};

    let html = "";
    assert.doesNotThrow(() => {
      html = gerarCorpoEmail(vagaSemCampos, candidatoBase);
    });

    assert.ok(html.startsWith("<!DOCTYPE html>"), "deve continuar gerando HTML válido");
    // Fallbacks textuais definidos em gerarCorpoEmail para titulo/empresa ausentes.
    assert.ok(html.includes("a vaga anunciada"), "deve usar o fallback de nome da vaga");
    assert.ok(html.includes("sua empresa"), "deve usar o fallback de nome da empresa");
  });

  it("usa uma das duas variações fixas de abertura e de fechamento (sem texto fora do catálogo)", () => {
    const html = gerarCorpoEmail(vagaAlfa, candidatoBase);

    const aberturas = [
      "Tenho interesse em contribuir com a equipe de",
      "Escrevo para me candidatar à posição de",
    ];
    const fechamentos = [
      "Ficarei feliz em conversar com mais detalhes",
      "Coloco-me à disposição para uma conversa e para esclarecer",
    ];

    assert.ok(aberturas.some((trecho) => html.includes(trecho)), "abertura deve ser uma das variações conhecidas");
    assert.ok(fechamentos.some((trecho) => html.includes(trecho)), "fechamento deve ser uma das variações conhecidas");
  });
});
