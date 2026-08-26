import { logInfo, logError } from '../utils/logger.js';

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
    
    dadosExtraidos.titulo = extrairTitulo(texto);
    dadosExtraidos.areaAtuacao = extrairAreaAtuacao(texto);
    dadosExtraidos.empresa = extrairEmpresa(texto);
    dadosExtraidos.modalidade = extrairModalidade(texto);
    dadosExtraidos.localizacao = extrairLocalizacao(texto);
    dadosExtraidos.nivel = extrairNivel(texto);
    dadosExtraidos.responsabilidades = extrairResponsabilidades(texto);
    dadosExtraidos.requisitosObrigatorios = extrairRequisitosObrigatorios(texto);
    dadosExtraidos.diferenciaisDesejaveis = extrairDiferenciaisDesejaveis(texto);
    dadosExtraidos.stackTecnologica = extrairStackTecnologica(texto);
    dadosExtraidos.beneficios = extrairBeneficios(texto);
    dadosExtraidos.emailContato = extrairEmailContato(texto);
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

const extrairTitulo = (texto: string): string => {
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
  
  const linhas = texto.split('\n').filter(linha => linha.trim());
  return linhas[0]?.trim() || 'Vaga não especificada';
};

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

const extrairResponsabilidades = (texto: string): string[] => {
  return extrairListaItens(texto, [
    /(?:responsabilidades|atribuições|atividades)\s*:?([\s\S]*?)(?:\n\s*(?:requisitos|benefícios|stack|tecnologias)|$)/i
  ]);
};

const extrairRequisitosObrigatorios = (texto: string): string[] => {
  return extrairListaItens(texto, [
    /(?:requisitos?\s+(?:obrigatórios?|essenciais?)|requirements?)\s*:?([\s\S]*?)(?:\n\s*(?:diferenciais?|benefícios|stack)|$)/i,
    /(?:requisitos?)\s*:?([\s\S]*?)(?:\n\s*(?:diferenciais?|benefícios|stack)|$)/i
  ]);
};

const extrairDiferenciaisDesejaveis = (texto: string): string[] => {
  return extrairListaItens(texto, [
    /(?:diferenciais?|desejáveis?|nice\s+to\s+have)\s*:?([\s\S]*?)(?:\n\s*(?:benefícios|stack|tecnologias)|$)/i
  ]);
};

const extrairStackTecnologica = (texto: string): string[] => {
  const tecnologias = [
    'React', 'Vue', 'Angular', 'JavaScript', 'TypeScript', 'HTML', 'CSS', 'Sass', 'Less',
    'Next.js', 'Nuxt.js', 'Svelte', 'jQuery', 'Bootstrap', 'Tailwind',
    'Node.js', 'Express', 'NestJS', 'Python', 'Django', 'Flask', 'Java', 'Spring',
    'C#', '.NET', 'PHP', 'Laravel', 'Ruby', 'Rails', 'Go', 'Rust',
    'React Native', 'Flutter', 'Swift', 'Kotlin', 'Ionic', 'Xamarin',
    'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'SQLite', 'Oracle', 'SQL Server',
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'GitLab CI',
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

const extrairBeneficios = (texto: string): string[] => {
  return extrairListaItens(texto, [
    /(?:benefícios|benefits)\s*:?([\s\S]*?)(?:\n\s*(?:requisitos|contato|email)|$)/i
  ]);
};

const extrairEmailContato = (texto: string): string | null => {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = texto.match(emailRegex) || [];
  
  if (emails.length === 0) {
    return null;
  }
  
  const emailsPrioritarios = emails.filter(email => {
    const domain = email.split('@')[1];
    return !['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com'].includes(domain);
  });
  
  return emailsPrioritarios.length > 0 ? emailsPrioritarios[0] : emails[0];
};

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

const extrairListaItens = (texto: string, padroes: RegExp[]): string[] => {
  for (const padrao of padroes) {
    const match = texto.match(padrao);
    if (match && match[1]) {
      const secao = match[1].trim();
      
      const itens = secao
        .split(/\n/)
        .map(item => item.trim())
        .filter(item => item.length > 0)
        .map(item => item.replace(/^[-•*]\s*/, ''))
        .filter(item => item.length > 3);
      
      return itens.slice(0, 10);
    }
  }
  
  return [];
};