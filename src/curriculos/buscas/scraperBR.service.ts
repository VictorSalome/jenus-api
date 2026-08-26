import { logInfo, logError } from "../utils/logger.js";
import { httpGet } from "../shared/http.js";

/**
 * Serviço de scraping LEVE para fontes brasileiras de vagas
 * Otimizado para Oracle Cloud Free Tier (1-2GB RAM)
 * 
 * USO: Apenas HTTP requests - sem dependências pesadas
 */

// ── FONTES DE VAGAS BRASILEIRAS (APIs públicas ou RSS) ──

/**
 * Busca vagas usando RSS feeds de portais brasileiros
 */
export const buscarVagasBrasil = async (query = "", tags = [], limit = 10) => {
  logInfo("Buscando vagas brasileiras via RSS/API", { query, tags, limit });

  const vagas = [];
  const sources = [
    { 
      name: "Remotive (global mas remoto)", 
      url: "https://remotive.com/api/remote-jobs",
      parser: parseRemotive 
    },
    { 
      name: "Arbeitnow (European Remote)", 
      url: "https://www.arbeitnow.com/api/job-board-api",
      parser: parseArbeitnow 
    }
  ];

  // Adicionar vagas brasileiras via APIs abertas
  const brazilianFeeds = await buscarFeedsbASICAS(query, tags, limit);
  vagas.push(...brazilianFeeds);

  for (const source of sources) {
    try {
      const result = await httpGet(source.url, {});
      
      if (result.ok && result.data) {
        const parsed = source.parser(result.data);
        vagas.push(...parsed.slice(0, Math.floor(limit / sources.length)));
      }
    } catch (err) {
      logError(`Erro em ${source.name}: ${err.message}`);
    }
  }

  return vagas.slice(0, limit);
};

/**
 * Busca vagas específicas por tecnologia
 */
export const buscarVagasPorTecnologia = async (tecnologia, limite = 5) => {
  return await buscarVagasBrasil(`desenvolvedor ${tecnologia}`, [tecnologia], limite);
};

/**
 * Busca vagas remotas de tecnologia
 */
export const buscarVagasRemotas = async (tecnologia = "", nivel = "", limite = 10) => {
  const query = tecnologia ? `${tecnologia} ${nivel}` : `desenvolvedor remoto`;
  return await buscarVagasBrasil(query, ["remoto", "desenvolvedor", tecnologia].filter(Boolean), limite);
};

// ── PARSERS ──

function parseRemotive(data) {
  if (!Array.isArray(data)) return [];
  
  return data.map(job => ({
    source: "remotive",
    externalId: `remotive-${job.id}`,
    title: job.title,
    company: job.company_name,
    description: job.description,
    url: job.url,
    location: job.candidate_required_location || job.publication_date,
    tags: job.tags || [],
    type: job.category || "remote",
    salary: job.salary || "",
    postedAt: job.publication_date
  }));
}

function parseArbeitnow(data) {
  if (!data?.data) return [];
  
  return data.data.map(job => ({
    source: "arbeitnow",
    externalId: `arbeitnow-${job.id}`,
    title: job.title,
    company: job.company_name || job.company,
    description: job.description,
    url: job.url,
    location: job.location,
    tags: job.tags || [],
    type: job.remote ? "remoto" : "presencial",
    salary: job.salary || ""
  }));
}

// ── BUSCA LEVE PARA VAGAS BRASILEIRAS ──

async function buscarFeedsbASICAS(query, tags, limit) {
  const vagas = [];

  // Usar APIs existentes que já funcionam bem
  const feeds = [
    // Jobicy - já configurado
    {
      url: "https://jobicy.com/api/v2/remote-jobs",
      params: { count: Math.floor(limit / 2), tags: tags.join(",") },
      parser: (data) => (data?.jobs || []).map(j => ({
        source: "jobicy",
        externalId: `jobicy-${j.id}`,
        title: j.jobTitle,
        company: j.companyName,
        description: j.jobDescription,
        url: j.url,
        location: j.jobGeo,
        tags: j.jobTags || [],
        type: j.jobType || "remote",
        salary: ""
      }))
    },
    // Remotive - vagas remotas
    {
      url: "https://remotive.com/api/remote-jobs",
      params: query ? { search: query } : {},
      parser: (data) => {
        if (!Array.isArray(data)) return [];
        return data.slice(0, Math.floor(limit / 2)).map(j => ({
          source: "remotive",
          externalId: `remotive-${j.id}`,
          title: j.title,
          company: j.company_name,
          description: j.description,
          url: j.url,
          location: j.candidate_required_location || "Remoto",
          tags: j.tags || [],
          type: "remote",
          salary: ""
        }));
      }
    }
  ];

  for (const feed of feeds) {
    try {
      const result = await httpGet(feed.url, feed.params);
      if (result.ok && result.data) {
        vagas.push(...feed.parser(result.data));
      }
    } catch (err) {
      logError(`Erro no feed ${feed.url}: ${err.message}`);
    }
  }

  return vagas;
}