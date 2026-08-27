import { logInfo, logError } from "../shared/utils/logger.js";

export interface VagaLinkedIn {
  titulo: string;
  empresa: string;
  descricao: string;
  emails: string[];
  links: string[];
  localizacao: string;
  modalidade: string;
  fonte: string;
}

/**
 * Parseia HTML do LinkedIn para extrair vagas com email
 * O HTML deve ser salvo pelo usuário (copy/paste da página de busca)
 *
 * @param {string} html - HTML da página LinkedIn
 * @returns {Object[]} Vagas extraídas
 */
export const parsearLinkedInHTML = (html: string): VagaLinkedIn[] => {
  logInfo("Parseando HTML do LinkedIn...");

  const vagas: VagaLinkedIn[] = [];

  // Extrair blocos de post (cada vaga é um post)
  const postRegex =
    /<span[^>]*data-testid="expandable-text-box"[^>]*>([\s\S]*?)<\/span>/gi;
  let match;

  while ((match = postRegex.exec(html)) !== null) {
    const conteudo = match[1];
    const vaga = extrairVagaDoConteudo(conteudo);
    if (vaga) vagas.push(vaga);
  }

  // Fallback: extrair emails e links de todo o HTML
  if (vagas.length === 0) {
    const emails = extrairEmails(html);
    const links = extrairLinksVagas(html);
    const titulos = extrairTitulosVagas(html);

    if (emails.length > 0 || titulos.length > 0) {
      vagas.push({
        titulo: titulos[0] || "Vaga do LinkedIn",
        empresa: "",
        descricao: limparHTML(html.substring(0, 500)),
        emails,
        links,
        localizacao: "",
        modalidade: "",
        fonte: "linkedin",
      });
    }
  }

  logInfo(`LinkedIn: ${vagas.length} vagas extraídas`);
  return vagas;
};

/**
 * Extrai dados de uma vaga do conteúdo HTML de um post
 */
function extrairVagaDoConteudo(html: string): VagaLinkedIn | null {
  const texto = limparHTML(html);

  // Extrair email
  const emails = extrairEmails(html);
  if (emails.length === 0) return null;

  // Extrair título da vaga
  const tituloMatch = texto.match(
    /(?:TEMOS VAGA|VAGA|Vaga)[:\s]*(.*?)(?:\n|<br|$)/i,
  );
  const titulo = tituloMatch
    ? tituloMatch[1].trim()
    : extrairTituloGenerico(texto);

  // Extrair empresa
  const empresaMatch = texto.match(/empresa\s+(?:de\s+)?(.*?)(?:\n|\.|$)/i);
  const empresa = empresaMatch ? empresaMatch[1].trim() : "";

  // Extrair localização
  const localMatch = texto.match(/📍\s*(.*?)(?:\n|<br|$)/);
  const localizacao = localMatch ? localMatch[1].trim() : "";

  // Extrair modalidade
  let modalidade = "";
  if (texto.toLowerCase().includes("remoto")) modalidade = "Remoto";
  else if (
    texto.toLowerCase().includes("híbrido") ||
    texto.toLowerCase().includes("hibrido")
  )
    modalidade = "Híbrido";
  else if (texto.toLowerCase().includes("presencial"))
    modalidade = "Presencial";

  // Extrair links
  const links = extrairLinksVagas(html);

  return {
    titulo,
    empresa,
    descricao: texto,
    emails,
    links,
    localizacao,
    modalidade,
    fonte: "linkedin",
  };
}

function extrairTituloGenerico(texto: string): string {
  const match = texto.match(
    /(?:Desenvolvedor|Engineer|Developer|Analista|Programador)\s+[\w\s]+/i,
  );
  return match ? match[0].trim().substring(0, 80) : "Vaga";
}

function extrairEmails(html: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = [...new Set(html.match(emailRegex) || [])];
  return emails.filter(
    (e) => !e.endsWith("linkedin.com") && !e.endsWith("sentry.io"),
  );
}

function extrairLinksVagas(html: string): string[] {
  const linkRegex =
    /href="(https?:\/\/[^"]*(?:linkedin\.com|lnkd\.in|jobs?)[^"]*)"/gi;
  const links: string[] = [];
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    links.push(m[1]);
  }
  return [...new Set(links)];
}

function extrairTitulosVagas(html: string): string[] {
  const titulos: string[] = [];
  const regex =
    /(?:Desenvolvedor|Engineer|Developer|Analista|Programador|Full Stack|Frontend|Backend|React|Node|Java|Python|\.NET|C#)[\w\s.,()-]{5,60}/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    titulos.push(m[0].trim());
  }
  return [...new Set(titulos)].slice(0, 5);
}

function limparHTML(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export interface VagaNormalizada {
  source: string;
  externalId: string;
  title: string;
  company: string;
  description: string;
  url: string;
  location: string;
  salary: string;
  tags: string[];
  postedAt: string;
  type: string;
  _emails: string[];
}

/**
 * Converte vagas do LinkedIn para o formato normalizado do sistema
 */
export const normalizarVagasLinkedIn = (vagas: VagaLinkedIn[]): VagaNormalizada[] => {
  return vagas.map((v) => ({
    source: "linkedin",
    externalId: `linkedin-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    title: v.titulo,
    company: v.empresa,
    description: v.descricao,
    url: v.links[0] || "",
    location: v.localizacao,
    salary: "",
    tags: [],
    postedAt: new Date().toISOString(),
    type: v.modalidade || "",
    _emails: v.emails,
  }));
};