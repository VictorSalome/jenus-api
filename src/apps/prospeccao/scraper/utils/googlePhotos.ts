import type { FotoMeta } from "../../types.js";

export const HD_RESOLUTION_SUFFIX = "=w1200-h800-k-no";

/**
 * Avalia o padrão da URL e retorna o nível de confiança ("alta" ou "media").
 * Retorna null se a URL contiver qualquer indicador de avatar, ícone, selo ou lixo visual.
 */
export function calcularConfiancaFoto(url: string): "alta" | "media" | null {
  if (!url || typeof url !== "string") return null;

  const cleanUrl = url.trim();
  if (!cleanUrl.startsWith("http")) return null;

  // Descartar expressamente ícones de interface, selos do Google e tiles
  if (
    cleanUrl.includes("gstatic.com") ||
    cleanUrl.includes("maps/vt") ||
    cleanUrl.includes("default_avatar") ||
    cleanUrl.includes("avatar") ||
    cleanUrl.includes("silhouette") ||
    cleanUrl.includes(".svg") ||
    /\/a\/|\/a-\//.test(cleanUrl) // Avatares de revisores no Google
  ) {
    return null;
  }

  const isGoogleHost =
    /googleusercontent\.com|ggpht\.com|streetviewpixels-pa\.googleapis\.com/i.test(cleanUrl);

  if (!isGoogleHost) {
    return null;
  }

  // Padrões consolidados de alta confiança para fotos de estabelecimentos
  if (
    cleanUrl.includes("/p/") ||
    cleanUrl.includes("/gps-cs-s/") ||
    cleanUrl.includes("streetviewpixels-pa.googleapis.com")
  ) {
    return "alta";
  }

  // Outros endpoints de imagem do Google CDN são aceitos com confiança média se no contexto correto
  return "media";
}

export function normalizarFotoGoogle(url: string, dimensao: string = HD_RESOLUTION_SUFFIX): string {
  const confianca = calcularConfiancaFoto(url);
  if (!confianca) return "";

  const cleanUrl = url.trim();

  if (cleanUrl.includes("streetviewpixels-pa.googleapis.com")) {
    try {
      const parsed = new URL(cleanUrl);
      parsed.searchParams.set("w", "1200");
      parsed.searchParams.set("h", "800");
      return parsed.toString();
    } catch {
      return cleanUrl;
    }
  }

  if (cleanUrl.includes("=")) {
    const baseUrl = cleanUrl.split("=")[0];
    return `${baseUrl}${dimensao}`;
  }

  return `${cleanUrl}${dimensao}`;
}

export function normalizarListaFotosComMeta(
  itens: Array<{
    url: string | null | undefined;
    width?: number;
    height?: number;
    source?: "capa" | "galeria" | "streetview" | "painel";
  }>,
  max: number = 8
): FotoMeta[] {
  const result: FotoMeta[] = [];
  const seen = new Set<string>();

  for (const item of itens) {
    if (!item?.url) continue;
    const confianca = calcularConfiancaFoto(item.url);
    if (!confianca) continue;

    const normalizedUrl = normalizarFotoGoogle(item.url);
    if (!normalizedUrl) continue;

    const baseKey = normalizedUrl.split("=")[0];
    if (!seen.has(baseKey)) {
      seen.add(baseKey);
      result.push({
        url: normalizedUrl,
        width: item.width || 1200,
        height: item.height || 800,
        source: item.source || "painel",
        confianca,
      });
    }

    if (result.length >= max) break;
  }

  return result;
}

export function normalizarListaFotos(
  urls: (string | null | undefined)[],
  max: number = 8
): string[] {
  const comMeta = normalizarListaFotosComMeta(
    urls.map((u) => ({ url: u })),
    max
  );
  return comMeta.map((m) => m.url);
}
