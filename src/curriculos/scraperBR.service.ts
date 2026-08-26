import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { logInfo, logError } from "./utils/logger.js";

/**
 * Serviço SCRAPER LEVE para busca de vagas brasileiras
 * Usa apenas HTTP requests (não Puppeteer/Playwright)
 * Compatível com Oracle Cloud (recursos limitados)
 */

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
];

const DEFAULT_HEADERS = {
  headers: {
    "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    "Accept": "application/json, text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
  },
  timeout: 30000,
  validateStatus: (status: number) => status < 500,
};

export interface VagaScraper {
  id: string;
  title: string;
  company: string;
  description: string;
  location: string;
  url: string;
  tags: string[];
  salary: string;
  remote: boolean;
}

const buscarVagasBrasil = async (
  query = "", tags: string[] = [], limit = 10, offset = 0
): Promise<VagaScraper[]> => {
  const vagas: VagaScraper[] = [];
  
  try {
    logInfo("Buscando vagas via HTTP...", { query, limit });
    
    // Jobicy API (vagas técnicas brasileiras)
    const jobicyRes = await axios.get(
      `https://jobicy.com/api/v2/listings?filter=${encodeURIComponent(query)}&limit=${limit}`,
      DEFAULT_HEADERS
    );
    
    if (jobicyRes.data?.data?.length) {
      jobicyRes.data.data.forEach((v: any) => {
        vagas.push({
          id: v.id,
          title: v.title,
          company: v.company || v.org?.name || "Empresa",
          description: v.description || v.caption || "",
          location: v.location,
          url: v.url || v.link,
          tags: v.tags || [],
          salary: v.salary || "",
          remote: v.remote || false,
        });
      });
      logInfo(`Jobicy: ${vagas.length} vagas encontradas`);
    }
  } catch (e: any) {
    logError(`Jobicy API: ${e.message}`);
  }

  return vagas.slice(0, limit);
};

const buscarVagasPorTecnologia = async (tecnologia: string, limit = 10): Promise<VagaScraper[]> => {
  const tags = tecnologia.split(/[,\s]+/).filter(t => t.length > 2);
  return buscarVagasBrasil(tecnologia, tags, limit);
};

const buscarVagasRemotas = async (query = "", limit = 10): Promise<VagaScraper[]> => {
  return buscarVagasBrasil(`${query} remoto`, [], limit);
};

export { buscarVagasBrasil, buscarVagasPorTecnologia, buscarVagasRemotas };