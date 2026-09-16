import fs from "fs";
import path from "path";
import {
  CATALOGO_CARGOS,
  CATALOGO_TECNOLOGIAS,
  SINAIS_CONTRATACAO,
  SINAIS_CONTRATACAO_POOL,
  QUERY_ENGINE_CONFIG,
} from "./linkedin.constants.js";
import type {
  QueryType,
  QueryExecutionRecord,
  ScraperHistory,
  SelectedQuery,
} from "./linkedin.types.js";

/**
 * Retorna o caminho absoluto do arquivo de histórico de queries
 */
export function obterCaminhoHistorico(customPath?: string): string {
  if (customPath) return path.resolve(process.cwd(), customPath);
  return path.resolve(process.cwd(), QUERY_ENGINE_CONFIG.historyFile);
}

/**
 * Lê o histórico de execuções de queries do disco de forma segura
 */
export function carregarHistorico(historyPath = obterCaminhoHistorico()): ScraperHistory {
  if (!fs.existsSync(historyPath)) {
    return { records: [] };
  }

  try {
    const raw = fs.readFileSync(historyPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.records)) {
      return parsed;
    }
    return { records: [] };
  } catch {
    return { records: [] };
  }
}

/**
 * Registra a execução de uma query com sua telemetria completa no histórico
 */
export function salvarRegistroExecucao(
  record: QueryExecutionRecord,
  historyPath = obterCaminhoHistorico(),
): void {
  const historico = carregarHistorico(historyPath);

  // Insere no início da lista
  historico.records.unshift(record);

  // Mantém apenas os 100 registros mais recentes para controle de volume
  if (historico.records.length > 100) {
    historico.records = historico.records.slice(0, 100);
  }

  historico.lastRunAt = new Date().toISOString();

  const dir = path.dirname(historyPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Gravação atômica via arquivo temporário
  const tmpPath = `${historyPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(historico, null, 2), "utf-8");
  fs.renameSync(tmpPath, historyPath);
}

/**
 * Calcula a pontuação de prioridade de um termo com base em recência e rendimento histórico.
 *
 * Conceito:
 * - Nunca pesquisado: prioridade máxima (100 pts)
 * - Pesquisado há muito tempo: prioridade alta
 * - Pesquisado muito recentemente: prioridade baixa
 * - Histórico de muitas vagas qualificadas: bônus de prioridade
 * - Histórico sem resultados após múltiplas buscas: leve penalidade
 */
export function calcularPrioridadeTermo(
  termo: string,
  historico: ScraperHistory,
  nowMs = Date.now(),
): { score: number; reason: string } {
  const termoLower = termo.toLowerCase().trim();

  // Filtra registros passados que continham este termo
  const ocorrencias = (historico.records || []).filter((r) =>
    r.terms.some((t) => t.toLowerCase().trim() === termoLower),
  );

  if (ocorrencias.length === 0) {
    return {
      score: 100,
      reason: "Nunca pesquisado anteriormente (prioridade máxima)",
    };
  }

  // 1. Recência da última execução
  const timestamps = ocorrencias
    .map((r) => new Date(r.executedAt).getTime())
    .filter((t) => !isNaN(t));

  const maisRecenteMs = Math.max(...timestamps);
  const horasDesdeUltima = Math.max(0, (nowMs - maisRecenteMs) / (1000 * 60 * 60));

  // Escala de recência: 0h = 10 pts, 6h = 30 pts, 12h = 50 pts, 24h+ = 80 pts, 48h+ = 100 pts
  let recencyScore = Math.min(100, Math.floor(horasDesdeUltima / 6) * 15 + 10);

  // Penalidade se pesquisado há menos de 3 horas
  if (horasDesdeUltima < 3) {
    recencyScore = Math.max(5, recencyScore - 35);
  }

  // 2. Bônus por rendimento histórico (vagas qualificadas geradas)
  const totalQualificadas = ocorrencias.reduce((acc, curr) => acc + (curr.qualifiedJobs || 0), 0);
  const bonusRendimento = Math.min(40, totalQualificadas * 10);

  // 3. Penalidade se já foi pesquisado >= 2 vezes e nunca gerou vaga
  let penalidadeSemResultado = 0;
  if (ocorrencias.length >= 2 && totalQualificadas === 0) {
    penalidadeSemResultado = 15;
  }

  const scoreFinal = Math.max(1, recencyScore + bonusRendimento - penalidadeSemResultado);

  const reason = `Última busca há ${horasDesdeUltima.toFixed(1)}h (+${recencyScore} pts), ${totalQualificadas} vagas qualificadas no histórico (+${bonusRendimento} pts)`;

  return {
    score: scoreFinal,
    reason,
  };
}

/**
 * Monta o formato booleano da query para o LinkedIn
 */
export function formatarQueryLinkedin(
  type: QueryType,
  termos: string[],
  sinalIndex = 0,
): string {
  const sinal = SINAIS_CONTRATACAO_POOL[sinalIndex % SINAIS_CONTRATACAO_POOL.length] || SINAIS_CONTRATACAO;
  if (type === "role") {
    return `"${termos[0]}" AND ${sinal}`;
  }
  if (type === "technology") {
    return `"${termos[0]}" AND ${sinal}`;
  }
  // combined: cargo + tecnologia
  return `"${termos[0]}" AND "${termos[1]}" AND ${sinal}`;
}

export interface OpcoesSelecaoQueries {
  maxQueries?: number;
  incluirExpansao?: boolean;
  distribuicao?: {
    tipo1Cargo?: number;
    tipo2Tecnologia?: number;
    tipo3Combinada?: number;
  };
}

/**
 * Seleciona um conjunto balanceado e controlado de queries para uma execução,
 * respeitando os limites operacionais e a distribuição dos 3 arquétipos.
 *
 * Distribuição padrão (8 queries):
 * - 2 queries de Cargo puro (Tipo 1)
 * - 3 queries de Tecnologia pura (Tipo 2)
 * - 3 queries de Cargo + Tecnologia combinadas (Tipo 3)
 */
export function selecionarQueriesBalanceadas(
  opcoes: OpcoesSelecaoQueries = {},
  historico: ScraperHistory = carregarHistorico(),
  nowMs = Date.now(),
): SelectedQuery[] {
  const maxTotal = opcoes.maxQueries || QUERY_ENGINE_CONFIG.maxQueriesPerRun;
  const dist = {
    tipo1Cargo: opcoes.distribuicao?.tipo1Cargo ?? QUERY_ENGINE_CONFIG.distribuicao.tipo1Cargo,
    tipo2Tecnologia: opcoes.distribuicao?.tipo2Tecnologia ?? QUERY_ENGINE_CONFIG.distribuicao.tipo2Tecnologia,
    tipo3Combinada: opcoes.distribuicao?.tipo3Combinada ?? QUERY_ENGINE_CONFIG.distribuicao.tipo3Combinada,
  };

  // 1. Ranking dos Cargos por prioridade
  const cargosAvaliados = CATALOGO_CARGOS.map((cargo) => {
    const { score, reason } = calcularPrioridadeTermo(cargo, historico, nowMs);
    return { termo: cargo, score, reason };
  }).sort((a, b) => b.score - a.score);

  // 2. Ranking das Tecnologias por prioridade (Core + Opcional Expansão)
  const poolTechs = [
    ...CATALOGO_TECNOLOGIAS.core,
    ...(opcoes.incluirExpansao ? CATALOGO_TECNOLOGIAS.expansao : []),
  ];

  const techsAvaliadas = poolTechs.map((tech) => {
    const { score, reason } = calcularPrioridadeTermo(tech, historico, nowMs);
    return { termo: tech, score, reason };
  }).sort((a, b) => b.score - a.score);

  const selecionadas: SelectedQuery[] = [];
  let queryCount = 0;

  // ── Tipo 1: Cargos Puros (ex: 2) ─────────────────────────────────────────
  const cargosTipo1 = cargosAvaliados.slice(0, dist.tipo1Cargo);
  for (const c of cargosTipo1) {
    selecionadas.push({
      query: formatarQueryLinkedin("role", [c.termo], queryCount++),
      type: "role",
      terms: [c.termo],
      priorityScore: c.score,
      reason: `[Tipo 1 - Cargo] ${c.reason}`,
    });
  }

  // ── Tipo 2: Tecnologias Puras (ex: 3) ────────────────────────────────────
  const techsTipo2 = techsAvaliadas.slice(0, dist.tipo2Tecnologia);
  for (const t of techsTipo2) {
    selecionadas.push({
      query: formatarQueryLinkedin("technology", [t.termo], queryCount++),
      type: "technology",
      terms: [t.termo],
      priorityScore: t.score,
      reason: `[Tipo 2 - Tecnologia] ${t.reason}`,
    });
  }

  // ── Tipo 3: Cargo + Tecnologia Combinados (ex: 3) ────────────────────────
  // Para as combinações, utiliza o cargo mais prioritário com as próximas tecnologias prioritárias
  const cargoPrincipal = cargosAvaliados[0]?.termo || "desenvolvedor";
  // Pega tecnologias da sequência para evitar repetição direta do Tipo 2
  const techsParaCombinada = techsAvaliadas.slice(
    dist.tipo2Tecnologia,
    dist.tipo2Tecnologia + dist.tipo3Combinada,
  );

  // Fallback caso o pool de techs seja curto
  const poolCombinada =
    techsParaCombinada.length >= dist.tipo3Combinada
      ? techsParaCombinada
      : techsAvaliadas.slice(0, dist.tipo3Combinada);

  for (let i = 0; i < dist.tipo3Combinada && i < poolCombinada.length; i++) {
    const techObj = poolCombinada[i];
    // Varia o cargo entre os dois primeiros para enriquecer a combinação
    const cargoEscolhido = i % 2 === 0 ? cargoPrincipal : (cargosAvaliados[1]?.termo || cargoPrincipal);
    const scoreMedio = Math.round((cargosAvaliados[0].score + techObj.score) / 2);

    selecionadas.push({
      query: formatarQueryLinkedin("combined", [cargoEscolhido, techObj.termo], queryCount++),
      type: "combined",
      terms: [cargoEscolhido, techObj.termo],
      priorityScore: scoreMedio,
      reason: `[Tipo 3 - Combinada] Cargo '${cargoEscolhido}' + Tech '${techObj.termo}' (${techObj.reason})`,
    });
  }

  // Garante que não ultrapassa o teto máximo configurado
  return selecionadas.slice(0, maxTotal);
}
