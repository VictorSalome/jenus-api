import { logInfo, logError } from '../utils/logger.js';

/**
 * Dados estruturados de uma vaga extraída
 */
export interface DadosExtraidosVaga {
  titulo: string;
  areaAtuacao: string;
  responsabilidades: string[];
  requisitosObrigatorios: string[];
  diferenciaisDesejaveis: string[];
  stackTecnologica: string[];
  beneficios: string[];
  emailContato: string | null;
  empresa: string;
  localizacao: string;
  modalidade: string;
  salario: string;
  nivel: string;
}

/**
 * Extrai dados estruturados de uma publicação de vaga
 * @param {string} textoVaga - Texto completo da vaga
 * @returns {Object} Dados estruturados da vaga
 */
export const extrairDadosVaga = async (textoVaga: string): Promise<DadosExtraidosVaga> => {
  try {
    logInfo('Iniciando extração de dados da vaga');
    
    if (!textoVaga || typeof textoVaga !== 'string') {
      throw new Error('Texto da vaga é obrigatório e deve ser uma string');
    }
    
    const texto = textoVaga.trim();
    
    // Estrutura base dos dados extraídos
    const dadosExtraidos: DadosExtraidosVaga = {
      titulo: '',
      areaAtuacao: '',
      responsabilidades: [],
      requisitosObrigatorios: [],
      diferenciaisDesejaveis: [],
      stackTecnologica: [],
      beneficios: [],
      emailContato: null,
      empresa: '',
      localizacao: '',
      modalidade: '',
      salario: '',
      nivel: ''
    };
    
    // 1. Extrair título da vaga
    dadosExtraidos.titulo = extrairTitulo(texto);
    
    // 2. Extrair área de atuação
    dadosExtraidos.areaAtuacao = extrairAreaAtuacao(texto);
    
    // 3. Extrair empresa
    dadosExtraidos.empresa = extrairEmpresa(texto);
    
    // 4. Extrair modalidade (remoto, presencial, híbrido)
    dadosExtraidos.modalidade = extrairModalidade(texto);
    
    // 5. Extrair localização
    dadosExtraidos.localizacao = extrairLocalizacao(texto);
    
    // 6. Extrair nível da vaga
    dadosExtraidos.nivel = extrairNivel(texto);
    
    // 7. Extrair responsabilidades
    dadosExtraidos.responsabilidades = extrairResponsabilidades(texto);
    
    // 8. Extrair requisitos obrigatórios
    dadosExtraidos.requisitosObrigatorios = extrairRequisitosObrigatorios(texto);
    
    // 9. Extrair diferenciais desejáveis
    dadosExtraidos.diferenciaisDesejaveis = extrairDiferenciaisDesejaveis(texto);
    
    // 10. Extrair stack tecnológica
    dadosExtraidos.stackTecnologica = extrairStackTecnologica(texto);
    
    // 11. Extrair benefícios
    dadosExtraidos.beneficios = extrairBeneficios(texto);
    
    // 12. Extrair email de contato
    dadosExtraidos.emailContato = extrairEmailContato(texto);
    
    // 13. Extrair informações de salário
    dadosExtraidos.salario = extrairSalario(texto);
    
    logInfo('Extração de dados concluída', {
      titulo: dadosExtraidos.titulo,
      stackCount: dadosExtraidos.stackTecnologica.length,
      emailEncontrado: !!dadosExtraidos.emailContato
    });
    
    return dadosExtraidos;
    
  } catch (error) {
    logError('Erro na extração de dados da vaga', error);
    throw error;
  }
};

/**
 * Extrai o título da vaga
 */
const extrairTitulo = (texto: string): string => {
  // Padrões para identificar títulos
  const padroesTitulo = [
    /^(.+?)(?:\s*[-—]|\n)/m,
    /(?:vaga|posição|cargo)\s*:?\s*(.+?)(?:\n|$)/i,
    /^(.{10,80})(?:\n|$)/m
  ];
  
  for (const padrao of padroesTitulo) {
    const match = texto.match(padrao);
    if (match && match[1]) {
      return match[1].trim().replace(/["']/g, '');
    }
  }
  
  // Fallback: primeira linha não vazia
  const linhas = texto.split('\n').filter(linha => linha.trim());
  return linhas[0]?.trim() || 'Vaga não especificada';
};

/**
 * Extrai área de atuação
 */
const extrairAreaAtuacao = (texto: string): string => {
  const areas: Record<string, string[]> = {
    'desenvolvimento': ['desenvolvedor', 'developer', 'programador', 'software engineer', 'full stack', 'front-end', 'backend', 'mobile'],
    'design': ['designer', 'ui/ux', 'design', 'figma'],
    'dados': ['data', 'analytics', 'scientist', 'analyst', 'bi'],
    'devops': ['devops', 'sre', 'infrastructure', 'cloud', 'aws', 'azure'],
    'qa': ['qa', 'quality', 'tester', 'test'],
    'produto': ['product', 'produto', 'pm'],
    'marketing': ['marketing', 'growth', 'digital']
  };
  
  const textoLower = texto.toLowerCase();
  
  for (const [area, keywords] of Object.entries(areas)) {
    if (keywords.some(keyword => textoLower.includes(keyword))) {
      return area;
    }
  }
  
  return 'tecnologia';
};

/**
 * Extrai nome da empresa
 */
const extrairEmpresa = (texto: string): string => {
  const padroes = [
    /(?:empresa|company)\s*:?\s*(.+?)(?:\n|$)/i,
    /(?:na|da|para)\s+([A-Z][a-zA-Z\s]{2,30})(?:\s+busca|\s+está)/i
  ];
  
  for (const padrao of padroes) {
    const match = texto.match(padrao);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return '';
};

/**
 * Extrai modalidade de trabalho
 */
const extrairModalidade = (texto: string): string => {
  const textoLower = texto.toLowerCase();
  
  if (textoLower.includes('remoto') || textoLower.includes('remote')) {
    return 'remoto';
  }
  if (textoLower.includes('híbrido') || textoLower.includes('hybrid')) {
    return 'híbrido';
  }
  if (textoLower.includes('presencial') || textoLower.includes('on-site')) {
    return 'presencial';
  }
  
  return 'não especificado';
};

/**
 * Extrai localização
 */
const extrairLocalizacao = (texto: string): string => {
  const padroes = [
    /(?:localização|local|cidade)\s*:?\s*(.+?)(?:\n|$)/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})(?:\s|$)/,
    /(São Paulo|Rio de Janeiro|Belo Horizonte|Brasília|Salvador|Fortaleza|Recife|Porto Alegre|Curitiba)/i
  ];
  
  for (const padrao of padroes) {
    const match = texto.match(padrao);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return '';
};

/**
 * Extrai nível da vaga
 */
const extrairNivel = (texto: string): string => {
  const textoLower = texto.toLowerCase();
  
  if (textoLower.includes('sênior') || textoLower.includes('senior')) {
    return 'sênior';
  }
  if (textoLower.includes('pleno') || textoLower.includes('mid-level')) {
    return 'pleno';
  }
  if (textoLower.includes('júnior') || textoLower.includes('junior') || textoLower.includes('jr')) {
    return 'júnior';
  }
  if (textoLower.includes('estagiário') || textoLower.includes('intern')) {
    return 'estagiário';
  }
  
  return 'não especificado';
};

/**
 * Extrai responsabilidades
 */
const extrairResponsabilidades = (texto: string): string[] => {
  return extrairListaItens(texto, [
    /(?:responsabilidades|atribuições|atividades)\s*:?([\s\S]*?)(?:\n\s*(?:requisitos|benefícios|stack|tecnologias)|$)/i
  ]);
};

/**
 * Extrai requisitos obrigatórios
 */
const extrairRequisitosObrigatorios = (texto: string): string[] => {
  return extrairListaItens(texto, [
    /(?:requisitos?\s+(?:obrigatórios?|essenciais?)|requirements?)\s*:?([\s\S]*?)(?:\n\s*(?:diferenciais?|benefícios|stack)|$)/i,
    /(?:requisitos?)\s*:?([\s\S]*?)(?:\n\s*(?:diferenciais?|benefícios|stack)|$)/i
  ]);
};

/**
 * Extrai diferenciais desejáveis
 */
const extrairDiferenciaisDesejaveis = (texto: string): string[] => {
  return extrairListaItens(texto, [
    /(?:diferenciais?|desejáveis?|nice\s+to\s+have)\s*:?([\s\S]*?)(?:\n\s*(?:benefícios|stack|tecnologias)|$)/i
  ]);
};

/**
 * Extrai stack tecnológica
 */
const extrairStackTecnologica = (texto: string): string[] => {
  const tecnologias = [
    // Frontend
    'React', 'Vue', 'Angular', 'JavaScript', 'TypeScript', 'HTML', 'CSS', 'Sass', 'Less',
    'Next.js', 'Nuxt.js', 'Svelte', 'jQuery', 'Bootstrap', 'Tailwind',
    // Backend
    'Node.js', 'Express', 'NestJS', 'Python', 'Django', 'Flask', 'Java', 'Spring',
    'C#', '.NET', 'PHP', 'Laravel', 'Ruby', 'Rails', 'Go', 'Rust',
    // Mobile
    'React Native', 'Flutter', 'Swift', 'Kotlin', 'Ionic', 'Xamarin',
    // Databases
    'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'SQLite', 'Oracle', 'SQL Server',
    // Cloud & DevOps
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'GitLab CI',
    // Others
    'Git', 'GraphQL', 'REST', 'API', 'Microservices', 'Agile', 'Scrum'
  ];
  
  const stackEncontrada: string[] = [];
  const textoLower = texto.toLowerCase();
  
  tecnologias.forEach(tech => {
    if (textoLower.includes(tech.toLowerCase())) {
      stackEncontrada.push(tech);
    }
  });
  
  return [...new Set(stackEncontrada)];
};

/**
 * Extrai benefícios
 */
const extrairBeneficios = (texto: string): string[] => {
  return extrairListaItens(texto, [
    /(?:benefícios|benefits)\s*:?([\s\S]*?)(?:\n\s*(?:requisitos|contato|email)|$)/i
  ]);
};

/**
 * Extrai email de contato
 */
const extrairEmailContato = (texto: string): string | null => {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = texto.match(emailRegex) || [];
  
  if (emails.length === 0) {
    return null;
  }
  
  // Priorizar emails corporativos
  const emailsPrioritarios = emails.filter(email => {
    const domain = email.split('@')[1];
    return !['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com'].includes(domain);
  });
  
  return emailsPrioritarios.length > 0 ? emailsPrioritarios[0] : emails[0];
};

/**
 * Extrai informações de salário
 */
const extrairSalario = (texto: string): string => {
  const padroesSalario = [
    /(?:salário|salary)\s*:?\s*([^\n]+)/i,
    /R\$\s*([\d.,]+(?:\s*(?:a|-)\s*[\d.,]+)?)/i,
    /([\d.,]+)\s*(?:reais?|BRL)/i
  ];
  
  for (const padrao of padroesSalario) {
    const match = texto.match(padrao);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return '';
};

/**
 * Função auxiliar para extrair listas de itens
 */
const extrairListaItens = (texto: string, padroes: RegExp[]): string[] => {
  for (const padrao of padroes) {
    const match = texto.match(padrao);
    if (match && match[1]) {
      const secao = match[1].trim();
      
      // Dividir por quebras de linha e limpar
      const itens = secao
        .split(/\n/)
        .map(item => item.trim())
        .filter(item => item.length > 0)
        .map(item => item.replace(/^[-•*]\s*/, '')) // Remove marcadores
        .filter(item => item.length > 3); // Remove itens muito curtos
      
      return itens.slice(0, 10); // Limitar a 10 itens
    }
  }
  
  return [];
};