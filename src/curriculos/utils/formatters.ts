/**
 * Utilitários de formatação de dados
 */

/**
 * Formata data para exibição
 * @param {string|Date} data - Data a ser formatada
 * @param {string} formato - Formato desejado ('short', 'long', 'month-year')
 * @returns {string} Data formatada
 */
export const formatarData = (data: string | Date | null | undefined, formato: 'short' | 'long' | 'month-year' = 'month-year'): string => {
  if (!data) return 'Não informado';
  
  try {
    const date = typeof data === 'string' ? new Date(data) : data;
    
    if (isNaN(date.getTime())) {
      return String(data); // Retorna o valor original se não for uma data válida
    }
    
    const options: Intl.DateTimeFormatOptions = {
      'short': { year: 'numeric', month: '2-digit' },
      'long': { year: 'numeric', month: 'long', day: 'numeric' },
      'month-year': { year: 'numeric', month: 'long' }
    }[formato] || { year: 'numeric', month: 'long' };
    
    return date.toLocaleDateString('pt-BR', options);
  } catch (error) {
    return String(data); // Retorna o valor original em caso de erro
  }
};

/**
 * Formata telefone brasileiro
 * @param {string} telefone - Número de telefone
 * @returns {string} Telefone formatado
 */
export const formatarTelefone = (telefone: string | null | undefined): string => {
  if (!telefone) return 'Não informado';
  
  // Remove todos os caracteres não numéricos
  const numeros = telefone.replace(/\D/g, '');
  
  // Formata conforme o tamanho
  if (numeros.length === 11) {
    // Celular: (XX) 9XXXX-XXXX
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
  } else if (numeros.length === 10) {
    // Fixo: (XX) XXXX-XXXX
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
  } else if (numeros.length === 9) {
    // Celular sem DDD: 9XXXX-XXXX
    return `${numeros.slice(0, 5)}-${numeros.slice(5)}`;
  } else if (numeros.length === 8) {
    // Fixo sem DDD: XXXX-XXXX
    return `${numeros.slice(0, 4)}-${numeros.slice(4)}`;
  }
  
  return telefone; // Retorna original se não conseguir formatar
};

/**
 * Formata CPF
 * @param {string} cpf - Número do CPF
 * @returns {string} CPF formatado
 */
export const formatarCPF = (cpf: string | null | undefined): string => {
  if (!cpf) return 'Não informado';
  
  const numeros = cpf.replace(/\D/g, '');
  
  if (numeros.length === 11) {
    return `${numeros.slice(0, 3)}.${numeros.slice(3, 6)}.${numeros.slice(6, 9)}-${numeros.slice(9)}`;
  }
  
  return cpf;
};

/**
 * Formata CEP
 * @param {string} cep - Número do CEP
 * @returns {string} CEP formatado
 */
export const formatarCEP = (cep: string | null | undefined): string => {
  if (!cep) return 'Não informado';
  
  const numeros = cep.replace(/\D/g, '');
  
  if (numeros.length === 8) {
    return `${numeros.slice(0, 5)}-${numeros.slice(5)}`;
  }
  
  return cep;
};

/**
 * Capitaliza primeira letra de cada palavra
 * @param {string} texto - Texto a ser capitalizado
 * @returns {string} Texto capitalizado
 */
export const capitalizarTexto = (texto: string | null | undefined): string => {
  if (!texto) return '';
  
  return texto
    .toLowerCase()
    .split(' ')
    .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(' ');
};

/**
 * Formata moeda brasileira
 * @param {number} valor - Valor numérico
 * @returns {string} Valor formatado em reais
 */
export const formatarMoeda = (valor: number): string => {
  if (typeof valor !== 'number') return 'R$ 0,00';
  
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
};

/**
 * Formata porcentagem
 * @param {number} valor - Valor numérico (0-100)
 * @param {number} decimais - Número de casas decimais
 * @returns {string} Valor formatado como porcentagem
 */
export const formatarPorcentagem = (valor: number, decimais = 1): string => {
  if (typeof valor !== 'number') return '0%';
  
  return `${valor.toFixed(decimais)}%`;
};

/**
 * Remove acentos de uma string
 * @param {string} texto - Texto com acentos
 * @returns {string} Texto sem acentos
 */
export const removerAcentos = (texto: string | null | undefined): string => {
  if (!texto) return '';
  
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

/**
 * Gera slug a partir de um texto
 * @param {string} texto - Texto original
 * @returns {string} Slug gerado
 */
export const gerarSlug = (texto: string | null | undefined): string => {
  if (!texto) return '';
  
  return removerAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove caracteres especiais
    .replace(/\s+/g, '-') // Substitui espaços por hífens
    .replace(/-+/g, '-') // Remove hífens duplicados
    .replace(/^-|-$/g, ''); // Remove hífens do início e fim
};

/**
 * Trunca texto com reticências
 * @param {string} texto - Texto original
 * @param {number} limite - Limite de caracteres
 * @returns {string} Texto truncado
 */
export const truncarTexto = (texto: string | null | undefined, limite = 100): string => {
  if (!texto) return '';
  
  if (texto.length <= limite) return texto;
  
  return texto.slice(0, limite).trim() + '...';
};

/**
 * Formata duração em meses para texto legível
 * @param {number} meses - Número de meses
 * @returns {string} Duração formatada
 */
export const formatarDuracao = (meses: number | null | undefined): string => {
  if (!meses || meses < 1) return 'Menos de 1 mês';
  
  const anos = Math.floor(meses / 12);
  const mesesRestantes = meses % 12;
  
  let resultado = '';
  
  if (anos > 0) {
    resultado += `${anos} ano${anos > 1 ? 's' : ''}`;
  }
  
  if (mesesRestantes > 0) {
    if (resultado) resultado += ' e ';
    resultado += `${mesesRestantes} mês${mesesRestantes > 1 ? 'es' : ''}`;
  }
  
  return resultado;
};

/**
 * Calcula diferença em meses entre duas datas
 * @param {string|Date} dataInicio - Data de início
 * @param {string|Date} dataFim - Data de fim (ou 'present')
 * @returns {number} Diferença em meses
 */
export const calcularMesesEntreDatas = (dataInicio: string | Date, dataFim: string | Date | 'present'): number => {
  try {
    const inicio = new Date(dataInicio);
    const fim = dataFim === 'present' ? new Date() : new Date(dataFim as string);
    
    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
      return 0;
    }
    
    const diffTime = Math.abs(fim.getTime() - inicio.getTime());
    const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30.44)); // Média de dias por mês
    
    return diffMonths;
  } catch (error) {
    return 0;
  }
};

/**
 * Valida e formata e-mail
 * @param {string} email - E-mail a ser validado
 * @returns {Object} { valido: boolean, emailFormatado: string }
 */
export const validarEmail = (email: string | null | undefined): { valido: boolean; emailFormatado: string } => {
  if (!email) {
    return { valido: false, emailFormatado: '' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailLimpo = email.trim().toLowerCase();
  
  return {
    valido: emailRegex.test(emailLimpo),
    emailFormatado: emailLimpo
  };
};

/**
 * Formata lista de itens para texto
 * @param {Array} lista - Array de itens
 * @param {string} separador - Separador entre itens
 * @param {string} ultimoSeparador - Separador antes do último item
 * @returns {string} Lista formatada
 */
export const formatarLista = (lista: string[], separador = ', ', ultimoSeparador = ' e '): string => {
  if (!Array.isArray(lista) || lista.length === 0) return '';
  
  if (lista.length === 1) return lista[0];
  
  if (lista.length === 2) return lista.join(ultimoSeparador);
  
  const todosExcetoUltimo = lista.slice(0, -1).join(separador);
  const ultimo = lista[lista.length - 1];
  
  return `${todosExcetoUltimo}${ultimoSeparador}${ultimo}`;
};