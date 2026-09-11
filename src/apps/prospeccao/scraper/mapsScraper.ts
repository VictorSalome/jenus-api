import { initDb } from "../../../core/database.js";
import { salvarEmpresa, buscarPorSlug } from "../repositories/empresa.repository.js";
import { StatusLead, type EmpresaLead, type FotoMeta } from "../types.js";
import { slugify } from "./utils/slugify.js";
import { sanitizePhone } from "./utils/phoneSanitizer.js";
import { normalizarListaFotos, normalizarListaFotosComMeta } from "./utils/googlePhotos.js";

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
  const autoAprovar = opcoes?.autoAprovar ?? false;
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

    const itensCandidatos = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      const cards: any[] = Array.from(doc.querySelectorAll('div[role="feed"] div.Nv2PK'));
      return cards
        .map((c: any) => {
          const a = c.querySelector('a.hfpxzc');
          const name = a?.getAttribute('aria-label')?.trim() || '';
          const href = a?.href || '';
          const subtexts = Array.from(c.querySelectorAll('div.W4Efsd')).map((el: any) => el.textContent || '');
          const categoria = subtexts.find((t: string) => t.includes('·'))?.split('·')[0].trim() || null;
          const siteEl = c.querySelector(
            'a[aria-label*="site" i], a[data-value*="site" i], a[data-value*="website" i]'
          );
          const siteHref = siteEl?.href || null;

          return {
            name,
            href,
            categoria,
            siteHref,
          };
        })
        .filter((item: any) => item.name && item.href);
    });

    const totalDisponivel = itensCandidatos.length;
    console.log(`[ScraperMaps] Itens extraídos do feed: ${totalDisponivel}. Buscando ${limite} leads sem site...`);

    for (let i = 0; i < totalDisponivel; i++) {
      if (resumo.empresas.length >= limite) {
        console.log(`[ScraperMaps] ✅ Meta de ${limite} empresas alcançada com sucesso! Encerrando.`);
        break;
      }

      const item = itensCandidatos[i];
      try {
        onProgress?.(`Processando empresa ${i + 1} de ${totalDisponivel}...`, i + 1, totalDisponivel);

        if (item.siteHref && isRealWebsite(item.siteHref)) {
          console.log(`[ScraperMaps] [${i + 1}/${totalDisponivel}] Pulando "${item.name}": já possui site oficial no card.`);
          resumo.totalProcessados++;
          resumo.ignoradasComSite++;
          continue;
        }

        console.log(`[ScraperMaps] [${i + 1}/${totalDisponivel}] Navegando para o local: "${item.name}"...`);
        await page.goto(item.href, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(2500);

        await processarPainelAtual(
          page,
          item.name,
          item.categoria,
          resumo,
          autoAprovar,
          onProgress,
          i + 1,
          totalDisponivel
        );
      } catch (itemErr: any) {
        console.error(`[ScraperMaps] Erro ao processar "${item.name}":`, itemErr?.message || itemErr);
      }
    }
  } finally {
    console.log("[ScraperMaps] Encerrando browser...");
    await browser.close().catch(() => {});
    console.log("[ScraperMaps] Browser encerrado. Resumo: processados=" + resumo.totalProcessados + " aprovadas=" + resumo.aprovadas + " rejeitadas=" + resumo.rejeitadas + " comSite=" + resumo.ignoradasComSite);
  }

  return resumo;
}

async function fecharPainelSeAberto(page: Page): Promise<void> {
  try {
    const btnVoltar = page
      .locator(
        'button[aria-label="Voltar"], button[aria-label="Back"], button[jsaction*="pane.back"], button[jsaction*="navigationRail.back"], button[aria-label="Fechar"], button[aria-label="Close"], button.hYBOP'
      )
      .first();

    if (await btnVoltar.isVisible({ timeout: 800 }).catch(() => false)) {
      await btnVoltar.click().catch(() => {});
      await page.waitForTimeout(600);
    }
  } catch {
    // Silencioso se não houver botão aberto
  }
}

async function extrairFotosValidadas(
  page: Page,
  nome: string
): Promise<FotoMeta[]> {
  const panelMain = page.locator('div[role="main"]').first();
  const candidatos: Array<{ url: string; source: "capa" | "galeria" | "painel" }> = [];

  // 1. Foto de capa do cabeçalho do estabelecimento
  const capaLocators = panelMain.locator(
    'button.aoRNLd img, button[aria-label*="Foto"] img, button[aria-label*="Photo"] img'
  );
  const totalCapas = await capaLocators.count().catch(() => 0);
  for (let c = 0; c < totalCapas; c++) {
    const src = await capaLocators.nth(c).getAttribute("src").catch(() => null);
    if (src) {
      candidatos.push({ url: src, source: "capa" });
    }
  }

  // 2. Tentar abrir a galeria oficial do estabelecimento
  const btnFotos = page
    .locator(
      'button[role="tab"]:has-text("Fotos"), button[role="tab"]:has-text("Photos"), button[aria-label*="Fotos de"], button[aria-label*="Photos of"], button.aoRNLd'
    )
    .first();

  if (await btnFotos.isVisible({ timeout: 1500 }).catch(() => false)) {
    try {
      await btnFotos.click().catch(() => {});
      await page.waitForTimeout(2000);

      // Galeria aberta: coletar imagens do container da galeria (tanto <img> quanto background-image)
      const fotosGaleria: string[] = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        const urls: string[] = [];

        // Imagens de fotos na galeria
        const imgs = doc.querySelectorAll(
          'div[role="tabpanel"] img, div.m6QErb[aria-label*="Fotos"] img, div[role="main"] a[data-photo-index] img, button[aria-label*="Foto"] img, div.m6QErb div[role="img"] img'
        );
        imgs.forEach((img: any) => {
          if (img.src && !img.closest('div[role="feed"]') && !img.closest('div.jftiEf')) {
            urls.push(img.src);
          }
        });

        // Background-image de cards de foto
        const bgElements = doc.querySelectorAll(
          'div[role="tabpanel"] div[style*="background-image"], div[role="main"] div[style*="background-image"]'
        );
        bgElements.forEach((el: any) => {
          const bg = el.style.backgroundImage || '';
          const match = bg.match(/url\(["']?([^"']+)["']?\)/);
          if (match && match[1] && !el.closest('div[role="feed"]') && !el.closest('div.jftiEf')) {
            urls.push(match[1]);
          }
        });

        return urls;
      });

      for (const url of fotosGaleria) {
        candidatos.push({ url, source: "galeria" });
      }
    } catch (galErr: any) {
      console.warn(`[ScraperMaps] Falha ao navegar na galeria de "${nome}":`, galErr?.message || galErr);
    }
  }

  // 3. Normalização prévia e eliminação de lixo visual (avatares, ícones, tiles)
  const metaCandidatos = normalizarListaFotosComMeta(candidatos, 15);
  console.log(`[ScraperMaps] "${nome}" | Candidatos brutos: ${candidatos.length} | Meta válidos: ${metaCandidatos.length}`);
  if (metaCandidatos.length === 0) {
    return [];
  }

  // 4. Validação no browser das dimensões reais (naturalWidth >= 600 && naturalHeight >= 400)
  try {
    const fotosValidadas: FotoMeta[] = await page.evaluate(
      async (items: FotoMeta[]) => {
        const validadas: FotoMeta[] = [];

        for (const item of items) {
          try {
            const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
              const ImageConstructor = (globalThis as any).Image;
              const img = new ImageConstructor();
              img.referrerPolicy = "no-referrer";
              const timer = setTimeout(() => reject(new Error("timeout")), 3500);
              img.onload = () => {
                clearTimeout(timer);
                resolve({ width: img.naturalWidth, height: img.naturalHeight });
              };
              img.onerror = () => {
                clearTimeout(timer);
                reject(new Error("error"));
              };
              img.src = item.url;
            });

            // Resolução mínima exigida: largura >= 600 e altura >= 400
            if (dims.width >= 600 && dims.height >= 400) {
              const ratio = dims.width / dims.height;
              // Proporção fotográfica plausível (entre 0.5 e 2.5)
              if (ratio >= 0.5 && ratio <= 2.5) {
                validadas.push({
                  ...item,
                  width: dims.width,
                  height: dims.height,
                });
              }
            }
          } catch {
            // Falha de carregamento ou timeout
          }

          if (validadas.length >= 8) break;
        }

        return validadas;
      },
      metaCandidatos
    );

    if (fotosValidadas.length > 0) {
      return fotosValidadas;
    }

    // Se o browser bloqueou o carregamento dinâmico no sandbox (CSP), mantém as fotos com alta confiança (/p/, /gps-cs-s/)
    return metaCandidatos.filter((m) => m.confianca === "alta").slice(0, 8);
  } catch (evalErr: any) {
    console.warn(`[ScraperMaps] Falha na validação de dimensões de "${nome}":`, evalErr?.message || evalErr);
    return metaCandidatos.filter((m) => m.confianca === "alta").slice(0, 8);
  }
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

  // 8. Extrair Fotos reais com validação de dimensões (>= 600x400) e isolamento estrito de DOM
  const fotosMeta = await extrairFotosValidadas(page, nome);
  const fotos = fotosMeta.map((f) => f.url);
  console.log(`[ScraperMaps] "${nome}" | Fotos reais validadas (>=600x400): ${fotos.length}`);

  // 9. Regra de Auto-Qualificação
  const temTelefoneValido = Boolean(phoneObj.raw && phoneObj.raw.length >= 10);
  const temMinimoFotos = fotos.length >= 3;

  let status: StatusLead;
  let motivoRejeicao: string | null = null;

  if (!temTelefoneValido) {
    status = StatusLead.REJECTED;
    motivoRejeicao = "SEM_CONTATO";
  } else if (!temMinimoFotos) {
    status = StatusLead.REJECTED;
    motivoRejeicao = "POUCAS_FOTOS";
  } else {
    // REGRA DE OURO: Lead entra OBRIGATORIAMENTE como PENDING_REVIEW para revisão humana
    status = autoAprovar ? StatusLead.APPROVED : StatusLead.PENDING_REVIEW;
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
    fotos: fotosMeta.length > 0 ? fotosMeta : fotos,
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
  if (status === StatusLead.APPROVED || status === (StatusLead as any).APROVADA) {
    resumo.aprovadas++;
  } else if (status === StatusLead.REJECTED || status === (StatusLead as any).REJEITADA) {
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
