import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  classificarMatch,
  calcularPontuacaoRelevancia,
} from "./curriculoPersonalizador.service.js";

describe("classificarMatch", () => {
  it("retorna EXACT quando a habilidade aparece como substring do requisito", () => {
    const resultado = classificarMatch("React", "Vaga para trabalhar com React no dia a dia");
    assert.deepEqual(resultado, { tipo: "EXACT", peso: 1 });
  });

  it("retorna ALIAS quando um alias conhecido de SKILL_ALIASES aparece no requisito", () => {
    // "nodejs" é alias de "Node.js" em SKILL_ALIASES, mas não é substring
    // exata de "Node.js" (falta o ponto), então não deve cair em EXACT.
    const resultado = classificarMatch("Node.js", "Buscamos experiência com framework nodejs");
    assert.deepEqual(resultado, { tipo: "ALIAS", peso: 1 });
  });

  it("retorna CATEGORY_EQUIVALENCE com o peso correto para um par cross-stack (Node.js vs Spring Boot)", () => {
    const resultado = classificarMatch(
      "Node.js",
      "Precisamos de alguém com experiência em Spring Boot",
    );
    assert.deepEqual(resultado, {
      tipo: "CATEGORY_EQUIVALENCE",
      peso: 0.55,
      categoria: "framework-backend-web",
    });
  });

  it("retorna null para pares sem relação nenhuma", () => {
    const resultado = classificarMatch("React", "Java");
    assert.equal(resultado, null);
  });
});

describe("calcularPontuacaoRelevancia — regressão de comportamento default", () => {
  const perfilA = {
    skills: {
      backend: ["Node.js", "TypeScript", "NestJS"],
      databases: ["PostgreSQL"],
      testing: ["Jest"],
    },
    experiences: [
      {
        title: "Backend Developer",
        description: "Desenvolvimento de APIs Node.js com NestJS e PostgreSQL",
        startDate: "2019-01",
        endDate: "present",
      },
    ],
    certifications: [] as any[],
  };

  const vagaA = {
    titulo: "Desenvolvedor Backend Node.js",
    areaAtuacao: "Backend",
    stackTecnologica: ["Node.js", "PostgreSQL"],
    requisitosObrigatorios: ["Node.js", "TypeScript", "PostgreSQL"],
    diferenciaisDesejaveis: ["NestJS", "Jest"],
    responsabilidades: ["Construir APIs REST robustas"],
  };

  const perfilB = {
    skills: {
      frontend: ["React", "TypeScript", "Tailwind CSS"],
    },
    experiences: [
      {
        title: "Frontend Developer",
        description: "Componentes React com hooks e testes com Jest",
        startDate: "2021-01",
        endDate: "present",
      },
    ],
    certifications: [{ name: "AWS Cloud Practitioner", issuer: "AWS" }],
  };

  const vagaB = {
    titulo: "Desenvolvedor Frontend React",
    areaAtuacao: "Frontend",
    stackTecnologica: ["React", "TypeScript"],
    requisitosObrigatorios: ["React", "Tailwind CSS"],
    diferenciaisDesejaveis: ["AWS"],
    responsabilidades: ["Construir interfaces com React"],
  };

  it("sem o parâmetro, produz o mesmo resultado de antes da mudança (caso A)", () => {
    // Valor confirmado rodando a versão do arquivo ANTES desta missão
    // (git stash) com o mesmo fixture: pontuacaoFinal === 96.
    assert.equal(calcularPontuacaoRelevancia(perfilA, vagaA), 96);
  });

  it("sem o parâmetro, produz o mesmo resultado de antes da mudança (caso B)", () => {
    // Valor confirmado rodando a versão do arquivo ANTES desta missão
    // (git stash) com o mesmo fixture: pontuacaoFinal === 96.
    assert.equal(calcularPontuacaoRelevancia(perfilB, vagaB), 96);
  });

  it("com false explícito, produz exatamente o mesmo valor que omitir o parâmetro", () => {
    assert.equal(
      calcularPontuacaoRelevancia(perfilA, vagaA),
      calcularPontuacaoRelevancia(perfilA, vagaA, false),
    );
    assert.equal(
      calcularPontuacaoRelevancia(perfilB, vagaB),
      calcularPontuacaoRelevancia(perfilB, vagaB, false),
    );
  });
});

describe("calcularPontuacaoRelevancia — modo com equivalência de categoria", () => {
  it("nunca produz score menor que o modo default, e é maior quando há match só por categoria", () => {
    // Candidato só tem Node.js/TypeScript (sem Java), vaga pede Java/Spring Boot.
    // Sem equivalência de categoria, mustHaveCoverage/stackCoverage para
    // "Java"/"Spring Boot" ficam em 0. Com equivalência, Node.js~Java
    // (framework-backend-web, peso 0.55) e TypeScript~Java
    // (linguagem-tipada-backend, peso 0.40) contam parcialmente.
    const perfilC = {
      skills: {
        backend: ["Node.js", "TypeScript"],
        databases: ["PostgreSQL"],
      },
      experiences: [
        {
          title: "Backend Developer",
          description: "APIs Node.js",
          startDate: "2020-01",
          endDate: "present",
        },
      ],
      certifications: [] as any[],
    };

    const vagaC = {
      titulo: "Desenvolvedor Java Spring Boot",
      areaAtuacao: "Backend",
      stackTecnologica: ["Java"],
      requisitosObrigatorios: ["Java", "Spring Boot"],
      diferenciaisDesejaveis: [] as string[],
      responsabilidades: ["Manter serviços em Java"],
    };

    const scoreDefault = calcularPontuacaoRelevancia(perfilC, vagaC);
    const scoreComEquivalencia = calcularPontuacaoRelevancia(perfilC, vagaC, true);

    assert.ok(
      scoreComEquivalencia >= scoreDefault,
      `esperado scoreComEquivalencia (${scoreComEquivalencia}) >= scoreDefault (${scoreDefault})`,
    );
    assert.ok(
      scoreComEquivalencia > scoreDefault,
      `esperado score estritamente maior neste caso desenhado para exercitar CATEGORY_EQUIVALENCE (default=${scoreDefault}, equivalencia=${scoreComEquivalencia})`,
    );
  });
});
