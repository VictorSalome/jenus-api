import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/StringSession.js";
import { NewMessage } from "telegram/events/index.js";

import {
  getConfig,
  updateSession,
} from "../telegram-config/telegram-config.repository.js";
import { findAll } from "../channel/channel.repository.js";
import {
  findAllFilters,
  getActiveFiltersCount,
} from "../filter/filter.repository.js";
import { isDuplicate, addSentMessage } from "../dedup/dedup.repository.js";
import { discordQueue } from "../discord/discord.service.js";
import { getMonitorStatus, setRunningState, setTelegramConnected } from "./monitor.state.js";

let client: TelegramClient | null = null;
let isProcessing = false;
let consecutiveErrors = 0;
let lastMessageIds: Map<string, number> = new Map();

// Cache de canais ativos com TTL-based memoization
let cachedActiveChannels: Set<string> | null = null;
let channelsCacheTimestamp = 0;
const CHANNELS_CACHE_TTL = 30_000; // 30 segundos

// Configurações inteligentes de retry (baseado na skill Telegram)
const RETRY_CONFIG = {
  maxRetries: 5,
  baseDelay: 5000, // 5 segundos
  maxDelay: 300000, // 5 minutos
  floodWaitMultiplier: 1.5,
};

// Delay adaptativo baseado na atividade
let currentCheckInterval = 120000; // Começa com 2 minutos
const MIN_INTERVAL = 60000; // 1 minuto mínimo
const MAX_INTERVAL = 300000; // 5 minutos máximo

export async function startTelegramMonitor(): Promise<void> {
  if (isProcessing) {
    console.log("[Monitor] Já está processando");
    return;
  }

  // Resetar lastMessageIds se o monitor acabou de ser iniciado (para pegar mensagens novas em próximo ciclo)
  if (!getMonitorStatus().running) {
    // Primeira execução após start não reseta IDs para evitar reenvio em massa
  }
  
  try {
    isProcessing = true;

    const tgConfig = await getConfig();
    if (!tgConfig || !tgConfig.apiId || !tgConfig.apiHash) {
      console.log("[Monitor] Configuração do Telegram não encontrada");
      return;
    }

    // Verificar se está conectado
    if (!tgConfig.isConnected || !tgConfig.sessionString) {
      console.log("[Monitor] Telegram não autenticado. Aguardando autenticação...");
      scheduleNextCheck();
      return;
    }

    const channels = await findAll();
    const activeChannels = channels.filter((ch) => {
      const isActive = (ch as any).is_active || (ch as any).isActive;
      return isActive === 1 || isActive === true;
    });

    if (activeChannels.length === 0) {
      console.log("[Monitor] Nenhum canal ativo");
      scheduleNextCheck();
      return;
    }

    // Verificar se há filtros ativos ou se deve pegar TUDO
    const activeFiltersCount = await getActiveFiltersCount();
    const noFilterMode = activeFiltersCount === 0;

    if (!client) {
      await createClient(tgConfig);
    }

    if (!client || !client.connected) {
      console.log("[Monitor] Cliente desconectado. Recriando conexão...");
      setTelegramConnected(false);
      if (client) {
        try { await client.destroy(); } catch (e) {}
        client = null;
      }
      await createClient(tgConfig);
    }

    console.log(
      `[Monitor] Verificando ${activeChannels.length} canais (Modo: ${noFilterMode ? "SEM FILTRO" : "FILTRADO"})`,
    );

    // Buscar filtros UMA VEZ antes do loop (não por canal)
    const filters = noFilterMode ? [] : await findAllFilters();

    // Invalidar cache de canais ativos
    cachedActiveChannels = null;

    // Processar canais em batch (3 por vez para evitar flood do Telegram)
    let messagesFound = 0;
    const BATCH_SIZE = 3;
    for (let i = 0; i < activeChannels.length; i += BATCH_SIZE) {
      const batch = activeChannels.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (ch) => {
          const count = await processChannel(ch.username, noFilterMode, filters);
          if (count > 0) {
            console.log(`[Monitor] Canal ${ch.username}: ${count} mensagens enviadas`);
          } else {
            console.log(`[Monitor] Canal ${ch.username}: sem mensagens novas`);
          }
          return count;
        })
      );
      messagesFound += results.reduce((sum, r) =>
        sum + (r.status === "fulfilled" ? r.value : 0), 0
      );
    }

    // Ajustar intervalo dinamicamente (mais rápido se encontrou mensagens)
    if (messagesFound > 0) {
      currentCheckInterval = Math.max(MIN_INTERVAL, currentCheckInterval * 0.8);
      consecutiveErrors = 0;
    } else {
      currentCheckInterval = Math.min(MAX_INTERVAL, currentCheckInterval * 1.1);
    }

    console.log(
      `[Monitor] Próxima verificação em ${(currentCheckInterval / 1000).toFixed(0)}s`,
    );
  } catch (err: any) {
    console.error("[Monitor] Erro:", err);
    consecutiveErrors++;

    // Tratamento inteligente de FloodWait (baseado na skill Telegram)
    if (err.code === 420 || err.errorMessage?.includes("FLOOD")) {
      const waitTime = err.seconds || 60;
      console.log(`[Monitor] FloodWait detectado. Aguardando ${waitTime}s...`);
      currentCheckInterval = Math.max(waitTime * 1000, 120000);
    } else if (consecutiveErrors >= 3) {
      console.log("[Monitor] Muitos erros consecutivos. Reconectando...");
      await reconnectClient();
      consecutiveErrors = 0;
    }
  } finally {
    isProcessing = false;
    scheduleNextCheck();
  }
}

async function createClient(tgConfig: any): Promise<void> {
  const session = new StringSession(tgConfig.sessionString || "");
  client = new TelegramClient(
    session,
    parseInt(tgConfig.apiId),
    tgConfig.apiHash,
    {
      connectionRetries: RETRY_CONFIG.maxRetries,
      useWSS: false,
      timeout: 30000,
      autoReconnect: true,
    },
  );
  await client.connect();

  setupRealtimeHandler();

  const sessionString = session.save();
  await updateSession(sessionString, true);
  setTelegramConnected(true);
}

async function reconnectClient(): Promise<void> {
  if (client) {
    try {
      await client.disconnect();
    } catch (e) {}
    client = null;
  }
  setTelegramConnected(false);

  const tgConfig = await getConfig();
  if (tgConfig) {
    await createClient(tgConfig);
    setTelegramConnected(true);
  }
}

async function getActiveChannelUsernames(): Promise<Set<string>> {
  const now = Date.now();
  if (!cachedActiveChannels || now - channelsCacheTimestamp > CHANNELS_CACHE_TTL) {
    const channels = await findAll();
    cachedActiveChannels = new Set(
      channels
        .filter((ch: any) => {
          const isActive = ch.is_active || ch.isActive;
          return isActive === 1 || isActive === true;
        })
        .map((ch: any) => `@${ch.username.toLowerCase()}`)
    );
    channelsCacheTimestamp = now;
  }
  return cachedActiveChannels;
}

function setupRealtimeHandler(): void {
  if (!client || !getMonitorStatus().running) return;

  client.addEventHandler(async (event: any) => {
    try {
      if (!getMonitorStatus().running) return;

      const message = event.message;
      if (!message) return;

      let text = message.text || message.caption || "";
      if (!text.trim()) return;

      let channelUsername = "";

      if (message.chat?.username) {
        channelUsername = `@${message.chat.username.toLowerCase()}`;
      } else {
        try {
          const chat = await message.getChat();
          if (chat?.username) {
            channelUsername = `@${chat.username.toLowerCase()}`;
          }
        } catch {}
      }

      if (!channelUsername) return;

      // Usar cache para verificar se é canal monitorado
      const activeChannels = await getActiveChannelUsernames();
      if (!activeChannels.has(channelUsername)) return;

      console.log(`[Monitor][Tempo Real] Nova mensagem em ${channelUsername}`);

      const activeFiltersCount = await getActiveFiltersCount();
      const noFilterMode = activeFiltersCount === 0;
      const filters = noFilterMode ? [] : await findAllFilters();

      await processMessage(message, channelUsername, filters, noFilterMode);
    } catch (err: any) {
      console.error(`[Monitor][Tempo Real] Erro: ${err?.message || err}`);
    }
  }, new NewMessage({}));

  console.log("[Monitor] Handler de tempo real registrado");
}

function scheduleNextCheck(): void {
  if (getMonitorStatus().running) {
    setTimeout(() => {
      startTelegramMonitor();
    }, currentCheckInterval);
  }
}

async function processChannel(
  channelUsername: string,
  noFilterMode: boolean,
  filters: any[],
): Promise<number> {
  try {
    if (!client) return 0;

    const entity = await client.getEntity(channelUsername);

    const lastId = lastMessageIds.get(channelUsername) || 0;

    // Buscar as últimas mensagens do canal
    const messages = await client.getMessages(entity, {
      limit: noFilterMode ? 30 : 20,
    });

    if (messages.length === 0) {
      console.log(`[Monitor] Canal ${channelUsername}: getMessages retornou 0 mensagens`);
      return 0;
    }

    // Filtrar apenas mensagens novas (ID > último rastreado)
    const messageIds = messages.map(m => m.id);
    const newMessages = lastId === 0 ? [] : messages.filter(m => (m.id || 0) > lastId);
    console.log(`[Monitor] Canal ${channelUsername}: ${messages.length} msgs obtidas (IDs: ${Math.min(...messageIds)}-${Math.max(...messageIds)}), lastId=${lastId}, novas=${newMessages.length}`);
    if (newMessages.length === 0 && lastId === 0) {
      // Primeira execução: só rastrear o último ID sem enviar nada
      const maxId = Math.max(...messages.map(m => m.id || 0));
      lastMessageIds.set(channelUsername, maxId);
      console.log(`[Monitor] Canal ${channelUsername}: rastreado último ID ${maxId}`);
      return 0;
    }

    if (newMessages.length === 0) {
      console.log(`[Monitor] Canal ${channelUsername}: sem mensagens novas (último ID: ${lastId})`);
      return 0;
    }

    // Atualizar último ID
    const newLastId = Math.max(...messages.map((m) => m.id || 0));
    if (newLastId > lastId) {
      lastMessageIds.set(channelUsername, newLastId);
    }

    let sentCount = 0;

    for (const message of newMessages.reverse()) {
      // Processar do mais antigo para o mais novo
      const result = await processMessage(
        message,
        channelUsername,
        filters,
        noFilterMode,
      );
      if (result) sentCount++;
    }

    return sentCount;
  } catch (err: any) {
    console.error(
      `[Monitor] Erro ao processar canal ${channelUsername}: ${err?.message || err}`,
    );
    // Se o cliente desconectou, marcar para reconexão no próximo ciclo
    if (err?.message === "Not connected" || err?.code === "TIMEOUT") {
      console.log("[Monitor] Cliente desconectado durante processamento. Reconectando...");
      setTelegramConnected(false);
      if (client) {
        try { await client.destroy(); } catch (e) {}
        client = null;
      }
    }
    return 0;
  }
}

async function processMessage(
  message: any,
  channelUsername: string,
  filters: any[],
  noFilterMode: boolean,
): Promise<boolean> {
  try {
    // Suportar texto e mídia com legenda
    let text = "";

    if (message.text) {
      text = message.text;
    } else if (message.caption) {
      text = message.caption;
    }

    if (!text || text.trim().length === 0) {
      return false; // Ignorar mensagens sem texto
    }

    const textLower = text.toLowerCase();

    // Modo SEM FILTRO: enviar TUDO
    if (noFilterMode) {
      return await sendPromoMessage(
        text,
        channelUsername,
        null,
        "Todas as Promoções",
        message,
      );
    }

    // Modo COM FILTROS
    for (const filter of filters) {
      if (!filter.is_active) continue;

      // As keywords estão armazenadas como JSON no banco
      // Ex: '["galaxy","samsung"]' → precisa de JSON.parse()
      let keywords: string[];
      try {
        keywords = JSON.parse(filter.keywords).map((k: string) => k.toLowerCase().trim());
      } catch {
        // Fallback para formato antigo separado por vírgula
        keywords = filter.keywords.toLowerCase().split(",").map((k: string) => k.trim());
      }
      const matches =
        filter.type === "specific"
          ? keywords.every((k: string) => textLower.includes(k))
          : keywords.some((k: string) => textLower.includes(k));

      if (matches) {
        const sent = await sendPromoMessage(
          text,
          channelUsername,
          message.id,
          filter.name,
          message,
        );
        if (sent) return true;
      }
    }

    return false;
  } catch (err) {
    console.error("[Monitor] Erro ao processar mensagem:", err);
    return false;
  }
}

async function sendPromoMessage(
  text: string,
  channelUsername: string,
  messageId: number | null,
  filterName: string,
  message?: any,
): Promise<boolean> {
  try {
    // Extrair informações com IA (mais inteligente)
    const product = extractProductName(text);
    const price = extractPrice(text);
    const store = extractStore(text, channelUsername);
    const discount = extractDiscount(text);
    const originalPrice = extractOriginalPrice(text);

    const link = messageId
      ? `https://t.me/${channelUsername.replace("@", "")}/${messageId}`
      : `https://t.me/${channelUsername.replace("@", "")}`;

    // Verificar duplicata com janela maior (24 horas)
    const dup = await isDuplicate(link, product, price || undefined, 1440);
    if (dup) {
      console.log("[Monitor] Duplicata ignorada:", product);
      return false;
    }

    const img = await extractImageUrl(text, message);

    // Enfileirar envio (não bloqueia o loop)
    discordQueue.enqueue({
      product,
      price,
      originalPrice,
      discount,
      store,
      link,
      filterName,
      channel: channelUsername,
      imageUrl: img?.url || null,
      imageBuffer: img?.buffer || null,
    });

    // Push notification
    try {
      const { sendPushNotification } = await import('../push/push.service.js');
      const { isUrgent } = await import('../urgent/urgent.config.js');
      const urgent = isUrgent(text, originalPrice || 0, price || 0);
      await sendPushNotification({
        title: urgent ? '🔥 URGENTE!' : '🏷️ Nova promo!',
        body: `${product || 'Produto'} por ${price ? `R$${price}` : 'preço não informado'} — ${store || channelUsername}`,
        data: { screen: 'promo', product, price, store, link },
        priority: urgent ? 'high' : 'normal',
      });
    } catch (e) {
      console.error('[Push] Erro ao enviar push de promo:', e);
    }

    // Price alert matching
    try {
      const { getDb } = await import('../../core/database.js');
      const db = await getDb();
      const alerts = await db.all(
        'SELECT * FROM price_alerts WHERE is_active = 1'
      ) as any[];

      for (const alert of alerts) {
        if (price && alert.target_price >= price) {
          const { sendPushNotification: sendPush } = await import('../push/push.service.js');
          await sendPush({
            title: '💰 Alerta de preço!',
            body: `${alert.product_name} atingiu R$${price} (meta: R$${alert.target_price})`,
            data: { screen: 'price-alert', productId: alert.product_name },
            priority: 'high',
          });
        }
      }
    } catch (e) {
      console.error('[Push] Erro ao verificar price alerts:', e);
    }

    await addSentMessage({
      link,
      product,
      price: price ?? undefined,
      store,
      channel: channelUsername,
      messageText: text.substring(0, 1000),
      matchedFilters: [filterName],
    });

    console.log("[Monitor] Promoção enviada:", product);
    return true;
  } catch (err) {
    console.error("[Monitor] Erro ao enviar mensagem:", err);
    return false;
  }
}

// ========== EXTRATOR DE IMAGEM ==========

const IMAGE_URL_REGEX = /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s"'<>]*)?/gi;

async function extractImageUrl(
  text: string,
  message?: any,
): Promise<{ url?: string; buffer?: { data: Buffer; ext: string } } | null> {
  // 1. Tentar extrair URL de imagem do texto
  const urlMatch = text.match(IMAGE_URL_REGEX);
  if (urlMatch && urlMatch[0]) {
    return { url: urlMatch[0] };
  }

  // 2. Tentar baixar foto do Telegram
  if (message?.photo && client) {
    try {
      const buffer = await client.downloadMedia(message);
      if (buffer && buffer instanceof Buffer) {
        return { buffer: { data: buffer, ext: "png" } };
      }
    } catch (err: any) {
      // Imagem é opcional — loga só em debug
      if (err?.message !== "Not connected") {
        console.log(`[Monitor] Erro ao baixar imagem: ${err?.message || err}`);
      }
    }
  }

  return null;
}

// ========== EXTRACTORES INTELIGENTES ==========

function extractProductName(text: string): string {
  // Limpar o texto
  const lines = text.split("\n").filter((l) => l.trim().length > 0);

  // Procurar linha que parece um produto (não preço, não link)
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.length > 5 &&
      !trimmed.match(/^R?\$?\s*\d/) &&
      !trimmed.startsWith("http") &&
      !trimmed.match(/^(promo|oferta|desconto|link|preço)/i)
    ) {
      return trimmed.substring(0, 80);
    }
  }

  return lines[0]?.substring(0, 80) || "Produto";
}

function extractPrice(text: string): number | null {
  const toNumber = (s: string): number | null => {
    const num = parseFloat(s.replace(/\./g, "").replace(",", "."));
    return num > 0 && num < 100000 ? num : null;
  };

  // 1. Priorizar "por", "apenas", "custando" (preço de venda)
  const saleMatch = text.match(
    /(?:por|apenas|custando)\s*[:\-]?\s*(?:R\$\s*)?(\d{1,2}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d{1,5}(?:[.,]\d{2})?)(?!\d)/i,
  );
  if (saleMatch) {
    const price = toNumber(saleMatch[1]);
    if (price !== null) return price;
  }

  // 2. Fallback: "R$" genérico ou "Preço"
  const genericPatterns = [
    // Com R$ — com ou sem centavos
    /(?:R\$\s*|[Pp]reço\s*[:\-]?\s*)(\d{1,2}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d{1,5}(?:[.,]\d{2})?)(?!\d)/,
    // Número solto + "reais"/"r$"
    /(\d{1,2}(?:[.,]\d{3})+[.,]\d{2}|\d{1,5}[.,]\d{2})\s*(?:reais|r\$)/i,
    // Milhar solto + "reais"/"r$"
    /(?:\b|\s)(\d{1,2}(?:[.,]\d{3})+)(?=\s*(?:reais|r\$))/i,
  ];

  for (const pattern of genericPatterns) {
    const match = text.match(pattern);
    if (match) {
      const price = toNumber(match[1]);
      if (price !== null) return price;
    }
  }

  return null;
}

function extractOriginalPrice(text: string): number | null {
  const toNumber = (s: string): number | null => {
    const num = parseFloat(s.replace(/\./g, "").replace(",", "."));
    return num > 0 && num < 100000 ? num : null;
  };

  const patterns = [
    // 1. "De R$" (início de linha ou após emoji) — preço original
    /(?:^|[\n\r])[^\n]*?[Dd]e\s*[:\-]?\s*R\$\s*(\d{1,2}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d{1,5}(?:[.,]\d{2})?)(?!\d)/,
    // 2. "preço original", "antigo", "de antes"
    /(?:preço\s*original|antigo|de\s*antes)\s*[:\-]?\s*(?:R\$\s*)?(\d{1,2}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d{1,5}(?:[.,]\d{2})?)(?!\d)/i,
    // 3. "era", "era de"
    /(?:era|era\s*de)\s*[:\-]?\s*(?:R\$\s*)?(\d{1,2}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d{1,5}(?:[.,]\d{2})?)(?!\d)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const price = toNumber(match[1]);
      if (price !== null) return price;
    }
  }

  return null;
}

function extractDiscount(text: string): string | null {
  // Procurar porcentagem de desconto
  const discountMatch = text.match(/(\d+)%\s*(?:off|desconto|de\s*desconto)/i);
  if (discountMatch) {
    return discountMatch[1] + "% OFF";
  }

  // Procurar "economize R$ X"
  const saveMatch = text.match(
    /(?:economize|economia)\s*(?:R\$\s*)?(\d+[.,]?\d*)/i,
  );
  if (saveMatch) {
    return "Economize R$ " + saveMatch[1];
  }

  return null;
}

function extractStore(text: string, channel: string): string {
  // Extrair nome da loja do texto
  const storePatterns = [
    /(?:loja|store|site|vendedor|shop)[\s:]+([^\n]+)/i,
    /(?:comprar\s*(?:em|no|na))\s+([^\n]+)/i,
    /(?:amazon|mercado\s+livre|magazine\s*luiza|shopee|aliexpress|americanas|submarino)/i,
  ];

  for (const pattern of storePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1]?.trim() || match[0]?.trim() || channel;
    }
  }

  return channel;
}

// ========== FORMATADORES DE MENSAGEM ==========
// Formatação movida para discord.service.ts (rich embeds)

export async function stopTelegramMonitor(): Promise<void> {
  if (client) {
    try {
      client.destroy();
    } catch (e) {}
    client = null;
  }
  setTelegramConnected(false);
  lastMessageIds.clear();
  setRunningState(false);
  console.log("[Monitor] Monitor parado");
}
