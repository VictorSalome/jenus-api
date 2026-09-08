export const HD_RESOLUTION_SUFFIX = "=w1200-h800-k-no";

export function normalizarFotoGoogle(url: string, dimensao: string = HD_RESOLUTION_SUFFIX): string {
  if (!url || typeof url !== "string") return "";

  const cleanUrl = url.trim();
  if (!cleanUrl.startsWith("http")) return "";

  // Descartar tiles de mapa, avatares de reviews e ícones
  if (
    cleanUrl.includes("maps/vt") ||
    cleanUrl.includes("default_avatar") ||
    cleanUrl.includes("avatar") ||
    cleanUrl.includes("silhouette") ||
    cleanUrl.endsWith(".svg")
  ) {
    return "";
  }

  const isGoogleHost =
    /googleusercontent\.com|ggpht\.com|streetviewpixels-pa\.googleapis\.com/i.test(cleanUrl);

  if (!isGoogleHost) {
    return cleanUrl;
  }

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

export function normalizarListaFotos(
  urls: (string | null | undefined)[],
  max: number = 8
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of urls) {
    if (!raw) continue;
    const normalized = normalizarFotoGoogle(raw);
    if (!normalized) continue;

    const baseKey = normalized.split("=")[0];
    if (!seen.has(baseKey)) {
      seen.add(baseKey);
      result.push(normalized);
    }

    if (result.length >= max) break;
  }

  return result;
}
