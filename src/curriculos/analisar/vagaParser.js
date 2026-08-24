/**
 * Parser nativo de descrição de vaga
 * Extrai informações estruturadas de texto livre usando regex e heurísticas
 * Sem dependência de IA
 */

const SKILL_CATEGORIES = {
  frontend: ['react', 'react native', 'reactjs', 'react.js', 'vue', 'vuejs', 'vue.js', 'angular', 'svelte', 'html', 'css', 'sass', 'tailwind', 'bootstrap', 'typescript', 'javascript', 'js', 'ts', 'next', 'nextjs', 'next.js', 'remix'],
  backend: ['node', 'nodejs', 'node.js', 'express', 'nest', 'nestjs', 'fastify', 'python', 'django', 'flask', 'fastapi', 'java', 'spring', 'spring boot', 'go', 'golang', 'rust', 'c#', 'csharp', '.net', 'dotnet', 'asp.net', 'php', 'laravel', 'symfony', 'ruby', 'rails'],
  database: ['sql', 'postgresql', 'postgres', 'mysql', 'sqlite', 'mongodb', 'redis', 'prisma', 'typeorm', 'sequelize'],
  devops: ['docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp', 'cloud', 'ci/cd', 'github actions', 'gitlab ci', 'jenkins', 'terraform'],
  mobile: ['ios', 'android', 'swift', 'kotlin', 'flutter', 'react native'],
  testing: ['jest', 'vitest', 'testing library', 'cypress', 'playwright'],
  architecture: ['microservices', 'clean architecture', 'ddd', 'hexagonal', 'event driven', 'graphql', 'rest', 'api']
};

const TECH_KEYWORDS = Object.values(SKILL_CATEGORIES).flat();

// Precompile regexes once at module load (performance)
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TECH_REGEXES = TECH_KEYWORDS.map(tech => ({
  tech,
  regex: new RegExp(`\\b${escapeRegex(tech)}\\b`, 'i')
}));

const SENIORITY_KEYWORDS = {
  'estagiário': ['estagiário', 'estagio', 'intern', 'internship'],
  'júnior': ['júnior', 'junior', 'jr', 'entry level', 'entry-level'],
  'pleno': ['pleno', 'mid', 'mid level', 'mid-level'],
  'sênior': ['sênior', 'senior', 'sr', 'senior level', 'senior-level'],
  'lead': ['lead', 'tech lead', 'technical lead'],
  'arquiteto': ['arquiteto', 'architect', 'architecture']
};

function normalizeText(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[📢💎🔥⚡🚀✨🎯📌📝]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

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

  return null;
}

function extractCompany(title) {
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

function extractSeniority(text) {
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

function extractSkills(text) {
  const normalized = normalizeText(text);
  const found = new Set();
  
  for (const { tech, regex } of TECH_REGEXES) {
    if (regex.test(normalized)) {
      found.add(tech.charAt(0).toUpperCase() + tech.slice(1));
    }
  }
  
  return Array.from(found).sort();
}

function extractSection(text, sectionKeywords) {
  const lines = text.split('\n');
  const results = [];
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

function extractRequirements(text) {
  return extractSection(text, [
    'requisitos', 'requerimentos', 'qualificações', 'qualificacoes',
    'requisitos obrigatórios', 'requisitos mandatórios',
    'exigências', 'exigencias', 'skills', 'competências', 'competencias'
  ]);
}

function extractResponsibilities(text) {
  return extractSection(text, [
    'responsabilidades', 'atribuições', 'atribuicoes',
    'atividades', 'escopo', 'o que você vai fazer', 'o que voce vai fazer',
    'suas responsabilidades', 'day to day', 'day-to-day'
  ]);
}

function extractSalary(text) {
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

function extractLocation(text) {
  const remoto = /remoto|home.?office|trabalho.?remoto|anywhere/i.test(text);
  const hibrido = /h[ií]brido|flex[ií]vel/i.test(text);
  const cities = text.match(/S[ãa]o Paulo|Rio de Janeiro|Belo Horizonte|Bras[ií]lia|Porto Alegre|Curitiba|Recife|Fortaleza|Salvador|Florian[oó]polis/gi);
  return { remoto, hibrido, cities: cities || [] };
}

function extractContractType(text) {
  if (/CLT/i.test(text)) return 'CLT';
  if (/PJ|pessoa.jur[ií]dica/i.test(text)) return 'PJ';
  if (/est[aá]gio/i.test(text)) return 'Estágio';
  if (/freelancer|freela/i.test(text)) return 'Freelancer';
  return null;
}

function extractBenefits(text) {
  const normalized = normalizeText(text);
  const benefits = [];
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

function extractContactEmail(text) {
  const patterns = [
    /(?:envie|mande|encaminhe|curr[ií]culo\s*para|contato)[:\s]*([\w.+-]+@[\w-]+\.[\w.-]+)/i,
    /email[\s:]*([\w.+-]+@[\w-]+\.[\w.-]+)/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1] || m[0];
  }
  return null;
}

function categorizeSkills(skills) {
  const categorized = {};
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

export function parseVaga(texto) {
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
    rawDescription
  };
}