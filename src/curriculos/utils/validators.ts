/**
 * Utilitários de validação para a aplicação
 */

/**
 * Valida se um valor não está vazio
 * @param {any} value - Valor a ser validado
 * @returns {boolean} True se não estiver vazio
 */
export const isNotEmpty = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
};

/**
 * Valida formato de e-mail
 * @param {string} email - E-mail a ser validado
 * @returns {boolean} True se for um e-mail válido
 */
export const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * Valida se uma string contém apenas letras e espaços
 * @param {string} text - Texto a ser validado
 * @returns {boolean} True se contiver apenas letras e espaços
 */
export const isValidName = (text) => {
  if (!text || typeof text !== 'string') return false;
  
  const nameRegex = /^[a-zA-ZÀ-ÿ\s]+$/;
  return nameRegex.test(text.trim()) && text.trim().length >= 2;
};

/**
 * Valida telefone brasileiro
 * @param {string} phone - Telefone a ser validado
 * @returns {boolean} True se for um telefone válido
 */
export const isValidPhone = (phone) => {
  if (!phone || typeof phone !== 'string') return false;
  
  const numbers = phone.replace(/\D/g, '');
  return numbers.length >= 8 && numbers.length <= 11;
};

/**
 * Valida URL
 * @param {string} url - URL a ser validada
 * @returns {boolean} True se for uma URL válida
 */
export const isValidUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Valida data
 * @param {string} date - Data a ser validada
 * @returns {boolean} True se for uma data válida
 */
export const isValidDate = (date) => {
  if (!date) return false;
  
  if (date === 'present') return true;
  
  const parsedDate = new Date(date);
  return !isNaN(parsedDate.getTime());
};

/**
 * Valida se uma data é anterior a outra
 * @param {string} startDate - Data de início
 * @param {string} endDate - Data de fim
 * @returns {boolean} True se a data de início for anterior à de fim
 */
export const isValidDateRange = (startDate, endDate) => {
  if (!isValidDate(startDate)) return false;
  if (!isValidDate(endDate)) return false;
  
  if (endDate === 'present') return true;
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  return start <= end;
};

/**
 * Valida texto da vaga
 * @param {string} vagaText - Texto da vaga
 * @returns {Object} Resultado da validação
 */
export const validateVagaText = (vagaText) => {
  const errors = [];
  const warnings = [];
  
  if (!vagaText) {
    errors.push('Texto da vaga é obrigatório');
    return { isValid: false, errors, warnings };
  }
  
  if (typeof vagaText !== 'string') {
    errors.push('Texto da vaga deve ser uma string');
    return { isValid: false, errors, warnings };
  }
  
  const cleanText = vagaText.trim();
  
  if (cleanText.length < 50) {
    errors.push('Texto da vaga deve ter pelo menos 50 caracteres');
  }
  
  if (cleanText.length > 10000) {
    errors.push('Texto da vaga não pode exceder 10.000 caracteres');
  }
  
  // Verificar se contém informações básicas
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(cleanText);
  if (!hasEmail) {
    warnings.push('Texto da vaga sem e-mail de contato. O currículo pode ser gerado, mas o envio exigirá e-mail manual.');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Valida dados do perfil do candidato
 * @param {Object} profile - Perfil do candidato
 * @returns {Object} Resultado da validação
 */
export const validateCandidateProfile = (profile) => {
  const errors = [];
  const warnings = [];
  
  if (!profile || typeof profile !== 'object') {
    errors.push('Perfil do candidato é obrigatório');
    return { isValid: false, errors, warnings };
  }
  
  // Validar informações pessoais
  if (!profile.personalInfo) {
    errors.push('Informações pessoais são obrigatórias');
  } else {
    const { personalInfo } = profile;
    
    if (!isValidName(personalInfo.name)) {
      errors.push('Nome deve conter apenas letras e ter pelo menos 2 caracteres');
    }
    
    if (!isValidEmail(personalInfo.email)) {
      errors.push('E-mail inválido');
    }
    
    if (!isValidPhone(personalInfo.phone)) {
      warnings.push('Telefone pode estar em formato inválido');
    }
    
    if (personalInfo.linkedin && !isValidUrl(personalInfo.linkedin)) {
      warnings.push('URL do LinkedIn pode estar inválida');
    }
    
    if (personalInfo.github && !isValidUrl(personalInfo.github)) {
      warnings.push('URL do GitHub pode estar inválida');
    }
    
    if (personalInfo.portfolio && !isValidUrl(personalInfo.portfolio)) {
      warnings.push('URL do portfolio pode estar inválida');
    }
  }
  
  // Validar experiências
  if (!profile.experiences || !Array.isArray(profile.experiences)) {
    warnings.push('Nenhuma experiência profissional encontrada');
  } else {
    profile.experiences.forEach((exp, index) => {
      if (!exp.position || !isNotEmpty(exp.position)) {
        errors.push(`Experiência ${index + 1}: Cargo é obrigatório`);
      }
      
      if (!exp.company || !isNotEmpty(exp.company)) {
        errors.push(`Experiência ${index + 1}: Empresa é obrigatória`);
      }
      
      if (!isValidDate(exp.startDate)) {
        errors.push(`Experiência ${index + 1}: Data de início inválida`);
      }
      
      if (!isValidDate(exp.endDate)) {
        errors.push(`Experiência ${index + 1}: Data de fim inválida`);
      }
      
      if (exp.startDate && exp.endDate && !isValidDateRange(exp.startDate, exp.endDate)) {
        errors.push(`Experiência ${index + 1}: Data de início deve ser anterior à data de fim`);
      }
    });
  }
  
  // Validar formação
  if (!profile.education || !Array.isArray(profile.education)) {
    warnings.push('Nenhuma formação acadêmica encontrada');
  } else {
    profile.education.forEach((edu, index) => {
      if (!edu.degree || !isNotEmpty(edu.degree)) {
        errors.push(`Formação ${index + 1}: Curso é obrigatório`);
      }
      
      if (!edu.institution || !isNotEmpty(edu.institution)) {
        errors.push(`Formação ${index + 1}: Instituição é obrigatória`);
      }
      
      if (!isValidDate(edu.startDate)) {
        errors.push(`Formação ${index + 1}: Data de início inválida`);
      }
      
      if (!isValidDate(edu.endDate)) {
        errors.push(`Formação ${index + 1}: Data de fim inválida`);
      }
    });
  }
  
  // Validar habilidades
  if (!profile.skills || typeof profile.skills !== 'object') {
    warnings.push('Nenhuma habilidade encontrada');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Valida dados extraídos da vaga
 * @param {Object} dadosVaga - Dados extraídos da vaga
 * @returns {Object} Resultado da validação
 */
export const validateExtractedJobData = (dadosVaga) => {
  const errors = [];
  const warnings = [];
  
  if (!dadosVaga || typeof dadosVaga !== 'object') {
    errors.push('Dados da vaga são obrigatórios');
    return { isValid: false, errors, warnings };
  }
  
  // Validar título
  if (!dadosVaga.titulo || !isNotEmpty(dadosVaga.titulo)) {
    warnings.push('Título da vaga não foi identificado');
  }
  
  // Validar e-mail
  if (!dadosVaga.emailContato || !isValidEmail(dadosVaga.emailContato)) {
    warnings.push('E-mail de contato não foi identificado na vaga');
  }
  
  // Validar área
  if (!dadosVaga.area || !isNotEmpty(dadosVaga.area)) {
    warnings.push('Área de atuação não foi identificada');
  }
  
  // Validar requisitos
  if (!dadosVaga.requisitos || !Array.isArray(dadosVaga.requisitos) || dadosVaga.requisitos.length === 0) {
    warnings.push('Requisitos da vaga não foram identificados');
  }
  
  // Validar stack
  if (!dadosVaga.stack || !Array.isArray(dadosVaga.stack) || dadosVaga.stack.length === 0) {
    warnings.push('Stack tecnológica não foi identificada');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Valida configuração de e-mail
 * @returns {Object} Resultado da validação
 */
export const validateEmailConfig = () => {
  const errors = [];
  const warnings = [];
  
  // Em desenvolvimento, não exigir configuração SMTP
  if (process.env.NODE_ENV === 'development') {
    return { isValid: true, errors, warnings };
  }
  
  const requiredVars = {
    SMTP_HOST: 'Host SMTP',
    SMTP_USER: 'Usuário SMTP',
    SMTP_PASS: 'Senha SMTP'
  };
  
  Object.entries(requiredVars).forEach(([varName, description]) => {
    if (!process.env[varName] || process.env[varName].trim() === '') {
      errors.push(`${description} não configurado (${varName})`);
    }
  });
  
  // Validar porta SMTP
  const smtpPort = process.env.SMTP_PORT;
  if (smtpPort && (isNaN(smtpPort) || parseInt(smtpPort) < 1 || parseInt(smtpPort) > 65535)) {
    warnings.push('Porta SMTP pode estar inválida');
  }
  
  // Validar e-mail do remetente
  if (process.env.SMTP_USER && !isValidEmail(process.env.SMTP_USER)) {
    warnings.push('E-mail do remetente pode estar inválido');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Sanitiza texto removendo caracteres perigosos
 * @param {string} text - Texto a ser sanitizado
 * @returns {string} Texto sanitizado
 */
export const sanitizeText = (text) => {
  if (!text || typeof text !== 'string') return '';
  
  return text
    .trim()
    .replace(/[<>"'&]/g, '') // Remove caracteres HTML perigosos
    .replace(/\s+/g, ' ') // Normaliza espaços
    .slice(0, 10000); // Limita tamanho
};

/**
 * Sanitiza objeto removendo propriedades perigosas
 * @param {Object} obj - Objeto a ser sanitizado
 * @param {Array} allowedKeys - Chaves permitidas
 * @returns {Object} Objeto sanitizado
 */
export const sanitizeObject = (obj, allowedKeys = []) => {
  if (!obj || typeof obj !== 'object') return {};
  
  const sanitized = {};
  
  allowedKeys.forEach(key => {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      
      if (typeof value === 'string') {
        sanitized[key] = sanitizeText(value);
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map(item => 
          typeof item === 'string' ? sanitizeText(item) : item
        );
      } else {
        sanitized[key] = value;
      }
    }
  });
  
  return sanitized;
};

/**
 * Valida tamanho de arquivo
 * @param {number} size - Tamanho do arquivo em bytes
 * @param {number} maxSize - Tamanho máximo permitido em bytes
 * @returns {boolean} True se o tamanho for válido
 */
export const isValidFileSize = (size, maxSize = 10 * 1024 * 1024) => {
  return typeof size === 'number' && size > 0 && size <= maxSize;
};

/**
 * Valida extensão de arquivo
 * @param {string} filename - Nome do arquivo
 * @param {Array} allowedExtensions - Extensões permitidas
 * @returns {boolean} True se a extensão for válida
 */
export const isValidFileExtension = (filename, allowedExtensions = ['.pdf']) => {
  if (!filename || typeof filename !== 'string') return false;
  
  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return allowedExtensions.includes(extension);
};

/**
 * Valida rate limit
 * @param {string} identifier - Identificador único (IP, user ID, etc.)
 * @param {number} limit - Limite de requisições
 * @param {number} windowMs - Janela de tempo em milissegundos
 * @returns {Object} Resultado da validação
 */
export const validateRateLimit = (identifier, limit = 10, windowMs = 60000) => {
  // Esta é uma implementação simples em memória
  // Em produção, usar Redis ou similar
  if (!global.rateLimitStore) {
    global.rateLimitStore = new Map();
  }
  
  const now = Date.now();
  const key = `${identifier}_${Math.floor(now / windowMs)}`;
  
  const current = global.rateLimitStore.get(key) || 0;
  
  if (current >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: Math.ceil(now / windowMs) * windowMs
    };
  }
  
  global.rateLimitStore.set(key, current + 1);
  
  // Limpar entradas antigas
  for (const [storeKey] of global.rateLimitStore) {
    const keyTime = parseInt(storeKey.split('_')[1]);
    if (keyTime < Math.floor((now - windowMs) / windowMs)) {
      global.rateLimitStore.delete(storeKey);
    }
  }
  
  return {
    allowed: true,
    remaining: limit - current - 1,
    resetTime: Math.ceil(now / windowMs) * windowMs
  };
};