/**
 * Utilitários para cálculo de tempo de experiência profissional.
 *
 * Único ponto de verdade para "anos de experiência" no backend — evita que
 * personalização de currículo, resumo profissional e e-mail de candidatura
 * usem fórmulas divergentes (e possivelmente incoerentes) entre si.
 */

import { logWarn } from "./logger.js";

export interface ExperienciaPeriodo {
  startDate?: string | null;
  endDate?: string | null;
  [key: string]: unknown;
}

/**
 * Interpreta uma data de experiência aceitando os formatos:
 * - "YYYY-MM" (ex.: "2023-05")
 * - "YYYY-MM-DD" (ex.: "2023-05-01")
 * - ISO completo (ex.: "2023-05-01T00:00:00.000Z")
 *
 * Retorna `null` quando a string não pode ser interpretada.
 */
const parseDataExperiencia = (valor: string): Date | null => {
  const texto = valor.trim();
  if (!texto) return null;

  // "YYYY-MM" -> completa com dia 01 para evitar ambiguidade de fuso/mês.
  const dataNormalizada = /^\d{4}-\d{2}$/.test(texto) ? `${texto}-01` : texto;

  const data = new Date(dataNormalizada);
  return Number.isNaN(data.getTime()) ? null : data;
};

/**
 * Calcula os anos de experiência profissional a partir de uma lista de
 * experiências, considerando a UNIÃO dos períodos (do menor início ao maior
 * fim) em vez da soma das durações individuais — evita contar em dobro
 * quando há experiências sobrepostas (ex.: freelas simultâneos ao emprego CLT).
 *
 * Datas de fim vazias ou iguais a "present" são tratadas como "hoje".
 * Experiências com datas não interpretáveis geram um aviso via `logWarn` e
 * são ignoradas no cálculo (em vez de serem descartadas silenciosamente).
 *
 * @returns Anos de experiência, com uma casa decimal.
 */
export const calcularAnosExperiencia = (
  experiencias: ExperienciaPeriodo[] = [],
): number => {
  if (!Array.isArray(experiencias) || experiencias.length === 0) return 0;

  const agora = new Date();
  let minInicio: Date | null = null;
  let maxFim: Date | null = null;

  experiencias.forEach((exp, index) => {
    const startDateRaw = exp?.startDate ? String(exp.startDate) : "";
    const endDateRaw = exp?.endDate ? String(exp.endDate) : "";

    const inicio = parseDataExperiencia(startDateRaw);
    const fim =
      !endDateRaw || endDateRaw === "present"
        ? agora
        : parseDataExperiencia(endDateRaw);

    if (!inicio || !fim) {
      logWarn("Experiência com data não interpretável ignorada no cálculo de anos de experiência", {
        index,
        startDate: exp?.startDate,
        endDate: exp?.endDate,
      });
      return;
    }

    if (fim <= inicio) {
      logWarn("Experiência com período inválido (fim <= início) ignorada no cálculo de anos de experiência", {
        index,
        startDate: exp?.startDate,
        endDate: exp?.endDate,
      });
      return;
    }

    if (!minInicio || inicio < minInicio) {
      minInicio = inicio;
    }
    if (!maxFim || fim > maxFim) {
      maxFim = fim;
    }
  });

  if (!minInicio || !maxFim) return 0;

  const diffAnos =
    ((maxFim as Date).getTime() - (minInicio as Date).getTime()) /
    (1000 * 60 * 60 * 24 * 365.25);

  return Number(diffAnos.toFixed(1));
};
