import fs from "fs";
import path from "path";
import { logInfo, logWarn } from "../../shared/utils/logger.js";

export interface StatusSessaoLinkedIn {
  valida: boolean;
  motivo?: string;
  expiraEm?: Date;
  diasRestantes?: number;
}

/**
 * Retorna o caminho absoluto seguro para o arquivo de sessão do LinkedIn
 * Localizado em data/linkedin-session.json (fora do Git)
 */
export function obterCaminhoSessao(): string {
  return path.resolve(process.cwd(), "data", "linkedin-session.json");
}

/**
 * Validação puramente em memória / leitura de disco da sessão salva.
 * NÃO executa nenhuma requisição de rede ou escrita no LinkedIn.
 *
 * @param caminhoArquivo Caminho opcional do storageState (default: data/linkedin-session.json)
 */
export function verificarSessaoSalva(
  caminhoArquivo: string = obterCaminhoSessao(),
): StatusSessaoLinkedIn {
  if (!fs.existsSync(caminhoArquivo)) {
    return {
      valida: false,
      motivo: "Arquivo de sessão não encontrado no disco",
    };
  }

  try {
    const raw = fs.readFileSync(caminhoArquivo, "utf-8");
    const parsed = JSON.parse(raw);

    if (!parsed || !Array.isArray(parsed.cookies)) {
      return {
        valida: false,
        motivo: "Formato inválido de storageState (ausência da lista de cookies)",
      };
    }

    // Busca o cookie canônico de autenticação do LinkedIn (li_at)
    const liAtCookie = parsed.cookies.find(
      (c: any) => c.name === "li_at" && typeof c.value === "string" && c.value.length > 20,
    );

    if (!liAtCookie) {
      return {
        valida: false,
        motivo: "Cookie de sessão 'li_at' não encontrado ou vazio",
      };
    }

    // Validação de expiração temporal se o atributo expires estiver presente
    if (liAtCookie.expires && typeof liAtCookie.expires === "number") {
      // O expires do Playwright é em segundos (POSIX timestamp)
      const expiresMs = liAtCookie.expires > 1e11 ? liAtCookie.expires : liAtCookie.expires * 1000;
      const agoraMs = Date.now();

      if (expiresMs <= agoraMs) {
        return {
          valida: false,
          motivo: `Cookie 'li_at' expirado em ${new Date(expiresMs).toISOString()}`,
          expiraEm: new Date(expiresMs),
          diasRestantes: 0,
        };
      }

      const diasRestantes = Math.floor((expiresMs - agoraMs) / (1000 * 60 * 60 * 24));
      return {
        valida: true,
        expiraEm: new Date(expiresMs),
        diasRestantes,
      };
    }

    // Cookie de sessão sem data explícita de expiração é considerado válido enquanto persistido
    return {
      valida: true,
    };
  } catch (err: any) {
    return {
      valida: false,
      motivo: `Falha ao ler arquivo de sessão: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Avalia múltiplos sinais para confirmar autenticação bem-sucedida durante o fluxo interativo.
 * Não depende unicamente da URL /feed.
 *
 * Sinais combinados:
 * 1. Presença do cookie obrigatório 'li_at' com conteúdo válido.
 * 2. Ausência de URLs de autenticação pendente (/login, /checkpoint, /authwall, /challenge, etc.).
 * 3. URL em rota de usuário autenticado OU presença de cookies de sessão complementar.
 */
export function verificarSinaisAutenticacao(
  cookies: Array<{ name: string; value: string; domain?: string }>,
  currentUrl = "",
): boolean {
  // 1. Sinal obrigatório: cookie li_at válido
  const liAtCookie = cookies.find(
    (c) => c.name === "li_at" && typeof c.value === "string" && c.value.trim().length > 20,
  );
  if (!liAtCookie) {
    return false;
  }

  // 2. Não pode estar em telas de login ou desafio/checkpoint
  const urlLower = currentUrl.toLowerCase();
  const telasBloqueio = [
    "/login",
    "/checkpoint",
    "/uas",
    "/signup",
    "/authwall",
    "/challenge",
    "/cold-join",
    "/ssr-login",
  ];
  if (telasBloqueio.some((tela) => urlLower.includes(tela))) {
    return false;
  }

  // 3. Deve estar dentro do domínio do LinkedIn
  if (!urlLower.includes("linkedin.com")) {
    return false;
  }

  // 4. Se a URL indica área logada típica (/feed, /mynetwork, /jobs, /in/, /messaging, /search)
  const areasAutenticadas = [
    "/feed",
    "/mynetwork",
    "/jobs",
    "/in/",
    "/messaging",
    "/search",
    "/notifications",
  ];
  if (areasAutenticadas.some((area) => urlLower.includes(area))) {
    return true;
  }

  // 5. Fallback por presença de cookies estritamente autenticados (JSESSIONID ou liap)
  const temCookieComplementar = cookies.some(
    (c) => c.name === "JSESSIONID" || c.name === "liap",
  );

  return temCookieComplementar;
}
