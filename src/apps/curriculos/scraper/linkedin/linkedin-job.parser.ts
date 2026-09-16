import crypto from "crypto";
import {
  EMAIL_REGEX,
  EMAIL_IGNORE_DOMAINS,
  GENERIC_EMAIL_DOMAINS,
  EMAIL_INVALID_SUFFIXES,
  KNOWN_TECH_SKILLS,
  POSITIVE_JOB_INDICATORS,
  NEGATIVE_INDICATORS,
} from "./linkedin.constants.js";
import type {
  RawLinkedInPost,
  ParsedScrapedJob,
  JobParserResult,
  ConfidenceCalculation,
} from "./linkedin.types.js";
import type { VagaEmailRaw } from "../../automacao/types.js";

/**
 * Normaliza e limpa texto bruto de publicações
 */
export function normalizarTexto(texto = ""): string {
  return texto
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai e valida e-mails de um texto
 */
export function extrairEmails(texto: string): string[] {
  if (!texto) return [];
  const matches = texto.match(EMAIL_REGEX) || [];
  const validEmails = new Set<string>();

  for (const raw of matches) {
    // Remove pontuações finais indesejadas que grudam no email
    let limpo = raw.trim().replace(/[.,;:!?)\]>'"\\]+$/, "").toLowerCase();

    // Valida formato básico
    if (!limpo.includes("@") || limpo.startsWith("@") || limpo.endsWith("@")) {
      continue;
    }

    const [, domain] = limpo.split("@");
    if (!domain || !domain.includes(".")) continue;

    // Ignora domínios da blacklist
    if (EMAIL_IGNORE_DOMAINS.has(domain.toLowerCase())) {
      continue;
    }

    // Ignora se terminar com extensão de imagem/arquivo
    if (EMAIL_INVALID_SUFFIXES.some((suf) => limpo.endsWith(suf))) {
      continue;
    }

    validEmails.add(limpo);
  }

  return Array.from(validEmails);
}

/**
 * Identifica skills técnicas no texto
 */
export function extrairSkills(texto: string): string[] {
  const norm = texto.toLowerCase();
  const encontradas = new Set<string>();

  for (const [skillNome, aliases] of Object.entries(KNOWN_TECH_SKILLS)) {
    for (const alias of aliases) {
      // Busca por fronteira de palavra
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?:^|[\\s,;:.()/-])${escaped}(?:[\\s,;:.()/-]|$)`, "i");
      if (regex.test(norm)) {
        encontradas.add(skillNome);
        break;
      }
    }
  }

  return Array.from(encontradas);
}

/**
 * Extrai título da vaga com heurísticas semânticas
 */
export function extrairTitulo(texto: string, authorHeadline = ""): string {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // 1. Padrões explícitos por linha no texto original
  const padroesDiretos = [
    /(?:temos\s+vagas?|vagas?|oportunidades?|posi[cç][aã]o)[:\s]+([^\n\r📍|–]+)/i,
    /(?:contrata-se|buscamos|procuramos)[:\s]+([^\n\r📍|–]+)/i,
    /\b((?:Desenvolvedor[a]?|Dev|Programador[a]?|Engenheiro[a]?\s+de\s+Software|Software\s+Engineer|Tech\s+Lead|Frontend|Back-?end|Full\s*Stack|Analista\s+de\s+QA|Arquiteto[a]?\s+de\s+Software)[^\n\r📍|–]*)/i,
  ];

  for (const linha of linhas) {
    for (const reg of padroesDiretos) {
      const m = linha.match(reg);
      if (m && m[1]) {
        let candidato = m[1].replace(/^(?:de|para|um|uma)\s+/i, "").trim();
        candidato = normalizarTexto(candidato);
        if (candidato.length >= 4 && candidato.length <= 80) {
          return candidato;
        }
      }
    }
  }

  // 2. Se o headline do autor indicar recrutamento para vaga específica
  if (authorHeadline) {
    const headlineLimpo = normalizarTexto(authorHeadline);
    const matchHeadline = headlineLimpo.match(/\b((?:Vaga|Buscamos)\s+[^|–-]+)/i);
    if (matchHeadline && matchHeadline[1]) {
      return matchHeadline[1].trim();
    }
  }

  // 3. Fallback inteligente: primeira linha significativa
  for (const linha of linhas) {
    const limpa = normalizarTexto(linha);
    if (limpa.length > 5 && limpa.length <= 80 && !limpa.toLowerCase().startsWith("http") && !/estamos contratando/i.test(limpa)) {
      return limpa;
    }
  }

  return "Oportunidade de Tecnologia";
}

/**
 * Valida se uma URL representa de forma legítima e canônica uma publicação do LinkedIn
 * (NÃO pode ser perfil /in/, company page, busca, feed genérico ou vazia).
 */
export function isCanonicalLinkedInPostUrl(url?: string): boolean {
  if (!url || typeof url !== "string") return false;
  const limpo = url.trim().toLowerCase();

  // Não pode ser perfil de usuário, página de empresa, busca ou feed genérico
  if (
    limpo.includes("/in/") ||
    limpo.includes("/company/") ||
    limpo.includes("/search/") ||
    limpo.includes("/mynetwork/") ||
    limpo.includes("/jobs/") ||
    limpo === "https://www.linkedin.com/feed" ||
    limpo === "https://www.linkedin.com/feed/"
  ) {
    return false;
  }

  // Deve ser URL de postagem: /feed/update/urn:li:activity:... OU /posts/...
  const isActivity = /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/feed\/update\/urn:li:activity:\d+/i.test(limpo);
  const isPosts = /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/posts\/[\w.-]+(?:activity|share|ugcpost)-\d+/i.test(limpo);

  return isActivity || isPosts;
}

/**
 * Normaliza qualquer URL de publicação do LinkedIn para a URL canônica oficial:
 * https://www.linkedin.com/feed/update/urn:li:activity:XXXXXXXXXXXXXXX/
 * Retorna null se não for uma publicação válida.
 */
export function normalizarParaCanonicalPostUrl(url?: string): string | null {
  if (!url || typeof url !== "string") return null;
  const limpo = url.split("?")[0].split("#")[0].replace(/\/+$/, "").trim();

  if (!isCanonicalLinkedInPostUrl(limpo)) {
    return null;
  }

  // Se for /feed/update/urn:li:activity:XXXXX
  const matchActivity = limpo.match(/urn:li:activity:(\d+)/i);
  if (matchActivity && matchActivity[1]) {
    return `https://www.linkedin.com/feed/update/urn:li:activity:${matchActivity[1]}/`;
  }

  // Se for /posts/slug-(activity|share|ugcPost)-XXXXX
  const matchPost = limpo.match(/(?:activity|share|ugcpost)-(\d+)/i);
  if (matchPost && matchPost[1]) {
    return `https://www.linkedin.com/feed/update/urn:li:activity:${matchPost[1]}/`;
  }

  if (/^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/posts\/[\w.-]+/i.test(limpo)) {
    return `${limpo}/`;
  }

  return null;
}

/**
 * Extrai nome da empresa do post, headline, e-mail corporativo ou metadados
 */
export function extrairEmpresa(
  texto: string,
  authorName = "",
  companyName = "",
  authorHeadline = "",
  contactEmail = "",
): string {
  // 1. Empresa oficial identificada por link de company no LinkedIn
  if (companyName && companyName.trim()) {
    return companyName.trim();
  }

  const limpo = normalizarTexto(texto);

  // 2. Headline do autor (ex: "Tech Recruiter na Tessa Talent", "HR at Pasquali Solution")
  if (authorHeadline) {
    const mHead = authorHeadline.match(/\b(?:na|no|at|em|@)\s+([A-ZÀ-Ú0-9][A-Za-zÀ-Ú0-9\s&-]{2,35}?)(?=[.,|–\n]|$)/i);
    if (mHead && mHead[1]) {
      const emp = mHead[1].trim().replace(/\s*\|.*$/, "");
      if (!emp.toLowerCase().includes("vaga") && !emp.toLowerCase().includes("consultor")) {
        return emp;
      }
    }
  }

  // 3. Padrões explícitos no texto da vaga
  const padroesEmpresa = [
    /\b(?:empresa|cliente|contratante)[:\s]+([A-ZÀ-Ú0-9][A-Za-zÀ-Ú0-9\s&-]{2,35}?)(?=[.,\n]|$)/i,
    /\b(?:para\s+atuar\s+na|trabalhar\s+na|junte-se\s+[aà]\s+(?:equipe\s+da\s+)?)\s*([A-ZÀ-Ú0-9][A-Za-zÀ-Ú0-9\s&-]{2,35}?)(?=[.,\n]|$)/i,
  ];

  for (const p of padroesEmpresa) {
    const m = limpo.match(p);
    if (m && m[1]) {
      let emp = m[1].trim().replace(/\s+(?:como|no\s+cargo|na\s+posi[cç][aã]o|para|de)\b.*$/i, "").trim();
      if (emp.length >= 2 && !emp.toLowerCase().includes("vaga") && !emp.toLowerCase().includes("oportunidade")) {
        return emp;
      }
    }
  }

  // 4. Domínio corporativo de e-mail (ex: geane.barros@tessatalent.com -> "Tessatalent")
  if (contactEmail && contactEmail.includes("@")) {
    const domain = contactEmail.split("@")[1]?.toLowerCase().trim();
    if (domain && !GENERIC_EMAIL_DOMAINS.has(domain)) {
      const baseName = domain.split(".")[0];
      if (baseName && baseName.length >= 3) {
        const formatada = baseName.charAt(0).toUpperCase() + baseName.slice(1);
        return formatada;
      }
    }
  }

  // 5. Nome do autor (quando autor é recruiter pessoa física)
  if (authorName && authorName.trim()) {
    return authorName.trim();
  }

  return "Empresa Confidencial";
}

/**
 * Extrai tópicos ou lista de requisitos do texto
 */
export function extrairRequisitos(texto: string): string[] {
  const linhas = texto.split(/\n+/);
  const requisitos: string[] = [];

  for (const linha of linhas) {
    const trim = linha.trim();
    // Identifica marcadores de lista: •, -, *, 1., etc.
    if (/^([•*\-–—]|(?:\d+\.))\s+/.test(trim)) {
      const item = trim.replace(/^([•*\-–—]|(?:\d+\.))\s+/, "").trim();
      if (item.length > 3 && item.length < 180) {
        requisitos.push(item);
      }
    }
  }

  // Se não encontrou bullet points, tenta pegar frases curtas que contenham "experiência" ou "conhecimento"
  if (requisitos.length === 0) {
    const frases = texto.split(/[.;]+/);
    for (const frase of frases) {
      const fTrim = frase.trim();
      if (
        /\b(?:experi[eê]ncia|conhecimento|dom[ií]nio|viv[eê]ncia)\b/i.test(fTrim) &&
        fTrim.length > 10 &&
        fTrim.length < 150
      ) {
        requisitos.push(fTrim);
      }
    }
  }

  return requisitos.slice(0, 8);
}

/**
 * Calcula o Confidence Score com detalhamento dos motivos para depuração e calibração.
 * Teto estrito: 1.00 (100%) - a soma dos pesos pode ultrapassar 1.0 internamente,
 * mas o resultado final é rigorosamente clampado no teto 1.00 e no piso 0.00.
 */
export function calcularConfidence(
  texto: string,
  hasEmail: boolean,
  skillsCount: number,
): ConfidenceCalculation {
  let score = 0.0;
  const reasons: string[] = [];

  // 1. Indicadores positivos
  for (const ind of POSITIVE_JOB_INDICATORS) {
    if (ind.pattern.test(texto)) {
      score += ind.weight;
      reasons.push(`+${ind.weight.toFixed(2)} ${ind.label}`);
    }
  }

  // 2. Presença de e-mail de contato válido
  if (hasEmail) {
    score += 0.20;
    reasons.push(`+0.20 Contém e-mail de contato válido no texto`);
  }

  // 3. Bônus por identificação de tecnologias (até +0.15)
  if (skillsCount > 0) {
    const bonus = Math.min(skillsCount * 0.05, 0.15);
    score += bonus;
    reasons.push(`+${bonus.toFixed(2)} ${skillsCount} skill(s) técnica(s) identificada(s)`);
  }

  // 4. Indicadores negativos (penalidades severas para evitar ruído)
  for (const neg of NEGATIVE_INDICATORS) {
    if (neg.pattern.test(texto)) {
      score -= neg.penalty;
      reasons.push(`-${neg.penalty.toFixed(2)} [PENALIDADE] ${neg.label}`);
    }
  }

  // Normalização do score entre 0.0 e 1.0
  const finalScore = Math.max(0.0, Math.min(1.0, Math.round(score * 100) / 100));

  return {
    score: finalScore,
    reasons,
  };
}

/**
 * Parseia um post bruto do LinkedIn para o modelo estruturado de vaga
 */
export function parsePostParaVaga(
  post: RawLinkedInPost,
  minConfidence = 0.65,
): JobParserResult {
  const texto = post.text || "";

  // 1. Extração de e-mails
  const emails = extrairEmails(texto);
  if (emails.length === 0) {
    const confSemEmail = calcularConfidence(texto, false, 0);
    return {
      isJob: false,
      job: null,
      discardReason: "SEM_EMAIL_NO_POST",
      confidenceScore: confSemEmail.score,
      confidenceReasons: confSemEmail.reasons,
    };
  }

  // 2. Validação obrigatória da sourceUrl canônica da publicação
  const canonicalPostUrl = normalizarParaCanonicalPostUrl(post.url);
  if (!canonicalPostUrl) {
    const confSemUrl = calcularConfidence(texto, true, 0);
    return {
      isJob: false,
      job: null,
      discardReason: "SEM_URL_CANONICA_PUBLICACAO",
      confidenceScore: confSemUrl.score,
      confidenceReasons: confSemUrl.reasons,
    };
  }

  // 3. Extração de Skills
  const skills = extrairSkills(texto);

  // 4. Cálculo de confiança
  const confidence = calcularConfidence(texto, true, skills.length);

  // 5. Avaliação contra o limiar mínimo configurado
  if (confidence.score < minConfidence) {
    return {
      isJob: false,
      job: null,
      discardReason: `CONFIDENCE_INSUFICIENTE (${confidence.score} < ${minConfidence})`,
      confidenceScore: confidence.score,
      confidenceReasons: confidence.reasons,
    };
  }

  // 6. Montagem dos dados da vaga
  const title = extrairTitulo(texto, post.authorHeadline);
  const contactEmail = emails[0];
  const company = extrairEmpresa(
    texto,
    post.authorName,
    post.companyName,
    post.authorHeadline,
    contactEmail,
  );
  const requirements = extrairRequisitos(texto);
  const sourceUrl = canonicalPostUrl;

  // Criação de id estável
  const idSlug = (title + "-" + company)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 40);

  const hashId = crypto
    .createHash("sha256")
    .update((sourceUrl || texto) + contactEmail)
    .digest("hex")
    .substring(0, 8);

  const jobId = `${idSlug}-${hashId}`;

  // Extrair localização básica se houver menção
  let location: string | undefined = undefined;
  const locMatch = texto.match(/📍\s*([^\n\r.]+)/);
  if (locMatch) {
    location = locMatch[1].trim();
  } else if (/remoto/i.test(texto)) {
    location = "Remoto";
  } else if (/h[ií]brido/i.test(texto)) {
    location = "Híbrido";
  }

  const parsedJob: ParsedScrapedJob = {
    id: jobId,
    title,
    company,
    contactEmail,
    description: normalizarTexto(texto),
    requirements,
    skills,
    sourceUrl,
    location,
    postedAt: post.publishedAt || new Date().toISOString(),
    confidenceScore: confidence.score,
    confidenceReasons: confidence.reasons,
    rawText: texto, // Exposto temporariamente para depuração na Fase 1
  };

  return {
    isJob: true,
    job: parsedJob,
    confidenceScore: confidence.score,
    confidenceReasons: confidence.reasons,
  };
}

/**
 * Normaliza URL do post no LinkedIn, removendo query params e barras extras
 */
export function normalizarUrlPost(url: string): string {
  if (!url) return "";
  try {
    const semQuery = url.split("?")[0].split("#")[0].trim();
    return semQuery.replace(/\/+$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Normaliza texto eliminando variações pontuais (emojis, pontuação, acentos, espaços extras)
 * para comparação robusta na deduplicação
 */
export function normalizarTextoParaDeduplicacao(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos / diacríticos
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // remove pontuações, símbolos e emojis
    .replace(/\s+/g, " ")            // unifica espaços múltiplos
    .trim();
}

/**
 * Deduplica lista de vagas usando chave primária (postUrl canônica) e secundária (hash texto + email)
 */
export function deduplicarVagas(vagas: ParsedScrapedJob[]): ParsedScrapedJob[] {
  const vistosUrls = new Set<string>();
  const vistosHashes = new Set<string>();
  const unicas: ParsedScrapedJob[] = [];

  for (const v of vagas) {
    // 1. Chave primária: postUrl canônica sem query params de tracking
    if (v.sourceUrl && v.sourceUrl.trim()) {
      const urlCanonica = normalizarUrlPost(v.sourceUrl);
      if (urlCanonica) {
        if (vistosUrls.has(urlCanonica)) {
          continue;
        }
        vistosUrls.add(urlCanonica);
      }
    }

    // 2. Chave secundária: hash do texto normalizado (sem acentos/emojis) + e-mail
    const textoLimpo = normalizarTextoParaDeduplicacao(v.description);
    const fallbackKey = crypto
      .createHash("sha256")
      .update(`${textoLimpo}|${v.contactEmail.toLowerCase().trim()}`)
      .digest("hex");

    if (vistosHashes.has(fallbackKey)) {
      continue;
    }
    vistosHashes.add(fallbackKey);

    unicas.push(v);
  }

  return unicas;
}

/**
 * Converte ParsedScrapedJob para o contrato oficial VagaEmailRaw
 * Remove campos internos de depuração (rawText, confidenceScore, confidenceReasons)
 */
export function exportarParaVagasEmailFormat(vagas: ParsedScrapedJob[]): VagaEmailRaw[] {
  return vagas.map((v) => ({
    id: v.id,
    title: v.title,
    company: v.company,
    location: v.location || "Não especificado",
    sourceUrl: v.sourceUrl,
    description: v.description,
    requirements: v.requirements,
    skills: v.skills,
    contactEmail: v.contactEmail,
    postedAt: v.postedAt,
  }));
}
