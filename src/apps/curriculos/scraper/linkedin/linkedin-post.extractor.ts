import type { Page, Locator } from "playwright";
import type { RawLinkedInPost } from "./linkedin.types.js";
import { avaliarIdadePublicacao } from "./linkedin-temporal.utils.js";
import { normalizarParaCanonicalPostUrl } from "./linkedin-job.parser.js";

/**
 * Extrai publicações do DOM da página de busca do LinkedIn de forma semântica.
 * Evita classes CSS dinâmicas/ofuscadas e prioriza atributos semânticos, links canônicos e tags <time>.
 *
 * MODO ESTRITAMENTE SOMENTE LEITURA:
 * - Não curte, não comenta, não conecta, não envia mensagem.
 */
export async function extrairPostsDaPagina(page: Page): Promise<RawLinkedInPost[]> {
  const postsExtraidos: RawLinkedInPost[] = [];

  // Localiza os containers de posts por seletores do LinkedIn (busca de conteúdo e feed)
  const postLocators = page.locator(
    "div[id^='expanded'][id*='FeedType_'], div[data-testid='lazy-column'] > div[id*='FeedType_'], .feed-shared-update-v2, div[data-urn*='urn:li:activity:'], .reusable-search__result-container",
  );

  const totalLocators = await postLocators.count().catch(() => 0);
  if (totalLocators === 0) {
    return [];
  }

  for (let i = 0; i < totalLocators; i++) {
    const postEl = postLocators.nth(i);

    try {
      // 1. Expansão segura do texto (botão "...ver mais" / "...see more")
      const btnExpand = postEl
        .locator('[data-testid="expandable-text-button"], button.feed-shared-inline-show-more-text__button, button:has-text("ver mais"), button:has-text("see more")')
        .first();

      if ((await btnExpand.count().catch(() => 0)) > 0) {
        await btnExpand.click({ timeout: 400 }).catch(() => {});
      }

      // 2. Extração do texto completo da publicação
      const textContainer = postEl
        .locator('span[data-testid="expandable-text-box"], .feed-shared-update-v2__description-wrapper, .update-components-text')
        .first();

      let text = (await textContainer.innerText().catch(() => "")).trim();
      if (!text || text.length < 20) {
        text = (await postEl.innerText().catch(() => "")).trim();
      }

      if (!text || text.length < 20) {
        continue;
      }

      // 3. Extração de autor, empresa e headline
      const authorLinks = postEl.locator("a[href*='/in/'], a[href*='/company/']");
      const totalAuthorLinks = await authorLinks.count().catch(() => 0);
      let authorName = "";
      let authorHref = "";
      let isCompany = false;

      for (let j = 0; j < totalAuthorLinks; j++) {
        const link = authorLinks.nth(j);
        const href = (await link.getAttribute("href").catch(() => "")) || "";
        const txt = (await link.innerText().catch(() => "")).trim();
        if (txt && !authorName) {
          authorName = txt.split("•")[0].trim();
          authorHref = href.split("?")[0].trim();
          isCompany = href.includes("/company/");
          break;
        }
      }

      const headlineEl = postEl.locator('.update-components-actor__sub-description, .feed-shared-actor__sub-description, [class*="actor__sub-description"]').first();
      const authorHeadline = (await headlineEl.innerText().catch(() => "")).trim();

      // 4. Extração do link canônico obrigatório da publicação
      // A URL DEVE ser estritamente a publicação original (/feed/update/urn:li:activity:...)
      // NUNCA pode ser URL do perfil (/in/) ou de empresa (/company/)
      let canonicalUrl = "";
      let activityId = "";

      // A. Procura link direto de postagem no card
      const linkActivity = postEl.locator('a[href*="/feed/update/urn:li:activity:"], a[href*="/posts/"]').first();
      if ((await linkActivity.count().catch(() => 0)) > 0) {
        const href = (await linkActivity.getAttribute("href").catch(() => "")) || "";
        if (href) {
          const norm = normalizarParaCanonicalPostUrl(href);
          if (norm) {
            canonicalUrl = norm;
            const matchUrn = canonicalUrl.match(/urn:li:activity:(\d+)/);
            if (matchUrn && matchUrn[1]) activityId = matchUrn[1];
          }
        }
      }

      // B. Se não há link <a> direto no card e o texto contém e-mail, utiliza a ação "Copiar link da publicação"
      const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text);
      if (!canonicalUrl && hasEmail) {
        try {
          const menuBtn = postEl
            .locator("button[aria-label*='menu de controle'], button[aria-label*='Control menu']")
            .first();

          if ((await menuBtn.count().catch(() => 0)) > 0) {
            await postEl.scrollIntoViewIfNeeded().catch(() => {});
            await page.evaluate(() => {
              (globalThis as any).__lastCopiedUrl = "";
            });
            await menuBtn.click({ timeout: 1000 }).catch(() => {});
            await page.waitForTimeout(250);

            const copyBtn = page
              .locator("div[role='menuitem']:has-text('Copiar link'), [role='menuitem']:has-text('Copiar link')")
              .first();

            if ((await copyBtn.count().catch(() => 0)) > 0) {
              await copyBtn.click({ timeout: 1000 }).catch(() => {});
              await page.waitForTimeout(200);

              const copied = await page.evaluate(() => (globalThis as any).__lastCopiedUrl);
              if (copied && typeof copied === "string" && copied.startsWith("http")) {
                if (copied.includes("lnkd.in")) {
                  try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 3000);
                    const resp = await fetch(copied, { method: "HEAD", redirect: "follow", signal: controller.signal });
                    clearTimeout(timeoutId);
                    const norm = normalizarParaCanonicalPostUrl(resp.url);
                    if (norm) {
                      canonicalUrl = norm;
                      const matchUrn = canonicalUrl.match(/urn:li:activity:(\d+)/);
                      if (matchUrn && matchUrn[1]) activityId = matchUrn[1];
                    }
                  } catch {
                    const norm = normalizarParaCanonicalPostUrl(copied);
                    if (norm) canonicalUrl = norm;
                  }
                } else {
                  const norm = normalizarParaCanonicalPostUrl(copied);
                  if (norm) {
                    canonicalUrl = norm;
                    const matchUrn = canonicalUrl.match(/urn:li:activity:(\d+)/);
                    if (matchUrn && matchUrn[1]) activityId = matchUrn[1];
                  }
                }
              }
            } else {
              await page.keyboard.press("Escape").catch(() => {});
            }
          }
        } catch {}
      }

      const postId = activityId || undefined;

      // 5. Extração da data de publicação (<time> ou texto relativo no cabeçalho)
      const timeEl = postEl.locator("time").first();
      const datetimeAttr = (await timeEl.getAttribute("datetime").catch(() => "")) || "";
      let timeText = (await timeEl.innerText().catch(() => "")).trim();

      if (!timeText && !datetimeAttr) {
        const dateMatch = text.match(/\b(\d+\s*(?:min|h|d|sem|m|s))\b/i);
        if (dateMatch) {
          timeText = dateMatch[1];
        }
      }

      const avaliacaoData = avaliarIdadePublicacao(timeText, datetimeAttr);

      postsExtraidos.push({
        id: postId,
        url: canonicalUrl || undefined, // Somente se for canonical post URL (nunca perfil ou vazio)
        authorName: !isCompany && authorName ? authorName : undefined,
        authorHeadline: authorHeadline || undefined,
        companyName: isCompany && authorName ? authorName : undefined,
        publishedAtText: timeText,
        publishedAt: avaliacaoData.dataEstimada.toISOString(),
        text,
      });
    } catch {
      continue;
    }
  }

  return postsExtraidos;
}
