import { httpGet } from "../shared/http.js";
import { logInfo, logError } from "../utils/logger.js";
import config from "../config/index.js";

export interface Feed {
  name: string;
  url: string;
  parse: (data: any) => any[];
}

export interface VagaFeed {
  source: string;
  externalId: string;
  title: string;
  company: string;
  description: string;
  url: string;
  location: string;
  salary: string;
  tags: string[];
  postedAt: string;
  type: string;
}

// ── Fontes de vagas ──

const FEEDS: Record<string, Feed> = {
  jobicy: {
    name: "Jobicy",
    url: "https://jobicy.com/api/v2/remote-jobs",
    parse: parseJobicy,
  },
  arbeitnow: {
    name: "Arbeitnow",
    url: "https://www.arbeitnow.com/api/job-board-api",
    parse: parseArbeitnow,
  },
  remotive: {
    name: "Remotive",
    url: "https://remotive.com/api/remote-jobs",
    parse: parseRemotive,
  },
};

// ── Normalização de vaga ──

function parseJobicy(data: any): VagaFeed[] {
  if (!data?.jobs) return [];
  return data.jobs.map((j: any) => ({
    source: "jobicy",
    externalId: String(j.id),
    title: j.jobTitle || "",
    company: j.companyName || "",
    description: j.jobDescription || "",
    url: j.url || "",
    location: j.jobGeo || "",
    salary:
      j.annualSalaryMin && j.annualSalaryMax
        ? `${j.annualSalaryMin} - ${j.annualSalaryMax} ${j.annualSalaryCurrency || "USD"}`
        : "",
    tags: j.jobTags || [],
    postedAt: j.pubDate || "",
    type: j.jobType || "",
  }));
}

function parseArbeitnow(data: any): VagaFeed[] {
  if (!data?.data) return [];
  return data.data.map((j: any) => ({
    source: "arbeitnow",
    externalId: String(j.id),
    title: j.title || "",
    company: j.company_name || "",
    description: j.description || "",
    url: j.url || "",
    location: j.location || "",
    salary: "",
    tags: j.tags || [],
    postedAt: j.created_at || "",
    type: j.remote ? "remote" : "",
  }));
}

function parseRemotive(data: any): VagaFeed[] {
  if (!Array.isArray(data)) return [];
  return data.map((j: any) => ({
    source: "remotive",
    externalId: String(j.id),
    title: j.title || "",
    company: j.company_name || "",
    description: j.description || "",
    url: j.url || "",
    location: j.candidate_required_location || "",
    salary: j.salary || "",
    tags: j.tags || [],
    postedAt: j.publication_date || "",
    type: j.job_type || "",
  }));
}

// ── Serviço principal ──

/**
 * Busca vagas em todas as fontes configuradas
 * @param {Object} params
 * @param {string} params.query - Palavras-chave (ex: "react node")
 * @param {string[]} params.tags - Tags específicas
 * @param {number} params.limit - Máximo de vagas por fonte
 * @returns {Promise<Object[]>} Lista normalizada de vagas
 */
export const buscarVagas = async ({
  query = "",
  tags = [],
  limit = 10,
}: {
  query?: string;
  tags?: string[];
  limit?: number;
} = {}): Promise<VagaFeed[]> => {
  logInfo(
    `Buscando vagas: query="${query}" tags=${tags.join(",")} limit=${limit}`,
  );

  const promises = Object.entries(FEEDS).map(async ([key, feed]) => {
    try {
      const params = buildParams(key, { query, tags, limit });
      const result = await httpGet(feed.url, params);

      if (!result.ok) {
        logError(`Feed ${feed.name} falhou: ${result.error}`);
        return [];
      }

      const vagas = feed.parse(result.data).slice(0, limit);
      logInfo(`Feed ${feed.name}: ${vagas.length} vagas encontradas`);
      return vagas;
    } catch (err: any) {
      logError(`Feed ${feed.name} erro: ${err.message}`);
      return [];
    }
  });

  const resultados = await Promise.allSettled(promises);
  const todas = resultados
    .filter((r) => r.status === "fulfilled")
    .flatMap((r: any) => r.value);

  logInfo(`Total de vagas encontradas: ${todas.length}`);
  return todas;
};

/**
 * Busca vagas de uma fonte específica
 */
export const buscarVagaFonte = async (fonte: string, params: any = {}): Promise<VagaFeed[]> => {
  const feed = FEEDS[fonte];
  if (!feed)
    throw new Error(
      `Fonte desconhecida: ${fonte}. Disponíveis: ${Object.keys(FEEDS).join(", ")}`,
    );

  const result = await httpGet(feed.url, buildParams(fonte, params));
  if (!result.ok) throw new Error(result.error);

  return feed.parse(result.data);
};

/**
 * Lista fontes disponíveis
 */
export const getFontes = () =>
  Object.entries(FEEDS).map(([key, f]) => ({
    id: key,
    name: f.name,
    url: f.url,
  }));

// ── Helpers ──

function buildParams(fonte: string, { query, tags, limit }: { query: string; tags: string[]; limit: number }) {
  switch (fonte) {
    case "jobicy":
      return {
        count: limit,
        tag: tags.length ? tags.join(",") : undefined,
      };
    case "arbeitnow":
      return {};
    case "remotive":
      return {
        limit,
        tags: tags.length ? tags.join(",") : undefined,
      };
    default:
      return {};
  }
}