import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { calcularAnosExperiencia } from "./experiencia.util.js";

describe("calcularAnosExperiencia", () => {
  it("retorna 0 quando não há experiências (array vazio)", () => {
    assert.equal(calcularAnosExperiencia([]), 0);
  });

  it("retorna 0 quando o parâmetro não é fornecido", () => {
    assert.equal(calcularAnosExperiencia(), 0);
  });

  it("calcula corretamente para 1 experiência (formato YYYY-MM)", () => {
    const anos = calcularAnosExperiencia([
      { startDate: "2022-01", endDate: "2023-01" },
    ]);
    assert.equal(anos, 1.0);
  });

  it("calcula corretamente para múltiplas experiências não sobrepostas (consecutivas)", () => {
    const anos = calcularAnosExperiencia([
      { startDate: "2020-01", endDate: "2021-01" },
      { startDate: "2021-01", endDate: "2022-01" },
    ]);
    // união do span: 2020-01 até 2022-01 = 2 anos
    assert.equal(anos, 2.0);
  });

  it("não conta em dobro experiências sobrepostas (usa união dos períodos)", () => {
    const anos = calcularAnosExperiencia([
      { startDate: "2020-01", endDate: "2022-01" }, // emprego CLT
      { startDate: "2021-01", endDate: "2021-06" }, // freela simultâneo
    ]);
    // se somasse duração teria 2 + 0.5 = 2.5; união correta é só 2020-01 -> 2022-01 = 2 anos
    assert.equal(anos, 2.0);
  });

  it("aceita formato YYYY-MM-DD", () => {
    const anos = calcularAnosExperiencia([
      { startDate: "2020-01-15", endDate: "2021-01-15" },
    ]);
    assert.equal(anos, 1.0);
  });

  it("aceita formato ISO completo", () => {
    const anos = calcularAnosExperiencia([
      {
        startDate: "2020-01-01T00:00:00.000Z",
        endDate: "2021-01-01T00:00:00.000Z",
      },
    ]);
    assert.equal(anos, 1.0);
  });

  it("trata endDate 'present' como hoje", () => {
    const doisAnosAtras = new Date();
    doisAnosAtras.setFullYear(doisAnosAtras.getFullYear() - 2);
    const startDate = `${doisAnosAtras.getFullYear()}-${String(doisAnosAtras.getMonth() + 1).padStart(2, "0")}`;

    const anos = calcularAnosExperiencia([
      { startDate, endDate: "present" },
    ]);
    assert.ok(anos >= 1.9 && anos <= 2.1, `esperado ~2 anos, recebido ${anos}`);
  });

  it("trata endDate vazio/ausente como hoje", () => {
    const umAnoAtras = new Date();
    umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
    const startDate = `${umAnoAtras.getFullYear()}-${String(umAnoAtras.getMonth() + 1).padStart(2, "0")}`;

    const anos = calcularAnosExperiencia([{ startDate, endDate: "" }]);
    assert.ok(anos >= 0.9 && anos <= 1.1, `esperado ~1 ano, recebido ${anos}`);
  });

  it("ignora experiência com data inválida sem quebrar (loga aviso e segue calculando as demais)", () => {
    const anos = calcularAnosExperiencia([
      { startDate: "data-invalida", endDate: "tambem-invalida" },
      { startDate: "2020-01", endDate: "2021-01" },
    ]);
    assert.equal(anos, 1.0);
  });

  it("retorna 0 quando todas as experiências têm datas inválidas", () => {
    const anos = calcularAnosExperiencia([
      { startDate: "invalido", endDate: "invalido" },
    ]);
    assert.equal(anos, 0);
  });

  it("calcula a união correta para múltiplas experiências com gaps entre elas", () => {
    const anos = calcularAnosExperiencia([
      { startDate: "2018-01", endDate: "2019-01" },
      { startDate: "2022-01", endDate: "2023-01" },
    ]);
    // span do menor início ao maior fim: 2018-01 -> 2023-01 = 5 anos
    // (método span, não soma de durações — comportamento esperado do método A)
    assert.equal(anos, 5.0);
  });
});
