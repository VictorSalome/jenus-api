import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  LINKEDIN_SEARCH_QUERIES,
  SCRAPER_CONFIG,
} from "./linkedin.constants.js";
import type { QueryType, RawLinkedInPost, SelectedQuery } from "./linkedin.types.js";
import { extrairPostsDaPagina } from "./linkedin-post.extractor.js";
import { verificarSessaoSalva, obterCaminhoSessao } from "./linkedin-session.service.js";

export interface OpcoesBuscaLinkedIn {
  caminhoSessao?: string;
  queries?: Array<string | SelectedQuery>;
  maxSearchesPerRun?: number;
  maxPagesPerSearch?: number;
  maxPostsPerSearch?: number;
  navDelayMinMs?: number;
  navDelayMaxMs?: number;
  searchDelayMinMs?: number;
  searchDelayMaxMs?: number;
  headless?: boolean;
}

export interface ResultadoQueryLinkedIn {
  query: string;
  type: QueryType;
  terms: string[];
  selectedQuery?: SelectedQuery;
  posts: RawLinkedInPost[];
}

export interface ResultadoColetaLinkedIn {
  postsColetados: RawLinkedInPost[];
  totalBuscas: number;
  totalPaginas: number;
  erros: string[];
  resultadosPorQuery: ResultadoQueryLinkedIn[];
}

function delayAleatorio(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa busca de publicações no LinkedIn utilizando Playwright em modo somente leitura.
 * Utiliza o arquivo de sessão salvo (storageState).
 *
 * MODO ESTRITAMENTE SOMENTE LEITURA:
 * - Não curte, não comenta, não conecta, não envia mensagens.
 */
export async function executarBuscaLinkedIn(
  opcoes: OpcoesBuscaLinkedIn = {},
): Promise<ResultadoColetaLinkedIn> {
  const sessionPath = opcoes.caminhoSessao || obterCaminhoSessao();
  const statusSessao = verificarSessaoSalva(sessionPath);

  if (!statusSessao.valida) {
    throw new Error(
      `Sessão do LinkedIn inválida ou não encontrada (${statusSessao.motivo}). Execute 'npm run linkedin:login' primeiro.`,
    );
  }

  const queries = opcoes.queries || LINKEDIN_SEARCH_QUERIES;
  const maxSearches = Math.min(
    opcoes.maxSearchesPerRun ?? (opcoes.queries ? queries.length : SCRAPER_CONFIG.maxSearchesPerRun),
    queries.length,
  );
  const maxPages = opcoes.maxPagesPerSearch || SCRAPER_CONFIG.maxPagesPerSearch;
  const maxPosts = opcoes.maxPostsPerSearch || SCRAPER_CONFIG.maxPostsPerSearch;

  const navDelayMin = opcoes.navDelayMinMs || SCRAPER_CONFIG.navDelayMinMs;
  const navDelayMax = opcoes.navDelayMaxMs || SCRAPER_CONFIG.navDelayMaxMs;
  const searchDelayMin = opcoes.searchDelayMinMs || SCRAPER_CONFIG.searchDelayMinMs;
  const searchDelayMax = opcoes.searchDelayMaxMs || SCRAPER_CONFIG.searchDelayMaxMs;

  const queriesExecutar = queries.slice(0, maxSearches);

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  const todosPosts: RawLinkedInPost[] = [];
  const resultadosPorQuery: ResultadoQueryLinkedIn[] = [];
  const erros: string[] = [];
  let totalBuscas = 0;
  let totalPaginas = 0;

  try {
    browser = await chromium.launch({
      headless: opcoes.headless !== false,
    });

    context = await browser.newContext({
      storageState: sessionPath,
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    // Intercepta navigator.clipboard.writeText para capturar URLs canônicas copiadas do menu do post
    await page.addInitScript(() => {
      (globalThis as any).__lastCopiedUrl = "";
      const nav = (globalThis as any).navigator;
      if (nav?.clipboard) {
        nav.clipboard.writeText = async (text: string) => {
          (globalThis as any).__lastCopiedUrl = text;
          return Promise.resolve();
        };
      }
    });

    for (let i = 0; i < queriesExecutar.length; i++) {
      const item = queriesExecutar[i];
      const isSelectedQuery = typeof item !== "string";
      const queryString = isSelectedQuery ? item.query : item;
      const queryType: QueryType = isSelectedQuery ? item.type : "role";
      const queryTerms: string[] = isSelectedQuery ? item.terms : [item];

      totalBuscas++;

      console.log(`[Busca ${i + 1}/${queriesExecutar.length}] Query: ${queryString}`);
      const postsDestaQuery: RawLinkedInPost[] = [];

      try {
        // LinkedIn Content Search URL com filtro de ordenação por data de postagem
        const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(
          queryString,
        )}&sortBy=%22date_posted%22`;

        await page.goto(searchUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        // Aguarda estabilização inicial do DOM
        await page.waitForTimeout(2000);

        for (let pagina = 1; pagina <= maxPages; pagina++) {
          totalPaginas++;

          // Rolagem suave para baixo para carregar posts lazy-load
          await page.evaluate(() => (globalThis as any).scrollBy(0, 800));
          await page.waitForTimeout(1200);
          await page.evaluate(() => (globalThis as any).scrollBy(0, 800));
          await page.waitForTimeout(1200);

          // Extração semântica dos posts visíveis na página atual
          const postsPagina = await extrairPostsDaPagina(page);
          console.log(`  📄 Página ${pagina}: ${postsPagina.length} posts identificados`);
          postsDestaQuery.push(...postsPagina);
          todosPosts.push(...postsPagina);

          if (postsDestaQuery.length >= maxPosts) {
            break;
          }

          if (pagina < maxPages) {
            // Delay conservador entre páginas
            await delayAleatorio(navDelayMin, navDelayMax);

            const btnProxima = page
              .locator('button[aria-label="Avançar"], button[aria-label="Next"], .artdeco-pagination__button--next')
              .first();

            if ((await btnProxima.count().catch(() => 0)) > 0) {
              const podeClicar = await btnProxima.isVisible().catch(() => false);
              if (podeClicar) {
                await btnProxima.click({ timeout: 1500 }).catch(() => {});
                await page.waitForTimeout(2000);
              } else {
                break;
              }
            } else {
              break;
            }
          }
        }
      } catch (err: any) {
        erros.push(`Erro na busca da query "${queryString}": ${err?.message || err}`);
      }

      resultadosPorQuery.push({
        query: queryString,
        type: queryType,
        terms: queryTerms,
        selectedQuery: isSelectedQuery ? item : undefined,
        posts: postsDestaQuery,
      });

      // Intervalo conservador entre termos de busca distintos
      if (i < queriesExecutar.length - 1) {
        await delayAleatorio(searchDelayMin, searchDelayMax);
      }
    }
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  return {
    postsColetados: todosPosts,
    totalBuscas,
    totalPaginas,
    erros,
    resultadosPorQuery,
  };
}
