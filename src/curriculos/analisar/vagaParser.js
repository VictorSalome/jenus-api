/**
 * Parser nativo de descrição de vaga
 * Extrai informações estruturadas de texto livre usando regex e heurísticas
 * Sem dependência de IA
 */

const TECH_KEYWORDS = [
  'react', 'react native', 'reactjs', 'react.js',
  'node', 'nodejs', 'node.js', 'express', 'nest', 'nestjs', 'next', 'nextjs', 'next.js',
  'typescript', 'javascript', 'js', 'ts',
  'python', 'django', 'flask', 'fastapi',
  'java', 'spring', 'spring boot',
  'c#', 'csharp', '.net', 'dotnet', 'asp.net',
  'go', 'golang', 'rust',
  'php', 'laravel', 'symfony',
  'ruby', 'rails',
  'sql', 'postgresql', 'postgres', 'mysql', 'sqlite', 'mongodb', 'redis',
  'docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp', 'cloud',
  'git', 'github', 'gitlab', 'ci/cd', 'jenkins',
  'html', 'css', 'sass', 'tailwind', 'bootstrap',
  'vue', 'vuejs', 'vue.js', 'angular', 'svelte',
  'jest', 'testing library', 'cypress', 'playwright',
  'graphql', 'rest', 'api', 'microservices',
  'ios', 'android', 'swift', 'kotlin', 'flutter',
  'prisma', 'typeorm', 'sequelize'
];

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
    
    if (cleanLine.match(/^vaga\s+/i) || cleanLine.match(/^📢\s*vaga/i)) {
      return cleanLine
        .replace(/^📢\s*/i, '')
        .replace(/^vaga\s+/i, '')
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
  
  for (const tech of TECH_KEYWORDS) {
    const regex = new RegExp(`\\b${tech.replace(/\./g, '\\.').replace(/\+/g, '\\+')}\\b`, 'i');
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
  
  return {
    title: title || null,
    company: company || null,
    seniority: seniority || null,
    skills: skills.length > 0 ? skills : null,
    requirements: requirements || null,
    responsibilities: responsibilities || null,
    rawDescription
  };
}