import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  executarBuscaLinkedIn,
  type OpcoesBuscaLinkedIn,
  type ResultadoQueryLinkedIn,
} from "./linkedin/linkedin-search.service.js";
import {
  parsePostParaVaga,
  deduplicarVagas,
  exportarParaVagasEmailFormat,
  normalizarUrlPost,
  normalizarTextoParaDeduplicacao,
} from "./linkedin/linkedin-job.parser.js";
import { avaliarIdadePublicacao } from "./linkedin/linkedin-temporal.utils.js";
import { SCRAPER_CONFIG } from "./linkedin/linkedin.constants.js";
import {
  selecionarQueriesBalanceadas,
  salvarRegistroExecucao,
} from "./linkedin/query-builder.service.js";
import type {
  ParsedScrapedJob,
  QueryType,
  RawLinkedInPost,
  SelectedQuery,
} from "./linkedin/linkedin.types.js";
import type { VagaEmailRaw } from "../automacao/types.js";

export interface QueryExecutadaTelemetria {
  query: string;
  type: string;
  terms: string[];
  postsFound: number;
  qualifiedJobs: number;
}

export interface RelatorioExecucaoScraper {
  buscasExecutadas: number;
  paginasProcessadas: number;
  postsEncontrados: number;
  descartadosSemEmail: number;
  descartadosSemUrlCanonica: number;
  descartadosPorConfidence: number;
  descartadosPorData: number;
  duplicatasRemovidas: number;
  vagasFinais: number;
  vagasColetadas: ParsedScrapedJob[];
  erros: string[];
  arquivoGerado?: string;
  queriesExecutadas: QueryExecutadaTelemetria[];
}

export interface OpcoesExecucaoScraper extends OpcoesBuscaLinkedIn {
  arquivoSaida?: string;
  maxAgeHours?: number;
  minConfidenceScore?: number;
  postsMockados?: RawLinkedInPost[]; // Permite execução de testes automatizados sem rede
  dryRun?: boolean; // Se true, processa tudo mas não escreve no disco
  caminhoHistorico?: string;
}

/**
 * Carrega com segurança vagas existentes salvas em arquivo JSON.
 * Retorna array vazio em caso de arquivo inexistente, vazio ou corrompido (fallback seguro).
 */
export function carregarVagasExistentes(caminhoArquivo: string): VagaEmailRaw[] {
  try {
    if (!fs.existsSync(caminhoArquivo)) {
      return [];
    }
    const conteudo = fs.readFileSync(caminhoArquivo, "utf-8").trim();
    if (!conteudo) {
      return [];
    }
    const parsed = JSON.parse(conteudo);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (v): v is VagaEmailRaw =>
        Boolean(v && typeof v === "object" && (v.id || v.sourceUrl || v.contactEmail)),
    );
  } catch {
    return [];
  }
}

/**
 * Mescla as novas vagas qualificadas com as existentes no disco e deduplica por:
 * 1. Identificador único (`id`)
 * 2. URL canônica sem parâmetros de tracking (`sourceUrl`)
 * 3. Hash SHA-256 de texto normalizado + e-mail de contato
 *
 * Se a execução atual retornar zero vagas, PRESERVA integralmente as existentes.
 */
export function mesclarEDeduplicarVagas(
  novas: VagaEmailRaw[],
  existentes: VagaEmailRaw[],
): VagaEmailRaw[] {
  if (!novas || novas.length === 0) {
    return existentes || [];
  }
  if (!existentes || existentes.length === 0) {
    return novas;
  }

  const vistosIds = new Set<string>();
  const vistosUrls = new Set<string>();
  const vistosHashes = new Set<string>();
  const resultado: VagaEmailRaw[] = [];

  // Novas vagas têm precedência sobre existentes (aparecem primeiro)
  const todas = [...novas, ...existentes];

  for (const vaga of todas) {
    if (!vaga || typeof vaga !== "object") continue;

    // 1. Chave por ID único
    const idLimpo = vaga.id ? String(vaga.id).trim() : "";
    if (idLimpo && vistosIds.has(idLimpo)) {
      continue;
    }

    // 2. Chave por URL canônica (sem tracking/query params)
    let urlCanonica: string | null = null;
    if (vaga.sourceUrl && String(vaga.sourceUrl).trim()) {
      urlCanonica = normalizarUrlPost(String(vaga.sourceUrl));
      if (urlCanonica && vistosUrls.has(urlCanonica)) {
        continue;
      }
    }

    // 3. Chave secundária por hash SHA-256 (texto normalizado + e-mail de contato)
    const textoLimpo = normalizarTextoParaDeduplicacao(
      String(vaga.description || vaga.title || ""),
    );
    const emailLimpo = String(vaga.contactEmail || "").toLowerCase().trim();
    const hashConteudo = crypto
      .createHash("sha256")
      .update(`${textoLimpo}|${emailLimpo}`)
      .digest("hex");

    if (vistosHashes.has(hashConteudo)) {
      continue;
    }

    if (idLimpo) vistosIds.add(idLimpo);
    if (urlCanonica) vistosUrls.add(urlCanonica);
    vistosHashes.add(hashConteudo);

    resultado.push(vaga);
  }

  return resultado;
}

/**
 * Orquestrador central da Fase 3:
 * Coleta posts -> Filtro Temporal -> Job Parser -> Deduplicação -> Exportação VagaEmailRaw.
 *
 * MODO ESTRITAMENTE SOMENTE LEITURA:
 * - NÃO aciona o worker de envio (vagasEmailWorker).
 * - Apenas gera o arquivo data/vagas-email.json.
 */
export async function executarScraperVagas(
  opcoes: OpcoesExecucaoScraper = {},
): Promise<RelatorioExecucaoScraper> {
  const maxAgeHours = opcoes.maxAgeHours || SCRAPER_CONFIG.maxPostAgeHours;
  const minConfidence = opcoes.minConfidenceScore || SCRAPER_CONFIG.minConfidenceScore;
  const arquivoSaida = opcoes.arquivoSaida || SCRAPER_CONFIG.outputFile;
  const maxSearches = opcoes.maxSearchesPerRun;

  // 1. Se queries não fornecidas, seleciona queries balanceadas via query-builder
  const selectedQueries: Array<string | SelectedQuery> =
    opcoes.queries || selecionarQueriesBalanceadas(maxSearches ? { maxQueries: maxSearches } : {});

  let postsBrutos: RawLinkedInPost[] = [];
  let buscasExecutadas = 0;
  let paginasProcessadas = 0;
  const erros: string[] = [];
  let resultadosPorQuery: ResultadoQueryLinkedIn[] = [];

  // Se foram fornecidos posts mockados (para testes unitários sem rede)
  if (opcoes.postsMockados && Array.isArray(opcoes.postsMockados)) {
    postsBrutos = opcoes.postsMockados;
    buscasExecutadas = 1;
    paginasProcessadas = 1;

    const primeiraQuery = selectedQueries[0];
    const queryStr = typeof primeiraQuery === "string" ? primeiraQuery : primeiraQuery.query;
    const queryType: QueryType = typeof primeiraQuery === "string" ? "role" : primeiraQuery.type;
    const queryTerms: string[] = typeof primeiraQuery === "string" ? [primeiraQuery] : primeiraQuery.terms;

    resultadosPorQuery = [
      {
        query: queryStr,
        type: queryType,
        terms: queryTerms,
        selectedQuery: typeof primeiraQuery !== "string" ? primeiraQuery : undefined,
        posts: postsBrutos,
      },
    ];
  } else {
    // Execução real com Playwright
    const resBusca = await executarBuscaLinkedIn({
      ...opcoes,
      queries: selectedQueries,
    });
    postsBrutos = resBusca.postsColetados;
    buscasExecutadas = resBusca.totalBuscas;
    paginasProcessadas = resBusca.totalPaginas;
    erros.push(...resBusca.erros);
    resultadosPorQuery = resBusca.resultadosPorQuery;
  }

  const postsEncontrados = postsBrutos.length;
  let descartadosSemEmail = 0;
  let descartadosSemUrlCanonica = 0;
  let descartadosPorConfidence = 0;
  let descartadosPorData = 0;

  const vagasAprovadas: ParsedScrapedJob[] = [];
  const queriesExecutadas: QueryExecutadaTelemetria[] = [];

  // Avaliação por query para telemetria estruturada
  for (const resQuery of resultadosPorQuery) {
    const postsDestaQuery = resQuery.posts;
    const postsFound = postsDestaQuery.length;
    const vagasAprovadasDestaQuery: ParsedScrapedJob[] = [];

    for (const post of postsDestaQuery) {
      // 1. Filtro Temporal estrito no código (<= 24h)
      const infoData = avaliarIdadePublicacao(post.publishedAtText, post.publishedAt, maxAgeHours);
      if (!infoData.dentroDaJanela) {
        descartadosPorData++;
        continue;
      }

      // 2. Job Parser da Fase 1 (validação de e-mail, URL canônica, confiança e skills)
      const parseResult = parsePostParaVaga(post, minConfidence);

      if (!parseResult.isJob || !parseResult.job) {
        if (parseResult.discardReason === "SEM_EMAIL_NO_POST") {
          descartadosSemEmail++;
        } else if (parseResult.discardReason === "SEM_URL_CANONICA_PUBLICACAO") {
          descartadosSemUrlCanonica++;
        } else {
          descartadosPorConfidence++;
        }
        continue;
      }

      vagasAprovadasDestaQuery.push(parseResult.job);
      vagasAprovadas.push(parseResult.job);
    }

    const qualifiedJobs = deduplicarVagas(vagasAprovadasDestaQuery).length;

    // Registra telemetria no histórico do scraper via query-builder
    if (!opcoes.dryRun) {
      salvarRegistroExecucao(
        {
          query: resQuery.query,
          type: resQuery.type,
          terms: resQuery.terms,
          executedAt: new Date().toISOString(),
          postsFound,
          qualifiedJobs,
        },
        opcoes.caminhoHistorico,
      );
    }

    queriesExecutadas.push({
      query: resQuery.query,
      type: resQuery.type,
      terms: resQuery.terms,
      postsFound,
      qualifiedJobs,
    });
  }

  // 3. Deduplicação por URL canônica e fallback de hash (conteúdo + email)
  const vagasDeduplicadas = deduplicarVagas(vagasAprovadas);
  const duplicatasRemovidas = vagasAprovadas.length - vagasDeduplicadas.length;
  const vagasFinais = vagasDeduplicadas.length;

  // 4. Exportação para o contrato oficial VagaEmailRaw
  const contratoFinal: VagaEmailRaw[] = exportarParaVagasEmailFormat(vagasDeduplicadas);

  let caminhoGerado: string | undefined = undefined;

  // 5. Gravação em disco com merge cumulativo, deduplicação e escrita atômica (se não for dryRun)
  if (!opcoes.dryRun && arquivoSaida) {
    const destinoFinal = path.resolve(process.cwd(), arquivoSaida);
    const dir = path.dirname(destinoFinal);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const vagasExistentes = carregarVagasExistentes(destinoFinal);
    const vagasParaSalvar = mesclarEDeduplicarVagas(contratoFinal, vagasExistentes);

    // Escrita atômica: grava no .tmp e realiza renomeação atômica via fs.renameSync
    const caminhoTmp = `${destinoFinal}.tmp`;
    try {
      fs.writeFileSync(caminhoTmp, JSON.stringify(vagasParaSalvar, null, 2), "utf-8");
      fs.renameSync(caminhoTmp, destinoFinal);
      caminhoGerado = destinoFinal;
    } catch (errGravar) {
      if (fs.existsSync(caminhoTmp)) {
        try {
          fs.unlinkSync(caminhoTmp);
        } catch {}
      }
      throw errGravar;
    }
  }

  return {
    buscasExecutadas,
    paginasProcessadas,
    postsEncontrados,
    descartadosSemEmail,
    descartadosSemUrlCanonica,
    descartadosPorConfidence,
    descartadosPorData,
    duplicatasRemovidas,
    vagasFinais,
    vagasColetadas: vagasDeduplicadas,
    erros,
    arquivoGerado: caminhoGerado,
    queriesExecutadas,
  };
}
