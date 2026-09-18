import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { calcularShadowScore } from "./vagasEmailWorker.service.js";
import {
  calcularPontuacaoRelevancia,
  identificarMatchesPorCategoria,
} from "../analisar/curriculoPersonalizador.service.js";

// Perfil/vaga reais (mesmo shape usado pelo worker) para validar que, em caso
// de sucesso, `calcularShadowScore` bate exatamente com o que as funções reais
// retornariam para o mesmo input — sem reimplementar a lógica de scoring aqui.
const perfil = {
  skills: {
    backend: ["Node.js", "TypeScript", "Java"],
    databases: ["PostgreSQL"],
  },
  experiences: [
    {
      title: "Backend Developer",
      description: "APIs Node.js e TypeScript com PostgreSQL",
      startDate: "2019-01",
      endDate: "present",
    },
  ],
  certifications: [] as any[],
};

const dadosVaga = {
  titulo: "Desenvolvedor Backend Java",
  areaAtuacao: "Backend",
  stackTecnologica: ["Java", "SQL"],
  requisitosObrigatorios: ["Java"],
  diferenciaisDesejaveis: [],
  responsabilidades: ["Construir APIs REST"],
};

describe("calcularShadowScore (SHADOW MODE - Missão 6)", () => {
  it("em caso de sucesso, retorna exatamente o que calcularPontuacaoRelevancia(..., true) e identificarMatchesPorCategoria retornariam para o mesmo input", () => {
    const esperadoScore = calcularPontuacaoRelevancia(perfil, dadosVaga, true);
    const esperadoMatches = identificarMatchesPorCategoria(perfil, dadosVaga);

    const resultado = calcularShadowScore(perfil, dadosVaga, "job-sucesso");

    assert.equal(resultado.scoreComEquivalencia, esperadoScore);
    assert.deepEqual(resultado.matchesCategoria, esperadoMatches);
  });

  it("quando calcularScore (equivalência) lança, captura o erro e retorna scoreComEquivalencia=null e matchesCategoria=null sem propagar a exceção", () => {
    const resultado = calcularShadowScore(perfil, dadosVaga, "job-falha-score", {
      calcularScore: () => {
        throw new Error("falha simulada no cálculo de score por equivalência");
      },
    });

    assert.equal(resultado.scoreComEquivalencia, null);
    assert.equal(resultado.matchesCategoria, null);
  });

  it("quando identificarMatches lança, captura o erro e retorna scoreComEquivalencia=null e matchesCategoria=null sem propagar a exceção", () => {
    const resultado = calcularShadowScore(perfil, dadosVaga, "job-falha-matches", {
      identificarMatches: () => {
        throw new Error("falha simulada ao identificar matches por categoria");
      },
    });

    assert.equal(resultado.scoreComEquivalencia, null);
    assert.equal(resultado.matchesCategoria, null);
  });

  it("não lança mesmo se ambas as dependências injetadas falharem", () => {
    assert.doesNotThrow(() => {
      calcularShadowScore(perfil, dadosVaga, "job-falha-dupla", {
        calcularScore: () => {
          throw new Error("falha 1");
        },
        identificarMatches: () => {
          throw new Error("falha 2");
        },
      });
    });
  });
});
