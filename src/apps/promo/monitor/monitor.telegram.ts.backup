import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/StringSession.js';
import { getConfig } from '../telegram-config/telegram-config.repository.js';
import { findAll } from '../channel/channel.repository.js';
import { findAllFilters } from '../filter/filter.repository.js';
import { isDuplicate, addSentMessage } from '../dedup/dedup.repository.js';
import { sendMessage } from '../whatsapp/whatsapp.service.js';
import { getMonitorStatus, setRunningState } from './monitor.state.js';

let client: TelegramClient | null = null;
let isProcessing = false;

export async function startTelegramMonitor(): Promise<void> {
  if (isProcessing) {
    console.log('[Monitor] Já está processando');
    return;
  }

  try {
    isProcessing = true;
    
    // Buscar config do Telegram
    const tgConfig = await getConfig();
    if (!tgConfig || !tgConfig.apiId || !tgConfig.apiHash) {
      console.log('[Monitor] Configuração do Telegram não encontrada');
      return;
    }

    // Buscar canais ativos
    const channels = await findAll();
    const activeChannels = channels.filter(ch => {
      const isActive = (ch as any).is_active || (ch as any).isActive;
      return isActive === 1 || isActive === true;
    });
    if (activeChannels.length === 0) {
      console.log('[Monitor] Nenhum canal ativo');
      return;
    }

    // Buscar filtros
    const filters = await findAllFilters();
    if (filters.length === 0) {
      console.log('[Monitor] Nenhum filtro configurado');
      return;
    }

    // Criar cliente MTProto
    const session = new StringSession(tgConfig.sessionString || '');
    client = new TelegramClient(
      session,
      parseInt(tgConfig.apiId),
      tgConfig.apiHash,
      { connectionRetries: 3 }
    );

    console.log('[Monitor] Conectando ao Telegram...');
    await client.connect();
    
    // Salvar session string para reconexões futuras
    const sessionString = session.save();
    const { updateSession } = await import('../telegram-config/telegram-config.repository.js');
    await updateSession(sessionString, true);
    
    console.log('[Monitor] Conectado! Monitorando', activeChannels.length, 'canais');

    // Processar cada canal
    for (const channel of activeChannels) {
      await processChannel(channel.username, filters);
    }

    // Agendar próxima verificação (a cada 2 minutos)
    setTimeout(() => {
      if (getMonitorStatus().running) {
        startTelegramMonitor();
      }
    }, 120000);

  } catch (err) {
    console.error('[Monitor] Erro:', err);
    // Reconectar em caso de erro
    setTimeout(() => {
      if (getMonitorStatus().running) {
        startTelegramMonitor();
      }
    }, 30000);
  } finally {
    isProcessing = false;
  }
}

async function processChannel(channelUsername: string, filters: any[]): Promise<void> {
  try {
    if (!client) return;

    console.log('[Monitor] Verificando canal:', channelUsername);
    
    // Buscar entity do canal
    const entity = await client.getEntity(channelUsername);
    
    // Buscar últimas 10 mensagens
    const messages = await client.getMessages(entity, { limit: 10 });
    
    for (const message of messages) {
      if (!message.text) continue;
      
      const text = message.text.toLowerCase();
      
      // Verificar cada filtro
      for (const filter of filters) {
        if (!filter.is_active) continue;
        
        const keywords = filter.keywords.toLowerCase().split(',').map((k: string) => k.trim());
        const matches = filter.type === 'specific' 
          ? keywords.every((k: string) => text.includes(k))
          : keywords.some((k: string) => text.includes(k));
        
        if (matches) {
          // Extrair informações
          const product = extractProductName(text);
          const price = extractPrice(text);
          const store = extractStore(text, channelUsername);
          const link = `https://t.me/${channelUsername.replace('@', '')}/${message.id}`;
          
          // Verificar duplicata
          const dup = await isDuplicate(link, product, price || undefined, 30);
          if (dup) {
            console.log('[Monitor] Duplicata ignorada:', product);
            continue;
          }
          
          // Enviar WhatsApp
          const messageText = formatWhatsAppMessage(product, price, store, link, filter.name);
          await sendMessage(messageText);
          
          // Salvar no banco
          await addSentMessage({
            link,
            product,
            price: price ?? undefined,
            store,
            channel: channelUsername,
            messageText: message.text.substring(0, 500),
            matchedFilters: [filter.name]
          });
          
          console.log('[Monitor] Promoção enviada:', product);
        }
      }
    }
  } catch (err) {
    console.error('[Monitor] Erro ao processar canal', channelUsername, ':', err);
  }
}

function extractProductName(text: string): string {
  // Procurar padrões comuns de produto
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  return lines[0]?.substring(0, 50) || 'Produto';
}

function extractPrice(text: string): number | null {
  // Procurar preço em formatos: R$ 1.234,56 | R$ 1234,56 | 1234,56
  const priceRegex = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/;
  const match = text.match(priceRegex);
  if (match) {
    const priceStr = match[1].replace('.', '').replace(',', '.');
    return parseFloat(priceStr);
  }
  return null;
}

function extractStore(text: string, channel: string): string {
  // Extrair nome da loja do texto ou usar o canal
  const storeRegex = /(?:loja|store|site|vendedor)[\s:]+([^\n]+)/i;
  const match = text.match(storeRegex);
  return match ? match[1].trim() : channel;
}

function formatWhatsAppMessage(product: string, price: number | null, store: string, link: string, filter: string): string {
  const priceStr = price ? `R$ ${price.toFixed(2)}` : 'Preço não informado';
  return `🎯 *PROMOÇÃO ENCONTRADA*\n\n📦 *Produto:* ${product}\n💰 *Preço:* ${priceStr}\n🏪 *Loja:* ${store}\n🏷️ *Categoria:* ${filter}\n\n🔗 *Link:* ${link}`;
}

export async function stopTelegramMonitor(): Promise<void> {
  if (client) {
    await client.disconnect();
    client = null;
  }
  setRunningState(false);
  console.log('[Monitor] Monitor parado');
}
