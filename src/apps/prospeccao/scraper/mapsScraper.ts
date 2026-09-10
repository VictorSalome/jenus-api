import { initDb } from "../../../core/database.js";
import { salvarEmpresa, buscarPorSlug } from "../repositories/empresa.repository.js";
import { StatusLead, type EmpresaLead } from "../types.js";
import { slugify } from "./utils/slugify.js";
import { sanitizePhone } from "./utils/phoneSanitizer.js";
import { normalizarListaFotos } from "./utils/googlePhotos.js";

type Page = any;

export interface OpcoesScraperMaps {
  limite?: number;
  headless?: boolean;
  autoAprovar?: boolean;
  onProgress?: (etapa: string, atual: number, total: number) => void;
}

export interface ResumoScraper {
  termoBusca: string;
  totalProcessados: number;
  aprovadas: number;
  rejeitadas: number;
  rejeitadasSemContato: number;
  rejeitadasPoucasFotos: number;
  ignoradasComSite: number;
  empresas: EmpresaLead[];
}

function isRealWebsite(url?: string | null): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (
    lower.includes("instagram.com") ||
    lower.includes("facebook.com") ||
    lower.includes("wa.me") ||
    lower.includes("whatsapp.com") ||
    lower.includes("linktr.ee") ||
    lower.includes("bio.site") ||
    lower.includes("beacons.ai") ||
    lower.includes("tiktok.com")
  ) {
    return false;
  }
  return true;
}

function extrairBairroCidade(endereco?: string | null): { bairro: string | null; cidade: string | null } {
  if (!endereco) return { bairro: null, cidade: null };

  const matchCompleto = endereco.match(/-\s*([^,]+),\s*([^-]+)\s*-\s*[A-Z]{2}/);
  if (matchCompleto) {
    return {
      bairro: matchCompleto[1].trim(),
      cidade: matchCompleto[2].trim(),
    };
  }

  const matchCidade = endereco.match(/,\s*([^-]+)\s*-\s*[A-Z]{2}/);
  if (matchCidade) {
    return {
      bairro: null,
      cidade: matchCidade[1].trim(),
    };
  }

  return { bairro: null, cidade: null };
}

async function gerarSlugUnico(nome: string, cidade: string | null, telefone: string | null): Promise<string> {
  const base = slugify(cidade ? `${nome} ${cidade}` : nome) || `empresa-${Date.now()}`;
  const existente = await buscarPorSlug(base);

  if (!existente) {
    return base;
  }

  if (telefone && existente.telefone === telefone) {
    return base;
  }

  return `${base}-${Date.now().toString().slice(-4)}`;
}

export async function executarScraperMaps(
  termoBusca: string,
  opcoes?: OpcoesScraperMaps
): Promise<ResumoScraper> {
  await initDb();

  const limite = opcoes?.limite ?? 10;
  const headless = opcoes?.headless ?? true;
  const autoAprovar = opcoes?.autoAprovar ?? true;
  const onProgress = opcoes?.onProgress;

  const resumo: ResumoScraper = {
    termoBusca,
    totalProcessados: 0,
    aprovadas: 0,
    rejeitadas: 0,
    rejeitadasSemContato: 0,
    rejeitadasPoucasFotos: 0,
    ignoradasComSite: 0,
    empresas: [],
  };

  let chromium: any;

  // Tenta carregar 'playwright' (produção, listada em dependencies)
  // e faz fallback para '@playwright/test' (devDependency, disponível em dev)
  console.log("[ScraperMaps] Carregando módulo Playwright...");
  try {
    // 1. Tenta 'playwright' (dependência de produção)
    const pw = await import("playwright").catch(() => null);
    if (pw?.chromium) {
      chromium = pw.chromium;
      console.log("[ScraperMaps] Playwright carregado de 'playwright' (produção).");
    } else {
      // 2. Tenta 'playwright-core'
      const pwCore = await import("playwright-core" as any).catch(() => null);
      if (pwCore?.chromium) {
        chromium = pwCore.chromium;
        console.log("[ScraperMaps] Playwright carregado de 'playwright-core'.");
      } else {
        // 3. Fallback para '@playwright/test' (devDependency)
        const pwt = await import("@playwright/test" as any).catch(() => null);
        if (pwt?.chromium) {
          chromium = pwt.chromium;
          console.log("[ScraperMaps] Playwright carregado de '@playwright/test' (dev fallback).");
        }
      }
    }
  } catch (err: any) {
    console.error("[ScraperMaps] Erro ao carregar módulo Playwright:", err?.message || err);
  }

  if (!chromium) {
    console.error("[ScraperMaps] ERRO CRÍTICO: Playwright/Chromium não encontrado. Execute 'node node_modules/playwright-core/cli.js install chromium' na VM.");
    throw new Error("O navegador Playwright não está disponível no servidor para mineração web. Execute: node node_modules/playwright-core/cli.js install chromium");
  }

  console.log("[ScraperMaps] Playwright pronto. Iniciando browser Chromium (headless=" + headless + ")...");

  const browser = await chromium.launch({
    headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  console.log("[ScraperMaps] Browser Chromium iniciado com sucesso.");

  const context = await browser.newContext({
    locale: "pt-BR",
    geolocation: { latitude: -23.55052, longitude: -46.633308 },
    permissions: ["geolocation"],
    viewport: { width: 1366, height: 768 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  try {
    const urlBusca = `https://www.google.com.br/maps/search/${encodeURIComponent(termoBusca)}?hl=pt-BR`;
    console.log(`[ScraperMaps] Navegando para: ${urlBusca}`);
    onProgress?.("Abrindo Google Maps...", 0, limite);
    await page.goto(urlBusca, { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log("[ScraperMaps] Página carregada. Aguardando estabilização...");
    await page.waitForTimeout(3000);

    const consentBtn = page.locator(
      'button:has-text("Aceitar tudo"), button:has-text("Concordo"), form[action*="consent"] button, button[aria-label*="Aceitar"]'
    );
    if (await consentBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log(`[ScraperMaps] Aceitando termo de consentimento...`);
      await consentBtn.first().click().catch(() => {});
      await page.waitForTimeout(1500);
    }

    const feedLocator = page.locator('div[role="feed"]');
    const isFeedPresent = await feedLocator
      .first()
      .isVisible({ timeout: 15000 })
      .catch(() => false);

    console.log(`[ScraperMaps] Feed visível: ${isFeedPresent}`);

    if (!isFeedPresent) {
      const singleCard = page.locator("h1.DUwDvf, div[role='main'] h1").first();
      if (await singleCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        const singleName = (await singleCard.innerText().catch(() => ""))?.trim();
        onProgress?.("Processando empresa 1 de 1...", 1, 1);
        await processarPainelAtual(page, singleName, null, resumo, autoAprovar, onProgress, 1, 1);
      }
      return resumo;
    }

    const feed = feedLocator.first();

    let tentativasSemNovos = 0;
    let totalItensAnterior = 0;
    const metaFeed = Math.max(limite * 4, 20);

    onProgress?.("Rolando feed de empresas...", 0, limite);
    while (tentativasSemNovos < 4) {
      const itensCount = await page.locator('div[role="feed"] a.hfpxzc').count();
      console.log(`[ScraperMaps] Scroll feed: ${itensCount} cards carregados (meta: ${metaFeed}). Tentativas sem novos: ${tentativasSemNovos}/4`);

      if (itensCount >= metaFeed) {
        console.log(`[ScraperMaps] Meta de ${metaFeed} cards no feed atingida.`);
        break;
      }

      if (itensCount === totalItensAnterior) {
        tentativasSemNovos++;
      } else {
        tentativasSemNovos = 0;
        totalItensAnterior = itensCount;
      }

      await feed.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await page.waitForTimeout(1500);

      const fimLista = await page
        .locator('text="Você chegou ao fim da lista"')
        .isVisible({ timeout: 500 })
        .catch(() => false);
      if (fimLista) break;
    }

    const cards = page.locator('div[role="feed"] a.hfpxzc');
    const totalDisponivel = await cards.count();
    console.log(`[ScraperMaps] Itens disponíveis no feed: ${totalDisponivel}. Buscando ${limite} leads sem site...`);

    for (let i = 0; i < totalDisponivel; i++) {
      if (resumo.empresas.length >= limite) {
        console.log(`[ScraperMaps] ✅ Meta de ${limite} empresas alcançada com sucesso! Encerrando.`);
        break;
      }
      try {
        const card = cards.nth(i);
        const nomeDoCard = (await card.getAttribute("aria-label"))?.trim() || "";

        onProgress?.(`Processando empresa ${i + 1} de ${totalDisponivel}...`, i + 1, totalDisponivel);

        // Tenta inferir categoria a partir do card se disponível
        const cardContainer = page.locator('div[role="feed"] div.Nv2PK').nth(i);
        const cardSubtexts = await cardContainer.locator("div.W4Efsd").allInnerTexts().catch(() => []);
        const categoriaCard = cardSubtexts.find((t) => t.includes("·"))?.split("·")[0].trim() || null;

        // Verifica website direto no card no feed
        const siteInCard = cardContainer.locator(
          'a[aria-label*="site" i], a[data-value*="site" i], a[data-value*="website" i]'
        );
        const temSiteNoCard = await siteInCard.first().isVisible({ timeout: 400 }).catch(() => false);

        if (temSiteNoCard) {
          const siteHref = await siteInCard.first().getAttribute("href").catch(() => null);
          if (isRealWebsite(siteHref)) {
            console.log(`[ScraperMaps] [${i + 1}/${totalDisponivel}] Pulando "${nomeDoCard}": já possui site oficial.`);
            resumo.totalProcessados++;
            resumo.ignoradasComSite++;
            continue;
          }
        }

        console.log(`[ScraperMaps] [${i + 1}/${totalDisponivel}] Clicando em: "${nomeDoCard}"...`);
        await card.scrollIntoViewIfNeeded().catch(() => {});

        let clickSucesso = false;
        try {
          await card.click({ timeout: 4000, force: true, noWaitAfter: true });
          clickSucesso = true;
        } catch (e: any) {
          // Fallback para clique via evaluate se o clique nativo falhar
          try {
            await card.evaluate((el: any) => el.click());
            clickSucesso = true;
          } catch (evalErr: any) {
            console.warn(`[ScraperMaps] Falha ao clicar em "${nomeDoCard}":`, e?.message);
          }
        }

        if (!clickSucesso) {
          console.warn(`[ScraperMaps] Ignorando "${nomeDoCard}": não foi possível abrir o card.`);
          continue;
        }

        await page.waitForTimeout(2500);

        await processarPainelAtual(
          page,
          nomeDoCard,
          categoriaCard,
          resumo,
          autoAprovar,
          onProgress,
          i + 1,
          totalDisponivel
        );
      } catch (itemErr) {
        console.error(`[ScraperMaps] Erro ao processar item ${i + 1}/${totalDisponivel}:`, (itemErr as any)?.message || itemErr);
      }
    }
  } finally {
    console.log("[ScraperMaps] Encerrando browser...");
    await browser.close().catch(() => {});
    console.log("[ScraperMaps] Browser encerrado. Resumo: processados=" + resumo.totalProcessados + " aprovadas=" + resumo.aprovadas + " rejeitadas=" + resumo.rejeitadas + " comSite=" + resumo.ignoradasComSite);
  }

  return resumo;
}

async function processarPainelAtual(
  page: Page,
  nomeCard: string,
  categoriaCard: string | null,
  resumo: ResumoScraper,
  autoAprovar: boolean,
  onProgress?: (etapa: string, atual: number, total: number) => void,
  atual?: number,
  total?: number
): Promise<void> {
  // 1. Validar se o painel aberto corresponde ao card clicado
  const h1Locator = page.locator("h1.DUwDvf, div.fontHeadlineSmall").first();
  let painelNome = "";
  try {
    await h1Locator.waitFor({ state: "visible", timeout: 3500 });
    painelNome = (await h1Locator.innerText().catch(() => "")).trim();
  } catch {
    // Painel pode não ter carregado o h1 a tempo
  }

  // Se temos nomeCard e painelNome, valida se o painel aberto realmente pertence a este card
  if (nomeCard && painelNome) {
    const normalizar = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]/g, "");
    const nCard = normalizar(nomeCard);
    const nPainel = normalizar(painelNome);

    const match = nCard.includes(nPainel) || nPainel.includes(nCard);
    if (!match) {
      console.warn(
        `[ScraperMaps] Painel dessincronizado! Esperado: "${nomeCard}", mas o painel exibe: "${painelNome}". Abortando processamento deste item para evitar falsos-positivos.`
      );
      return;
    }
  }

  let nome = painelNome || nomeCard;
  if (!nome) {
    const h1List = await page.locator("h1.DUwDvf, div.fontHeadlineSmall").allInnerTexts().catch(() => []);
    nome = h1List.find((t: string) => t.trim() && !t.includes("Resultados") && !t.includes("Patrocinado"))?.trim() || "";
  }
  if (!nome) {
    console.log("[ScraperMaps] Painel sem nome detectado. Pulando.");
    return;
  }

  console.log(`[ScraperMaps] Processando painel: "${nome}"`);

  // 2. Verificar existência de Website no painel de detalhes (se tiver site real, descarta lead)
  const websiteLocator = page.locator('a[data-item-id="authority"]');
  const temWebsite = await websiteLocator.first().isVisible({ timeout: 1000 }).catch(() => false);

  if (temWebsite) {
    const websiteHref = await websiteLocator.first().getAttribute("href").catch(() => null);
    if (isRealWebsite(websiteHref)) {
      console.log(`[ScraperMaps] "${nome}" descartado: possui site real (${websiteHref}).`);
      resumo.totalProcessados++;
      resumo.ignoradasComSite++;
      return;
    }
  }

  // 3. Extrair Segmento/Categoria
  let segmento = categoriaCard;
  if (!segmento) {
    const segmentoEl = page.locator('button[jsaction*="category"], button.DkEaL, .fontBodyMedium button').first();
    const segmentoRaw = (await segmentoEl.innerText().catch(() => "")).trim();
    segmento = segmentoRaw || null;
  }

  // 4. Extrair Endereço Completo, Bairro e Cidade
  const enderecoEl = page.locator(
    'button[data-item-id="address"] div.Io6YTe, button[data-item-id="address"], button[aria-label^="Endereço:"]'
  ).first();
  const enderecoRaw = (await enderecoEl.innerText().catch(() => "")).trim();
  const endereco = enderecoRaw || null;
  const { bairro, cidade } = extrairBairroCidade(endereco);

  // 5. Extrair Nota e Total de Avaliações
  const ratingEl = page.locator('div.F7nice span[aria-hidden="true"], span.ceNzKf').first();
  const ratingStr = (await ratingEl.innerText().catch(() => "")).trim();
  const avaliacao = ratingStr ? parseFloat(ratingStr.replace(",", ".")) : null;

  const countEl = page.locator('div.F7nice span:last-child, span[aria-label*="avaliações"], span[aria-label*="reviews"]').first();
  const countStr = (await countEl.innerText().catch(() => "")).replace(/\D/g, "");
  const totalAvaliacoes = countStr ? parseInt(countStr, 10) : null;

  // 6. Extrair Telefone e Higienizar
  const telEl = page.locator(
    'button[data-item-id^="phone:tel:"] div.Io6YTe, button[data-item-id^="phone"] div.Io6YTe, button[aria-label^="Telefone:"]'
  ).first();
  const telRaw = (await telEl.innerText().catch(() => "")).trim();
  const phoneObj = sanitizePhone(telRaw);
  console.log(`[ScraperMaps] "${nome}" | Telefone raw: "${telRaw}" | Parsed: "${phoneObj.formatted || phoneObj.raw || 'N/A'}"`);

  // 7. Extrair Link do Maps (URL atual)
  const mapsUrl = page.url();

  // 8. Extrair Fotos e normalizar para alta resolução (=w1200-h800-k-no)
  const rawUrls: string[] = [];
  const fotoLocators = page.locator(
    'button[aria-label*="Foto"] img, div.m6QErb img, div[role="main"] img[src*="googleusercontent.com"], div[role="main"] img[src*="ggpht.com"], button.aoRNLd img'
  );
  const totalImgs = await fotoLocators.count().catch(() => 0);
  console.log(`[ScraperMaps] "${nome}" | Imagens encontradas no painel: ${totalImgs}`);

  for (let f = 0; f < totalImgs; f++) {
    const src = await fotoLocators.nth(f).getAttribute("src").catch(() => null);
    if (src) rawUrls.push(src);
  }

  if (rawUrls.length < 3) {
    console.log(`[ScraperMaps] "${nome}" | Poucas fotos no painel (${rawUrls.length}). Tentando abrir galeria...`);
    const btnFotos = page.locator('button[aria-label*="Fotos de"], button.aoRNLd, button[role="tab"]:has-text("Fotos")').first();
    if (await btnFotos.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btnFotos.click().catch(() => {});
      await page.waitForTimeout(1500);

      const albumLocators = page.locator('div[role="main"] img[src*="googleusercontent.com"], div[role="tabpanel"] img[src*="googleusercontent.com"]');
      const albumCount = await albumLocators.count().catch(() => 0);
      console.log(`[ScraperMaps] "${nome}" | Fotos na galeria: ${albumCount}`);
      for (let a = 0; a < Math.min(albumCount, 15); a++) {
        const src = await albumLocators.nth(a).getAttribute("src").catch(() => null);
        if (src) rawUrls.push(src);
      }

      const backBtn = page.locator('button[aria-label="Voltar"], button[aria-label="Back"]').first();
      if (await backBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await backBtn.click().catch(() => {});
        await page.waitForTimeout(500);
      }
    }
  }

  const fotos = normalizarListaFotos(rawUrls, 8);
  console.log(`[ScraperMaps] "${nome}" | URLs brutas: ${rawUrls.length} | Fotos normalizadas: ${fotos.length}`);

  // 9. Regra de Auto-Qualificação
  const temTelefoneValido = Boolean(phoneObj.raw && phoneObj.raw.length >= 10);
  const temMinimoFotos = fotos.length >= 3;

  let status: StatusLead;
  let motivoRejeicao: string | null = null;

  if (!temTelefoneValido) {
    status = StatusLead.REJEITADA;
    motivoRejeicao = "SEM_CONTATO";
  } else if (!temMinimoFotos) {
    status = StatusLead.REJEITADA;
    motivoRejeicao = "POUCAS_FOTOS";
  } else {
    status = autoAprovar ? StatusLead.APROVADA : StatusLead.PENDENTE;
    motivoRejeicao = null;
  }

  console.log(`[ScraperMaps] "${nome}" | Qualificação: status=${status} motivo=${motivoRejeicao || "OK"} temFone=${temTelefoneValido} temFotos(min3)=${temMinimoFotos}`);

  // 10. Gerar slug amigável único
  const telefoneFinal = phoneObj.formatted || phoneObj.raw || null;
  const slug = await gerarSlugUnico(nome, cidade, telefoneFinal);

  // 11. Salvar no SQLite via repositório
  console.log(`[ScraperMaps] Salvando "${nome}" no SQLite (slug: ${slug})...`);
  const empresaSalva = await salvarEmpresa({
    nome,
    slug,
    segmento,
    cidade,
    bairro,
    endereco,
    telefone: telefoneFinal,
    whatsapp: phoneObj.isWhatsapp ? (phoneObj.formatted || phoneObj.raw) : null,
    email: null,
    maps_url: mapsUrl,
    avaliacao: !isNaN(avaliacao as number) ? avaliacao : null,
    total_avaliacoes: !isNaN(totalAvaliacoes as number) ? totalAvaliacoes : null,
    fotos,
    status,
    motivo_rejeicao: motivoRejeicao,
  });

  const nomeSalvo = empresaSalva.nome || nome;
  onProgress?.(
    `Salvo com sucesso: ${nomeSalvo}...`,
    atual ?? (resumo.empresas.length + 1),
    total ?? (resumo.empresas.length + 1)
  );

  console.log(`[ScraperMaps] 💾 Lead Salvo (${resumo.empresas.length + 1}): "${empresaSalva.nome}" | Status: ${status} | Fotos: ${fotos.length} | Fone: ${empresaSalva.telefone || "Sem fone"}`);

  resumo.totalProcessados++;
  if (status === StatusLead.APROVADA) {
    resumo.aprovadas++;
  } else if (status === StatusLead.REJEITADA) {
    resumo.rejeitadas++;
    if (motivoRejeicao === "SEM_CONTATO") {
      resumo.rejeitadasSemContato++;
    } else if (motivoRejeicao === "POUCAS_FOTOS") {
      resumo.rejeitadasPoucasFotos++;
    }
  }
  resumo.empresas.push(empresaSalva);
}

// Execução CLI direta
const isDirectCli =
  typeof process !== "undefined" &&
  Boolean(process.argv[1] && /mapsScraper\.(ts|js)$/.test(process.argv[1]));

if (isDirectCli) {
  const args = process.argv.slice(2);
  const limitIdx = args.findIndex((arg) => arg === "--limit" || arg === "-l");
  const limit = limitIdx !== -1 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : 10;
  const noHeadless = args.includes("--no-headless");
  const noAutoAprovar = args.includes("--no-auto-aprovar");

  const termo = args.find((arg) => !arg.startsWith("-")) || "barbearia osasco";

  console.log(`[CLI] Iniciando busca no Maps: "${termo}" (limite: ${limit})...`);

  executarScraperMaps(termo, {
    limite: limit,
    headless: !noHeadless,
    autoAprovar: !noAutoAprovar,
  })
    .then((resultado) => {
      console.log("\n====== RESUMO DO SCRAPER GOOGLE MAPS ======");
      console.log(`Termo pesquisado:        ${resultado.termoBusca}`);
      console.log(`Total processados:       ${resultado.totalProcessados}`);
      console.log(`Ignorados (com website): ${resultado.ignoradasComSite}`);
      console.log(`Salvos no SQLite:        ${resultado.empresas.length}`);
      console.log(`- Aprovadas:             ${resultado.aprovadas}`);
      console.log(`- Rejeitadas:            ${resultado.rejeitadas}`);
      console.log(`  * Sem Contato:         ${resultado.rejeitadasSemContato}`);
      console.log(`  * Poucas Fotos:        ${resultado.rejeitadasPoucasFotos}`);
      console.log("==========================================\n");

      if (resultado.empresas.length > 0) {
        console.log("Exemplo de lead salvo no banco:");
        const ex = resultado.empresas[0];
        console.log({
          id: ex.id,
          nome: ex.nome,
          slug: ex.slug,
          segmento: ex.segmento,
          cidade: ex.cidade,
          bairro: ex.bairro,
          telefone: ex.telefone,
          whatsapp: ex.whatsapp,
          total_fotos: ex.fotos?.length,
          status: ex.status,
          motivo_rejeicao: ex.motivo_rejeicao,
        });
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("[CLI] Falha fatal no scraper:", err);
      process.exit(1);
    });
}
