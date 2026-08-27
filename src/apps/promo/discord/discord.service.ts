import fetch from "node-fetch";
import { promoConfig } from "../config.js";
import * as logger from "../../../core/logger.js";

interface PromoData {
  product: string;
  price: number | null;
  originalPrice: number | null;
  discount: string | null;
  store: string;
  link: string;
  filterName: string;
  channel?: string;
  imageUrl?: string | null;
  imageBuffer?: { data: Buffer; ext: string } | null;
}

const WEBHOOK_URL = promoConfig.DISCORD_WEBHOOK_URL;
const TIMEOUT = 5000;

const STORE_THUMBNAILS: Record<string, string> = {
  amazon: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",
  "mercado livre": "https://http2.mlstatic.com/frontend-assets/ml-web-navigation/ui-navigation/5.19.5/mercadolibre/logo_large_25years_v2.png",
  shopee: "https://deo.shopeemobile.com/shopee/shopee-mobilemall-logo-sg.png",
  magalu: "https://upload.wikimedia.org/wikipedia/commons/8/85/Magazine_Luiza_logo.svg",
  magazine: "https://upload.wikimedia.org/wikipedia/commons/8/85/Magazine_Luiza_logo.svg",
  "magazine luiza": "https://upload.wikimedia.org/wikipedia/commons/8/85/Magazine_Luiza_logo.svg",
  aliexpress: "https://upload.wikimedia.org/wikipedia/commons/4/4e/AliExpress_logo.svg",
  americanas: "https://upload.wikimedia.org/wikipedia/commons/6/6b/Americanas_logo.svg",
  submarino: "https://upload.wikimedia.org/wikipedia/commons/2/2b/Submarino_Logo.png",
  kabum: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/KaBum%21_Logo.svg/1200px-KaBum%21_Logo.svg.png",
  "ponto frio": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Ponto_Frio_logo.svg/1200px-Ponto_Frio_logo.svg.png",
  "casas bahia": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Casas_Bahia_logo.svg/1200px-Casas_Bahia_logo.svg.png",
  netshoes: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Netshoes_logo.svg/1200px-Netshoes_logo.svg.png",
  shein: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Shein_logo.png/1200px-Shein_logo.png",
};

const CORES_DINAMICAS = [
  { min: 50, cor: 0xE74C3C, badge: "🔥" },
  { min: 30, cor: 0xFF8C00, badge: "🔥" },
  { min: 10, cor: 0x2ECC71, badge: "⚡" },
  { min: 0, cor: 0x5865F2, badge: "" },
];

function formatBRL(valor: number): string {
  return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

function getDiscountData(
  originalPrice: number | null,
  price: number | null,
  discount: string | null,
): { percent: number; savings: number | null; badge: string; color: number } {
  if (originalPrice && price && originalPrice > price) {
    const percent = ((originalPrice - price) / originalPrice) * 100;
    const savings = originalPrice - price;
    for (const { min, cor, badge } of CORES_DINAMICAS) {
      if (percent >= min) return { percent, savings, badge, color: cor };
    }
  }
  return { percent: 0, savings: null, badge: discount ? "⚡" : "", color: CORES_DINAMICAS[CORES_DINAMICAS.length - 1].cor };
}

function getStoreThumbnail(store: string): string | null {
  const lower = store.toLowerCase();
  for (const [key, url] of Object.entries(STORE_THUMBNAILS)) {
    if (lower.includes(key)) return url;
  }
  return null;
}

function buildTitle(discountData: { percent: number; badge: string }): string {
  if (discountData.percent >= 50) return `🎯 ${discountData.badge} ${discountData.percent.toFixed(0)}% OFF`;
  if (discountData.percent >= 30) return `🎯 ${discountData.badge} ${discountData.percent.toFixed(0)}% OFF`;
  if (discountData.percent >= 10) return `🎯 ${discountData.badge} ${discountData.percent.toFixed(0)}% OFF`;
  return "🎯 PROMOÇÃO ENCONTRADA";
}

async function sendWebhook(
  payload: object,
  imageBuffer?: { data: Buffer; ext: string } | null,
): Promise<boolean> {
  if (!WEBHOOK_URL) {
    logger.warn("DISCORD_WEBHOOK_URL não configurado, pulando envio", "Discord");
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    let res: any;

    logger.info(
      `Enviando webhook Discord ${imageBuffer ? `com imagem (${imageBuffer.data.length} bytes)` : "sem imagem"}`,
      "Discord",
    );

    if (imageBuffer) {
      const filename = `promo.${imageBuffer.ext}`;
      const form = new FormData();
      form.append("file1", new Blob([imageBuffer.data]), filename);
      form.append("payload_json", JSON.stringify(payload));

      res = await fetch(WEBHOOK_URL, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
    } else {
      res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    }

    clearTimeout(timeout);

    if (res.ok) {
      logger.info("Mensagem enviada ao Discord!", "Discord");
      return true;
    }

    const text = await res.text().catch(() => "");
    logger.error(`Discord webhook retornou ${res.status}: ${text}`, "Discord");
    return false;
  } catch (err) {
    logger.error(`Erro ao enviar para Discord: ${err}`, "Discord");
    return false;
  }
}

export const sendDiscordPromo = async (data: PromoData): Promise<boolean> => {
  const priceStr = data.price ? formatBRL(data.price) : "Preço não informado";
  const discountData = getDiscountData(data.originalPrice, data.price, data.discount);
  const thumbnail = getStoreThumbnail(data.store);

  const fields: Array<{ name: string; value: string; inline: boolean }> = [];

  fields.push({ name: "📦 Produto", value: data.product, inline: false });

  const priceLine = data.price ? `**${priceStr}**` : "Preço não informado";
  fields.push({ name: "💰 Preço", value: priceLine, inline: true });

  if (data.originalPrice && data.price && data.originalPrice > data.price) {
    fields.push({
      name: "📉 De",
      value: `~~${formatBRL(data.originalPrice)}~~`,
      inline: true,
    });
    fields.push({
      name: "💵 Economia",
      value: `${formatBRL(discountData.savings!)} (**${discountData.percent.toFixed(0)}%**)`,
      inline: false,
    });
  }

  fields.push({ name: "🏪 Loja", value: `**${data.store}**`, inline: true });
  fields.push({ name: "📂 Categoria", value: data.filterName, inline: true });

  if (discountData.percent >= 50) {
    fields.push({ name: "🏷️ Desconto", value: `🔥 **${discountData.percent.toFixed(0)}% OFF**`, inline: true });
  } else if (data.discount) {
    fields.push({ name: "🏷️ Desconto", value: data.discount, inline: true });
  }

  fields.push({
    name: "🔗 Link da Promoção",
    value: `[Clique para acessar](${data.link})`,
    inline: false,
  });

  const embed: Record<string, any> = {
    title: buildTitle(discountData),
    color: discountData.color,
    description: `📦 **${data.product}**`,
    fields,
    timestamp: new Date().toISOString(),
    footer: {
      text: data.channel ? `📡 ${data.channel} • Promo Monitor` : "Promo Monitor",
    },
  };

  if (thumbnail) {
    embed.thumbnail = { url: thumbnail };
  }

  if (data.imageBuffer) {
    const filename = `promo.${data.imageBuffer.ext}`;
    embed.image = { url: `attachment://${filename}` };
  } else if (data.imageUrl && !data.imageUrl.startsWith("data:")) {
    embed.image = { url: data.imageUrl };
  }

  return sendWebhook({ embeds: [embed], username: "Promo Monitor 🚀" }, data.imageBuffer);
};

export const sendTestMessage = async (): Promise<boolean> => {
  const embed = {
    title: "🧪 Teste de Conexão",
    description: "Se você está vendo isso, o Discord está configurado corretamente!",
    color: 0x2ECC71,
    timestamp: new Date().toISOString(),
    footer: { text: "Promo Monitor 🚀" },
  };

  return sendWebhook({ embeds: [embed], username: "Promo Monitor 🚀" });
};

export const sendMonitorStarted = async (): Promise<boolean> => {
  const embed = {
    title: "🚀 Monitor Iniciado",
    description:
      "O monitoramento do Telegram foi iniciado com sucesso!\n\n📡 Verificando canais ativos...\n🔍 Modo de captura automática ativado\n💬 Promoções serão enviadas para este canal",
    color: 0x5865F2,
    timestamp: new Date().toISOString(),
    footer: { text: "Promo Monitor 🚀" },
  };

  return sendWebhook({ embeds: [embed], username: "Promo Monitor 🚀" });
};

// ========== FILA DE ENVIO COM RATE LIMIT ==========
// Discord limita a 5 msgs por 2s por webhook.
// Fila garante 1 msg a cada 500ms (2 msg/s), dentro do limite.

class DiscordSendQueue {
  private queue: PromoData[] = [];
  private processing = false;
  private readonly DELAY_MS = 500; // 2 msg/s (seguro para Discord)

  enqueue(data: PromoData): void {
    this.queue.push(data);
    if (!this.processing) this.drain();
  }

  private async drain(): Promise<void> {
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      await sendDiscordPromo(item).catch((err) =>
        logger.error(`[Fila Discord] Erro ao enviar: ${err}`, "Discord")
      );
      if (this.queue.length > 0) {
        await new Promise((r) => setTimeout(r, this.DELAY_MS));
      }
    }
    this.processing = false;
  }

  get pending(): number {
    return this.queue.length;
  }
}

export const discordQueue = new DiscordSendQueue();
