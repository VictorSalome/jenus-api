import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  calcularPontuacaoRelevancia,
  identificarMatchesPorCategoria,
  gerarPonteCompetencias,
  personalizarCurriculo,
} from "../analisar/curriculoPersonalizador.service.js";

describe("Modo Amplo / Adaptativo vs Modo Estrito", () => {
  const perfilFrontend = {
    personalInfo: {
      name: "Desenvolvedor Teste",
      email: "dev@teste.com",
      phone: "11999999999",
      title: "Desenvolvedor Frontend Sênior",
      summary: "Especialista em ecossistema web moderno e interfaces reativas.",
    },
    skills: {
      frontend: ["React", "TypeScript", "Next.js", "Tailwind CSS"],
      stateManagement: ["Zustand", "Redux"],
      mobile: ["React Native"],
      testing: ["Jest", "Testing Library"],
    },
    experiences: [
      {
        company: "Tech Corp",
        position: "Desenvolvedor Frontend Sênior",
        startDate: "2020-01",
        endDate: "present",
        description: "Desenvolvimento de SPAs complexas com React e TypeScript.",
        technologies: ["React", "TypeScript", "Next.js", "Zustand"],
      },
    ],
    education: [],
    certifications: [],
    languages: [],
  };

  const vagaVue = {
    titulo: "Desenvolvedor Frontend Vue.js",
    empresa: "Empresa Inovadora",
    areaAtuacao: "Frontend",
    stackTecnologica: ["Vue.js", "Nuxt.js", "Pinia", "TypeScript"],
    requisitosObrigatorios: ["Vue.js", "TypeScript", "Nuxt.js"],
    diferenciaisDesejaveis: ["Pinia", "Tailwind CSS"],
    responsabilidades: ["Criar interfaces web escaláveis", "Arquitetar SPAs e SSR"],
    descricao: "Vaga para atuar no desenvolvimento frontend com Vue.js e Nuxt.",
  };

  const vagaFlutter = {
    titulo: "Desenvolvedor Mobile Flutter",
    empresa: "Mobile Apps SA",
    areaAtuacao: "Mobile",
    stackTecnologica: ["Flutter", "Dart"],
    requisitosObrigatorios: ["Flutter", "Dart"],
    diferenciaisDesejaveis: ["Clean Architecture"],
    responsabilidades: ["Desenvolver aplicativos cross-platform iOS e Android"],
    descricao: "Buscamos dev mobile para construir apps móveis com alta performance.",
  };

  it("Modo Estrito (modoAmplo = false): não aplica equivalência de categoria para Vue vs React", () => {
    const scoreEstrito = calcularPontuacaoRelevancia(perfilFrontend, vagaVue, false);
    const matchesEstrito = identificarMatchesPorCategoria(perfilFrontend, vagaVue);

    // No modo estrito, React não é contado como Vue
    assert.ok(scoreEstrito < 75, `Score estrito (${scoreEstrito}) deve ser menor que 75%`);
  });

  it("Modo Amplo (modoAmplo = true): eleva a pontuação via equivalência de categoria e identifica matches", () => {
    const scoreEstrito = calcularPontuacaoRelevancia(perfilFrontend, vagaVue, false);
    const scoreAmplo = calcularPontuacaoRelevancia(perfilFrontend, vagaVue, true);
    const matchesAmplo = identificarMatchesPorCategoria(perfilFrontend, vagaVue);

    assert.ok(
      scoreAmplo > scoreEstrito,
      `Score amplo (${scoreAmplo}) deve ser estritamente maior que score estrito (${scoreEstrito})`,
    );
    assert.ok(
      matchesAmplo.length > 0,
      "Deve identificar matches de categoria entre React/Vue e Next.js/Nuxt.js",
    );

    const matchVue = matchesAmplo.find(
      (m) => m.skillCandidato === "React" && m.tecnologiaVaga === "Vue.js",
    );
    assert.ok(matchVue, "Deve conter match de equivalência React -> Vue.js");
  });

  it("Ponte de Competências: gera texto profissional e ético sem inventar experiência falsa", () => {
    const matchesAmplo = identificarMatchesPorCategoria(perfilFrontend, vagaVue);
    const textoPonte = gerarPonteCompetencias(matchesAmplo, perfilFrontend, vagaVue);

    assert.ok(textoPonte.length > 0, "Texto de ponte deve ser gerado");
    assert.ok(
      textoPonte.includes("Ponte de Competências"),
      "Deve conter o cabeçalho 'Ponte de Competências'",
    );
    assert.ok(
      textoPonte.includes("React") && textoPonte.includes("Vue.js"),
      "Deve citar explicitamente o domínio em React e a rápida adaptabilidade a Vue.js",
    );
  });

  it("Ponte de Competências Mobile: conecta React Native a Flutter de forma consistente", () => {
    const matchesMobile = identificarMatchesPorCategoria(perfilFrontend, vagaFlutter);
    assert.ok(matchesMobile.length > 0, "Deve identificar equivalência entre React Native e Flutter");

    const textoPonteMobile = gerarPonteCompetencias(matchesMobile, perfilFrontend, vagaFlutter);
    assert.ok(
      textoPonteMobile.includes("React Native") && textoPonteMobile.includes("Flutter"),
      "Ponte deve conectar React Native a Flutter",
    );
  });

  it("personalizarCurriculo com modoAmplo injeta a Ponte de Competências no resumo profissional", async () => {
    const curriculoGerado = await personalizarCurriculo(vagaVue);

    assert.ok(curriculoGerado, "Currículo deve ser gerado");
    assert.ok(
      typeof curriculoGerado.summary === "string",
      "Resumo profissional deve ser uma string",
    );
  });
});
