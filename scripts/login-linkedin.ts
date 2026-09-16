#!/usr/bin/env node
import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import {
  obterCaminhoSessao,
  verificarSinaisAutenticacao,
  verificarSessaoSalva,
} from "../src/apps/curriculos/scraper/linkedin/linkedin-session.service.js";

const TIMEOUT_SEGUNDOS = 180; // 3 minutos
const INTERVALO_POLL_MS = 1500;

async function main() {
  console.log("=========================================================");
  console.log("  🔐 LINKEDIN: AUTENTICAÇÃO MANUAL INTERATIVA (FASE 2)");
  console.log("=========================================================");
  console.log("\nIniciando navegador Chromium visível...");

  const sessionPath = obterCaminhoSessao();
  const sessionDir = path.dirname(sessionPath);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  // Caminho temporário para garantir que nenhuma gravação parcial seja mantida em caso de falha
  const tempSessionPath = `${sessionPath}.tmp`;

  let browser;
  try {
    browser = await chromium.launch({
      headless: false,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    console.log("Navegando para https://www.linkedin.com/login ...");
    await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });

    console.log("\n👉 Instruções para o operador:");
    console.log("   1. Digite seu login e senha manualmente na janela do navegador.");
    console.log("   2. Resolva qualquer verificação de identidade, CAPTCHA ou 2FA solicitada.");
    console.log(`   3. Aguardando conclusão da autenticação (timeout: ${TIMEOUT_SEGUNDOS}s)...\n`);

    const inicio = Date.now();
    let autenticado = false;

    while (Date.now() - inicio < TIMEOUT_SEGUNDOS * 1000) {
      // Checa se a página ou navegador foram fechados pelo usuário
      if (page.isClosed() || !browser.isConnected()) {
        console.log("\n⚠️  Navegador fechado antes da conclusão da autenticação.");
        break;
      }

      let cookies: any[] = [];
      let currentUrl = "";

      try {
        cookies = await context.cookies();
        currentUrl = page.url();
      } catch {
        break;
      }

      // 1. Validação por múltiplos sinais de rede e URL
      const sinaisUrlCookies = verificarSinaisAutenticacao(cookies, currentUrl);

      // 2. Validação por presença de elemento da barra de navegação autenticada no DOM
      let temElementoLogado = false;
      if (sinaisUrlCookies) {
        try {
          temElementoLogado = await page
            .locator("#global-nav, .global-nav, nav[aria-label='Primary Navigation'], .feed-identity-module, [data-view-name*='feed']")
            .first()
            .isVisible({ timeout: 500 })
            .catch(() => false);
        } catch {}
      }

      // Requer obrigatoriamente que a área autenticada esteja ativa no DOM ou em rota autenticada
      const rotaAutenticadaConfirmada =
        currentUrl.includes("/feed") ||
        currentUrl.includes("/mynetwork") ||
        currentUrl.includes("/jobs") ||
        currentUrl.includes("/in/");

      if (sinaisUrlCookies && (temElementoLogado || rotaAutenticadaConfirmada)) {
        // Aguarda 1.5s para garantir que todos os cookies de sessão sejam persistidos pelo browser
        await page.waitForTimeout(1500);
        autenticado = true;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, INTERVALO_POLL_MS));
    }

    if (!autenticado) {
      // Limpeza defensiva de qualquer arquivo temporário
      if (fs.existsSync(tempSessionPath)) {
        fs.unlinkSync(tempSessionPath);
      }
      console.error("\n❌ Sessão não foi salva: tempo limite atingido ou autenticação não concluída.");
      await browser.close().catch(() => {});
      process.exit(1);
    }

    console.log("🔍 Autenticação detectada! Validando integridade da sessão...");

    // Gravação no arquivo temporário
    await context.storageState({ path: tempSessionPath });

    // Validação estrita do arquivo antes de torná-lo oficial
    const statusValidacao = verificarSessaoSalva(tempSessionPath);
    if (!statusValidacao.valida) {
      if (fs.existsSync(tempSessionPath)) {
        fs.unlinkSync(tempSessionPath);
      }
      console.error(`\n❌ Falha na validação do storageState gerado: ${statusValidacao.motivo}`);
      await browser.close().catch(() => {});
      process.exit(1);
    }

    // Gravação atômica: substitui o arquivo oficial somente após validação 100% aprovada
    fs.renameSync(tempSessionPath, sessionPath);
    try {
      fs.chmodSync(sessionPath, 0o600);
    } catch {}

    console.log("\n=========================================================");
    console.log("  ✅ SESSÃO DO LINKEDIN SALVA COM SUCESSO!");
    console.log("=========================================================");
    console.log(`📁 Arquivo de sessão: ${sessionPath}`);
    if (statusValidacao.diasRestantes !== undefined) {
      console.log(`⏳ Validade aproximada: ~${statusValidacao.diasRestantes} dias`);
    }
    console.log("🔒 Nenhuma credencial foi gravada em texto puro no código ou banco.");

    await browser.close().catch(() => {});
    process.exit(0);
  } catch (err: any) {
    if (fs.existsSync(tempSessionPath)) {
      try {
        fs.unlinkSync(tempSessionPath);
      } catch {}
    }
    console.error(`\n❌ Erro durante o fluxo de autenticação: ${err?.message || err}`);
    if (browser) {
      await browser.close().catch(() => {});
    }
    process.exit(1);
  }
}

main();
