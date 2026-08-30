/**
 * Parser nativo de descrição de vaga
 * Extrai informações estruturadas de texto livre usando regex e heurísticas
 * Sem dependência de IA
 */

const SKILL_CATEGORIES: Record<string, string[]> = {
  frontend: ['react', 'react native', 'reactjs', 'react.js', 'vue', 'vuejs', 'vue.js', 'angular', 'svelte', 'html', 'css', 'sass', 'tailwind', 'bootstrap', 'typescript', 'javascript', 'js', 'ts', 'next', 'nextjs', 'next.js', 'remix'],
  backend: ['node', 'nodejs', 'node.js', 'express', 'nest', 'nestjs', 'fastify', 'python', 'django', 'flask', 'fastapi', 'java', 'spring', 'spring boot', 'go', 'golang', 'rust', 'c#', 'csharp', '.net', 'dotnet', 'asp.net', 'php', 'laravel', 'symfony', 'ruby', 'rails'],
  database: ['sql', 'postgresql', 'postgres', 'mysql', 'sqlite', 'mongodb', 'redis', 'prisma', 'typeorm', 'sequelize'],
  devops: ['docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp', 'cloud', 'ci/cd', 'github actions', 'gitlab ci', 'jenkins', 'terraform'],
  mobile: ['ios', 'android', 'swift', 'kotlin', 'flutter', 'react native'],
  testing: ['jest', 'vitest', 'testing library', 'cypress', 'playwright'],
  architecture: ['microservices', 'clean architecture', 'ddd', 'hexagonal', 'event driven', 'graphql', 'rest', 'api']
};

const TECH_KEYWORDS: string[] = Object.values(SKILL_CATEGORIES).flat();

// Precompile regexes once at module load (performance)
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TECH_REGEXES: { tech: string; regex: RegExp }[] = TECH_KEYWORDS.map(tech => ({
  tech,
  regex: new RegExp(`\\b${escapeRegex(tech)}\\b`, 'i')
}));

const SENIORITY_KEYWORDS: Record<string, string[]> = {
  'estagiário': ['estagiário', 'estagio', 'intern', 'internship'],
  'júnior': ['júnior', 'junior', 'jr', 'entry level', 'entry-level'],
  'pleno': ['pleno', 'mid', 'mid level', 'mid-level'],
  'sênior': ['sênior', 'senior', 'sr', 'senior level', 'senior-level'],
  'lead': ['lead', 'tech lead', 'technical lead'],
  'arquiteto': ['arquiteto', 'architect', 'architecture']
};

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[📢💎🔥⚡🚀✨🎯📌📝]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(text: string): string | null {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Procura padrão explícito: "vaga: ..." ou "📢 vaga ..."
  for (const line of lines) {
    const cleanLine = line.replace(/[📢💎]/g, '').trim();

    if (cleanLine.match(/^vaga\s*[:\-]\s*/i) || cleanLine.match(/^📢\s*vaga/i)) {
      return cleanLine
        .replace(/^📢\s*/i, '')
        .replace(/^vaga\s*[:\-]\s*/i, '')
        .replace(/📢.*$/, '')
        .trim();
    }
  }

  // 2. Fallback: primeira linha curta (< 80 chars) que não seja seção
  const sectionHeaders = /^(requisitos|requerimentos|responsabilidades|atribuições|qualificações|diferenciais|benefícios|oferecemos|temos:|soft skills|hard skills)/i;
  for (const line of lines) {
    const cleanLine = line.replace(/[📢💎]/g, '').trim();
    if (cleanLine.length > 0 && cleanLine.length < 80 && !sectionHeaders.test(cleanLine)) {
      return cleanLine;
    }
  }

  return null;
}

function extractCompany(title: string): string | null {
  if (!title) return null;
  
  const match = title.match(/\s*-\s*([A-Z][A-Z0-9\s&.-]+)$/);
  if (match) {
    return match[1].trim();
  }
  
  const match2 = title.match(/\s*@\s*([A-Z][A-Z0-9\s&.-]+)$/);
  if (match2) {
    return match2[1].trim();
  }
  
  return null;
}

function extractSeniority(text: string): string | null {
  const normalized = normalizeText(text);
  
  for (const [level, keywords] of Object.entries(SENIORITY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        return level.charAt(0).toUpperCase() + level.slice(1);
      }
    }
  }
  
  return null;
}

function extractSkills(text: string): string[] {
  const normalized = normalizeText(text);
  const found = new Set<string>();
  
  for (const { tech, regex } of TECH_REGEXES) {
    if (regex.test(normalized)) {
      found.add(tech.charAt(0).toUpperCase() + tech.slice(1));
    }
  }
  
  return Array.from(found).sort();
}

function extractSection(text: string, sectionKeywords: string[]): string[] | null {
  const lines = text.split('\n');
  const results: string[] = [];
  let inSection = false;
  
  for (const line of lines) {
    const cleanLine = line.trim();
    const lowerLine = cleanLine.toLowerCase();
    
    const isSectionStart = sectionKeywords.some(kw => lowerLine.includes(kw.toLowerCase()));
    
    if (isSectionStart && !inSection) {
      inSection = true;
      continue;
    }
    
    if (inSection) {
      if (cleanLine.match(/^[📢💎]/) || cleanLine.match(/^[A-Z][A-Z\s]+:/)) {
        break;
      }
      
      const bulletMatch = cleanLine.match(/^[-•*]\s*(.+)/);
      if (bulletMatch) {
        results.push(bulletMatch[1].trim());
      } else if (cleanLine && !cleanLine.match(/^(requisitos|requerimentos|responsabilidades|atribuições|qualificações|diferenciais|benefícios|oferecemos|oferecemos:|temos:)/i)) {
        results.push(cleanLine);
      }
    }
  }
  
  return results.length > 0 ? results : null;
}

function extractRequirements(text: string): string[] | null {
  return extractSection(text, [
    'requisitos', 'requerimentos', 'qualificações', 'qualificacoes',
    'requisitos obrigatórios', 'requisitos mandatórios',
    'exigências', 'exigencias', 'skills', 'competências', 'competencias'
  ]);
}

function extractResponsibilities(text: string): string[] | null {
  return extractSection(text, [
    'responsabilidades', 'atribuições', 'atribuicoes',
    'atividades', 'escopo', 'o que você vai fazer', 'o que voce vai fazer',
    'suas responsabilidades', 'day to day', 'day-to-day'
  ]);
}

function extractSalary(text: string): string | null {
  const patterns = [
    /R\$\s*[\d.,]+\s*(?:a|até|-)\s*R\$\s*[\d.,]+/i,
    /R\$\s*[\d.,]+/i,
    /sal[aá]rio\s*(?:de\s*)?R?\$?\s*[\d.,]+/i,
    /a combinar/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

function extractLocation(text: string): { remoto: boolean; hibrido: boolean; cities: string[] } {
  const remoto = /remoto|home.?office|trabalho.?remoto|anywhere/i.test(text);
  const hibrido = /h[ií]brido|flex[ií]vel/i.test(text);
  const cities = text.match(/S[ãa]o Paulo|Rio de Janeiro|Belo Horizonte|Bras[ií]lia|Porto Alegre|Curitiba|Recife|Fortaleza|Salvador|Florian[oó]polis/gi);
  return { remoto, hibrido, cities: cities || [] };
}

function extractContractType(text: string): string | null {
  if (/CLT/i.test(text)) return 'CLT';
  if (/PJ|pessoa.jur[ií]dica/i.test(text)) return 'PJ';
  if (/est[aá]gio/i.test(text)) return 'Estágio';
  if (/freelancer|freela/i.test(text)) return 'Freelancer';
  return null;
}

function extractBenefits(text: string): string[] | null {
  const normalized = normalizeText(text);
  const benefits: string[] = [];
  const keywords = [
    'vr', 'va', 'vale refeição', 'vale alimentação',
    'plano saúde', 'plano odontológico',
    'gympass', 'wellhub', 'day off',
    'auxílio creche', 'seguro vida', 'previdência',
    'bolsa estudos', 'certificação', 'inglês',
    'home office', 'notebook', 'equipamentos'
  ];
  for (const k of keywords) {
    if (normalized.includes(k)) benefits.push(k);
  }
  return benefits.length ? benefits : null;
}

function extractContactEmail(text: string): string | null {
  const patterns = [
    // Padrões contextuais (palavras-chave antes do email)
    /(?:envie|mande|encaminhe|curr[ií]culo\s*para|CV\s*para|contato|envio)[:\s]*([\w.+-]+@[\w-]+\.[\w.-]+)/i,
    /email[\s:]*([\w.+-]+@[\w-]+\.[\w.-]+)/i,
    // Fallback genérico: captura qualquer email @dominio.com no texto
    // (colocado por último para não sobrepor os contextuais mais precisos)
    /([\w.+-]+@[\w-]+\.[\w.-]+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1] || m[0];
  }
  return null;
}

function categorizeSkills(skills: string[]): Record<string, string[]> {
  const categorized: Record<string, string[]> = {};
  for (const skill of skills) {
    const lowerSkill = skill.toLowerCase();
    for (const [cat, list] of Object.entries(SKILL_CATEGORIES)) {
      if (list.some(s => s.toLowerCase() === lowerSkill)) {
        if (!categorized[cat]) categorized[cat] = [];
        categorized[cat].push(skill);
        break;
      }
    }
  }
  return categorized;
}

export function detectarExigenciaPretensao(texto: string): boolean {
  if (!texto || typeof texto !== 'string') return false;
  const normalized = normalizeText(texto);
  const positivePatterns = [
    /pretensao salarial/i,
    /pretensao em salario/i,
    /pretensao de salario/i,
    /quanto pretende/i,
    /qual sua pretensao/i,
    /informar pretensao/i,
    /informe sua pretensao/i,
    /enviar pretensao/i,
    /expectativa salarial/i,
    /qual a expectativa/i,
    /pretensao salarial no corpo/i,
    /pretensao salarial no email/i,
  ];
  const negativePatterns = [
    /sem pretensao/i,
    /nao e necessario pretensao/i,
    /nao precisa informar pretensao/i,
  ];

  for (const neg of negativePatterns) {
    if (neg.test(normalized)) return false;
  }

  for (const pos of positivePatterns) {
    if (pos.test(normalized)) return true;
  }

  return false;
}

export interface ParsedVaga {
  title: string | null;
  company: string | null;
  seniority: string | null;
  skills: string[] | null;
  requirements: string[] | null;
  responsibilities: string[] | null;
  salary: string | null;
  location: { remoto: boolean; hibrido: boolean; cities: string[] };
  contractType: string | null;
  benefits: string[] | null;
  contactEmail: string | null;
  categorizedSkills: Record<string, string[]>;
  rawDescription: string;
  exigePretensaoSalarial: boolean;
}

/**
 * Parseia uma descrição de vaga e retorna dados estruturados
 * @param {string} texto - Texto da vaga
 * @returns {ParsedVaga | null} Dados estruturados da vaga ou null se inválido
 */
export function parseVaga(texto: string): ParsedVaga | null {
  if (!texto || typeof texto !== 'string') {
    return null;
  }
  
  const rawDescription = texto;
  const title = extractTitle(texto);
  const company = extractCompany(title || '');
  const seniority = extractSeniority(texto);
  const skills = extractSkills(texto);
  const requirements = extractRequirements(texto);
  const responsibilities = extractResponsibilities(texto);
  const salary = extractSalary(texto);
  const location = extractLocation(texto);
  const contractType = extractContractType(texto);
  const benefits = extractBenefits(texto);
  const contactEmail = extractContactEmail(texto);
  const categorizedSkills = categorizeSkills(skills);
  const exigePretensaoSalarial = detectarExigenciaPretensao(texto);
  
  return {
    title: title || null,
    company: company || null,
    seniority: seniority || null,
    skills: skills.length > 0 ? skills : null,
    requirements: requirements || null,
    responsibilities: responsibilities || null,
    salary,
    location,
    contractType,
    benefits,
    contactEmail,
    categorizedSkills,
    rawDescription,
    exigePretensaoSalarial
  };
}