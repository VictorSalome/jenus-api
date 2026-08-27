/**
 * Utilitários para processamento de texto
 * Funções para análise e extração de informações de textos de vagas
 */

/**
 * Extrai email de um texto usando regex
 * @param {string} text - Texto para buscar email
 * @returns {string|null} - Email encontrado ou null
 */
export const extractEmail = (text) => {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = text.match(emailRegex);
  return matches ? matches[0] : null;
};

/**
 * Extrai tecnologias mencionadas no texto
 * @param {string} text - Texto para análise
 * @returns {Array<string>} - Lista de tecnologias encontradas
 */
export const extractTechnologies = (text) => {
  const techKeywords = [
    'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular', 'Node.js', 'Express',
    'Next.js', 'Nuxt.js', 'Python', 'Java', 'C#', 'PHP', 'Ruby', 'Go', 'Rust',
    'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Docker', 'Kubernetes', 'AWS',
    'Azure', 'GCP', 'Git', 'GitHub', 'GitLab', 'Jenkins', 'CI/CD', 'REST',
    'GraphQL', 'API', 'HTML', 'CSS', 'SASS', 'SCSS', 'Tailwind', 'Bootstrap',
    'Material-UI', 'Styled-Components', 'Webpack', 'Vite', 'Babel', 'ESLint',
    'Prettier', 'Jest', 'Cypress', 'Selenium', 'Figma', 'Adobe XD', 'Sketch'
  ];
  
  const foundTechs = [];
  const textLower = text.toLowerCase();
  
  techKeywords.forEach(tech => {
    if (textLower.includes(tech.toLowerCase())) {
      foundTechs.push(tech);
    }
  });
  
  return [...new Set(foundTechs)];
};

/**
 * Calcula similaridade entre duas strings usando algoritmo simples
 * @param {string} str1 - Primeira string
 * @param {string} str2 - Segunda string
 * @returns {number} - Valor de similaridade entre 0 e 1
 */
export const calculateSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  
  const commonWords = words1.filter(word => 
    words2.some(w2 => w2.includes(word) || word.includes(w2))
  );
  
  return commonWords.length / Math.max(words1.length, words2.length);
};

/**
 * Remove caracteres especiais e normaliza texto
 * @param {string} text - Texto para normalizar
 * @returns {string} - Texto normalizado
 */
export const normalizeText = (text) => {
  if (!text) return '';
  
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\w\s@.-]/g, '')
    .toLowerCase();
};

/**
 * Extrai palavras-chave relevantes de um texto
 * @param {string} text - Texto para análise
 * @param {number} minLength - Tamanho mínimo das palavras
 * @returns {Array<string>} - Lista de palavras-chave
 */
export const extractKeywords = (text, minLength = 3) => {
  if (!text) return [];
  
  const stopWords = [
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'o', 'a', 'e', 'de', 'do', 'da',
    'em', 'um', 'uma', 'para', 'com', 'por', 'ser', 'ter', 'que'
  ];
  
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => 
      word.length >= minLength && 
      !stopWords.includes(word) &&
      !/^\d+$/.test(word)
    );
  
  const wordCount = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });
  
  return Object.keys(wordCount)
    .sort((a, b) => wordCount[b] - wordCount[a])
    .slice(0, 20);
};

/**
 * Verifica se um texto contém palavras-chave específicas
 * @param {string} text - Texto para verificar
 * @param {Array<string>} keywords - Palavras-chave para buscar
 * @returns {Object} - Resultado da verificação
 */
export const containsKeywords = (text, keywords) => {
  if (!text || !keywords || !Array.isArray(keywords)) {
    return { found: [], missing: keywords || [], score: 0 };
  }
  
  const textLower = text.toLowerCase();
  const found = [];
  const missing = [];
  
  keywords.forEach(keyword => {
    if (textLower.includes(keyword.toLowerCase())) {
      found.push(keyword);
    } else {
      missing.push(keyword);
    }
  });
  
  const score = found.length / keywords.length;
  
  return { found, missing, score };
};