import { extrairDadosVaga } from "./vagaExtractor.service.js";
import { parseVaga } from "./vagaParser.js";
import { personalizarCurriculo } from "./curriculoPersonalizador.service.js";
import { gerarPdfCurriculo } from "../pdf/pdfGenerator.service.js";
import { getDb } from "../../core/database.js";
import {
  enviarCurriculoComRegistro,
  validarConfiguracaoEmail,
  testarConexaoSMTP,
} from "../email/email.service.js";
import { getSmtpConfig, updateSmtpConfig } from "../smtp/smtpConfig.service.js";
import {
  validateVagaText,
  validateExtractedJobData,
} from "../utils/validators.js";
import { logInfo, logError, logWarn } from "../utils/logger.js";
import {
  asyncHandler,
  ValidationError,
  AppError,
} from "../middleware/errorHandler.js";
import config from "../config/index.js";
import fs from "fs/promises";
import { readFileSync } from "node:fs";
import path from "path";

const gerarTextoCurriculo = (curriculo, vaga) => {
  const linhas = [];
  
  linhas.push(`${curriculo.personalInfo?.name || 'Candidato'}`);
  linhas.push(`${curriculo.personalInfo?.title || vaga.titulo || 'Profissional'}`);
  linhas.push('');
  linhas.push(`📧 ${curriculo.personalInfo?.email || ''}`);
  linhas.push(`📱 ${curriculo.personalInfo?.phone || ''}`);
  linhas.push(`🔗 ${curriculo.personalInfo?.linkedin || ''}`);
  linhas.push(`📍 ${curriculo.personalInfo?.location || ''}`);
  linhas.push('');
  linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  linhas.push('📋 RESUMO PROFISSIONAL');
  linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  linhas.push(curriculo.summary || '');
  linhas.push('');
  
  if (curriculo.experiences?.length) {
    linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    linhas.push('💼 EXPERIÊNCIAS PROFISSIONAIS');
    linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    curriculo.experiences.forEach((exp) => {
      linhas.push(`${exp.role} — ${exp.company}`);
      linhas.push(`${exp.period} | ${exp.location || ''}`);
      if (exp.description) linhas.push(exp.description);
      if (exp.technologies?.length) linhas.push(`Tecnologias: ${exp.technologies.join(', ')}`);
      linhas.push('');
    });
  }
  
  if (curriculo.skills?.length) {
    linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    linhas.push('🛠️ HABILIDADES TÉCNICAS');
    linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    Object.entries(curriculo.skills).forEach(([categoria, techs]) => {
      if (techs?.length) {
        const label = categoria.charAt(0).toUpperCase() + categoria.slice(1);
        linhas.push(`${label}: ${techs.join(', ')}`);
      }
    });
    linhas.push('');
  }
  
  if (curriculo.education?.length) {
    linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    linhas.push('🎓 FORMAÇÃO ACADÊMICA');
    linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    curriculo.education.forEach((edu) => {
      linhas.push(`${edu.degree} — ${edu.institution}`);
      linhas.push(`${edu.period || ''} ${edu.location || ''}`);
      linhas.push('');
    });
  }
  
  if (curriculo.certifications?.length) {
    linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    linhas.push('📜 CERTIFICAÇÕES');
    linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    curriculo.certifications.forEach((cert) => {
      linhas.push(`• ${cert.name} — ${cert.issuer} (${cert.year || ''})`);
    });
    linhas.push('');
  }
  
  if (curriculo.languages?.length) {
    linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    linhas.push('🌐 IDIOMAS');
    linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    curriculo.languages.forEach((lang) => {
      linhas.push(`• ${lang.language}: ${lang.proficiency}`);
    });
    linhas.push('');
  }
  
  linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  linhas.push(`Gerado automaticamente para: ${vaga.titulo || 'Vaga'} — ${vaga.empresa || 'Empresa'}`);
  linhas.push(`Relevância: ${curriculo.relevanceScore}% | Match: ${curriculo.matchingSkills?.length || 0} skills`);
  
  return linhas.join('\n');
};

/**
 * POST /analisar-vaga
 * Apenas roda o parser nativo e retorna dados estruturados
 * Não gera PDF nem persiste no banco
 */
export const analisarVagaController = asyncHandler(async (req, res) => {
  const { textoVaga } = req.body;

  if (!textoVaga || typeof textoVaga !== 'string' || textoVaga.length < 50) {
    throw new ValidationError("Texto da vaga muito curto ou inválido", [
      "Envie textoVaga com pelo menos 50 caracteres",
    ]);
  }

  const vagaParseada = parseVaga(textoVaga);

  if (!vagaParseada) {
    throw new ValidationError("Não foi possível identificar uma vaga no texto", [
      "O texto não parece ser uma descrição de vaga válida",
    ]);
  }

  // Calcular match com perfil do candidato
  const db = await getDb();
  const perfilSkills = await db.all('SELECT category, tech FROM profile_skills');
  const flatSkills = perfilSkills.map(s => s.tech.toLowerCase());
  const vagaSkills = (vagaParseada.skills || []).map(s => s.toLowerCase());
  const matched = vagaSkills.filter(s => flatSkills.includes(s));
  const missing = vagaSkills.filter(s => !flatSkills.includes(s));
  const matchPercent = vagaSkills.length ? Math.round((matched.length / vagaSkills.length) * 100) : 0;

  res.json({
    sucesso: true,
    vagaParseada: {
      titulo: vagaParseada.title,
      empresa: vagaParseada.company,
      seniority: vagaParseada.seniority,
      skills: vagaParseada.skills || [],
      requirements: vagaParseada.requirements || [],
      responsibilities: vagaParseada.responsibilities || [],
      salary: vagaParseada.salary,
      location: vagaParseada.location,
      contractType: vagaParseada.contractType,
      benefits: vagaParseada.benefits,
      contactEmail: vagaParseada.contactEmail,
      categorizedSkills: vagaParseada.categorizedSkills,
      rawDescription: vagaParseada.rawDescription,
    },
    match: {
      percent: matchPercent,
      matched,
      missing,
      totalRequired: vagaSkills.length
    }
  });
});

/**
 * STEP 1: Gera currículo e retorna preview (sem enviar email)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const gerarCurriculoController = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const requestId = req.id;

  logInfo("Iniciando geração do currículo", { requestId });

  // 1. Validar entrada
  const { vaga, textoVaga } = req.body;
  const textoParaAnalise = vaga || textoVaga;

  const validationResult = validateVagaText(textoParaAnalise);
  if (!validationResult.isValid) {
    throw new ValidationError(
      "Dados de entrada inválidos",
      validationResult.errors,
    );
  }

  if (validationResult.warnings.length > 0) {
    logWarn("Avisos na validação da entrada", {
      warnings: validationResult.warnings,
      requestId,
    });
  }

  // 2. Parsear vaga com parser nativo (se for texto livre)
  let dadosVaga;
  let vagaId = null;
  
  if (typeof textoParaAnalise === 'string' && textoParaAnalise.length > 100) {
    logInfo("Parseando vaga com parser nativo", { requestId });
    const vagaParseada = parseVaga(textoParaAnalise);
    
    if (vagaParseada) {
      // Persistir vaga no banco
      const db = await getDb();
      const result = await db.run(
        `INSERT INTO vagas (title, company, seniority, raw_description, skills_json, requirements_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        vagaParseada.title,
        vagaParseada.company,
        vagaParseada.seniority,
        vagaParseada.rawDescription,
        vagaParseada.skills ? JSON.stringify(vagaParseada.skills) : null,
        vagaParseada.requirements ? JSON.stringify(vagaParseada.requirements) : null
      );
      vagaId = result.lastID;
      logInfo("Vaga persistida", { vagaId, requestId });
      
      // Formatar para o formato esperado pelo personalizador
      dadosVaga = {
        titulo: vagaParseada.title,
        empresa: vagaParseada.company,
        senioridade: vagaParseada.seniority,
        areaAtuacao: vagaParseada.skills || [],
        stackTecnologica: vagaParseada.skills || [],
        emailContato: null, // será extraído pelo extractor se houver
        descricao: vagaParseada.rawDescription,
        requisitos: vagaParseada.requirements,
        responsabilidades: vagaParseada.responsibilities
      };
    }
  }
  
  // Fallback: usar extractor original se parser não funcionou
  if (!dadosVaga) {
    logInfo("Usando extractor original", { requestId });
    dadosVaga = await extrairDadosVaga(textoParaAnalise);
  }

  const extractionValidation = validateExtractedJobData(dadosVaga);
  if (!extractionValidation.isValid) {
    throw new ValidationError(
      "Falha na extração de dados da vaga",
      extractionValidation.errors,
    );
  }

  // 3. Personalizar currículo
  logInfo("Personalizando currículo", {
    vaga: dadosVaga.titulo,
    email: dadosVaga.emailContato,
    requestId,
  });
  const curriculoPersonalizado = await personalizarCurriculo(dadosVaga);

  // 4. Gerar PDF
  logInfo("Gerando PDF do currículo", { requestId });
  const caminhoArquivoPdf = await gerarPdfCurriculo(
    curriculoPersonalizado,
    dadosVaga,
  );

  // 5. Manter arquivo para preview
  const processingTime = Date.now() - startTime;
  const nomeArquivo = path.basename(caminhoArquivoPdf);

  const response = {
    status: "success",
    step: "preview",
    message: "Currículo gerado com sucesso. Revise e autorize o envio.",
    vaga: dadosVaga.titulo || "Vaga não identificada",
    emailDestino: dadosVaga.emailContato,
    empresa: dadosVaga.empresa,
    curriculoGerado: nomeArquivo,
    vagaId: vagaId,
    detalhes: {
      relevancia: `${curriculoPersonalizado.relevanceScore}%`,
      tecnologiasEncontradas:
        curriculoPersonalizado.matchingSkills?.length || 0,
      experienciasRelevantes: curriculoPersonalizado.experiences?.length || 0,
      habilidadesMatch: curriculoPersonalizado.matchingSkills || [],
      tempoProcessamento: `${processingTime}ms`,
      timestamp: new Date().toISOString(),
    },
    previewUrl: `/api/curriculo/temp/${nomeArquivo}`,
    curriculoTexto: gerarTextoCurriculo(curriculoPersonalizado, dadosVaga),
    requestId,
  };

  logInfo("Geração do currículo concluída", {
    vaga: dadosVaga.titulo,
    relevancia: curriculoPersonalizado.relevanceScore,
    tempoProcessamento: processingTime,
    requestId,
  });

  res.json(response);
});

/**
 * STEP 2: Envia currículo por email (após aprovação do usuário)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const enviarCurriculoController = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const requestId = req.id;
  const isRenderRuntime =
    process.env.RENDER === "true" ||
    Boolean(process.env.RENDER_EXTERNAL_HOSTNAME);

  const { nomeArquivo, emailDestino, vagaTitulo, vagaId } = req.body;

  if (!nomeArquivo) {
    throw new ValidationError("Nome do arquivo é obrigatório", [
      "Informe o nome do arquivo do currículo",
    ]);
  }

  logInfo("Iniciando envio de currículo", {
    nomeArquivo,
    emailDestino,
    vagaId,
    requestId,
  });

  // Verificar se arquivo existe
  const caminhoArquivoPdf = path.join(config.paths.temp, nomeArquivo);

  try {
    await fs.access(caminhoArquivoPdf);
  } catch {
    throw new AppError(
      "Arquivo do currículo não encontrado. Gere o currículo novamente.",
      404,
    );
  }

  // Verificar configuração de email
  if (!validarConfiguracaoEmail()) {
    logWarn("Configuração de e-mail não disponível", { requestId });

    if (config.server.env === "production") {
      throw new AppError("Serviço de e-mail não configurado", 503);
    }
  }

  // Carregar perfil do candidato do banco
  const db = await getDb();
  const skillsRows = await db.all('SELECT category, tech FROM profile_skills');
  const skills = {
    programming: [],
    frameworks: [],
    databases: [],
    methodologies: [],
    testing: [],
    devops: [],
    aiAutomation: []
  };
  const categoryMap = {
    'programming': 'programming',
    'frameworks': 'frameworks',
    'databases': 'databases',
    'methodologies': 'methodologies',
    'testing': 'testing',
    'devops': 'devops',
    'aiAutomation': 'aiAutomation'
  };
  for (const row of skillsRows) {
    const cat = categoryMap[row.category] || row.category;
    if (skills[cat]) {
      skills[cat].push(row.tech);
    }
  }

  const personalInfo = {
    name: "Victor Salomão",
    email: "vsalome41@gmail.com",
    phone: "+55 11 99999-9999",
    linkedin: "https://linkedin.com/in/victorsalome",
    github: "https://github.com/victorsalome",
    portfolio: "https://victorsalome.dev",
    title: "Desenvolvedor Full Stack | React, TypeScript, Node.js | .NET, SQL"
  };

  // Enviar email com registro atômico PENDING → SENT/FAILED
  let resultadoEmail;
  try {
    const info = personalInfo || {};
    resultadoEmail = await enviarCurriculoComRegistro({
      emailDestino,
      caminhoArquivoPdf,
      dadosVaga: { titulo: vagaTitulo, emailContato: emailDestino },
      candidato: {
        name: info.name || "Victor Salome Sousa",
        email: info.email,
        phone: info.phone,
        linkedin: info.linkedin,
        github: info.github,
        portfolio: info.portfolio,
      },
      vagaId: vagaId || null,
    });
  } catch (emailError) {
    logError("Erro no envio de e-mail", emailError);

    if (config.server.env === "development" && !isRenderRuntime) {
      logWarn("Simulando envio (modo desenvolvimento)", { requestId });
      resultadoEmail = {
        sucesso: true,
        messageId: `dev-mode-${Date.now()}`,
        previewUrl: `/api/curriculo/temp/${nomeArquivo}`,
        envioId: null,
        status: 'SENT'
      };
    } else {
      const smtpMessage = String(emailError?.message || "Erro SMTP").replace(
        /^Falha no envio do e-mail:\s*/i,
        "",
      );
      throw new AppError(`Falha no envio do e-mail: ${smtpMessage}`, 503);
    }
  }

  if (req.timedout || res.headersSent || res.writableEnded) {
    logWarn("Resposta abortada: requisição expirou antes de finalizar envio", {
      requestId,
    });
    return;
  }

  const processingTime = Date.now() - startTime;

  // Limpar arquivo (apenas em produção)
  if (config.server.env !== "development") {
    try {
      await fs.unlink(caminhoArquivoPdf);
    } catch (error) {
      logWarn("Erro ao remover arquivo temporário", {
        error: error.message,
        requestId,
      });
    }
  }

  const response = {
    status: "success",
    step: "sent",
    message: "Currículo enviado com sucesso!",
    email: {
      enviado: resultadoEmail.sucesso,
      messageId: resultadoEmail.messageId,
      destino: emailDestino,
      envioId: resultadoEmail.envioId,
      status: resultadoEmail.status,
    },
    tempoProcessamento: `${processingTime}ms`,
    requestId,
  };

  logInfo("Currículo enviado com sucesso", {
    emailDestino,
    resultado: resultadoEmail.sucesso,
    envioId: resultadoEmail.envioId,
    status: resultadoEmail.status,
    requestId,
  });

  res.json(response);
});

/**
 * Controller para verificar status da API
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const statusController = asyncHandler(async (req, res) => {
  const startTime = Date.now();

  const services = {
    vagaExtractor: "online",
    curriculoPersonalizador: "online",
    pdfGenerator: "online",
    emailService: validarConfiguracaoEmail() ? "online" : "offline",
  };

  let filesystemStatus = "online";
  try {
    await fs.access(config.paths.temp);
  } catch (error) {
    filesystemStatus = "error";
    logWarn("Erro no acesso ao sistema de arquivos", error);
  }

  const memoryUsage = process.memoryUsage();
  const memoryInfo = {
    rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
  };

  const responseTime = Date.now() - startTime;

  const healthStatus = {
    status: "success",
    message: "Sistema de Currículo Automatizado funcionando",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    environment: config.server.env,
    uptime: `${Math.floor(process.uptime())}s`,
    responseTime: `${responseTime}ms`,
    services,
    system: {
      filesystem: filesystemStatus,
      memory: memoryInfo,
      nodeVersion: process.version,
      platform: process.platform,
    },
    config: {
      logLevel: config.log.level,
      rateLimitMax: config.rateLimit.max,
      rateLimitWindow: `${config.rateLimit.windowMs / 1000}s`,
    },
  };

  const hasOfflineServices =
    Object.values(services).includes("offline") ||
    Object.values(services).includes("error") ||
    filesystemStatus === "error";

  const statusCode = hasOfflineServices ? 503 : 200;

  if (hasOfflineServices) {
    healthStatus.status = "degraded";
    healthStatus.message = "Sistema funcionando com limitações";
  }

  res.status(statusCode).json(healthStatus);
});

/**
 * Controller para testar conexão SMTP em tempo real
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const testarSMTPController = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const requestId = req.id;

  const configurado = validarConfiguracaoEmail();
  const envInfo = {
    host: process.env.SMTP_HOST || null,
    port: process.env.SMTP_PORT || null,
    secure: process.env.SMTP_SECURE || null,
    userConfigured: Boolean(process.env.SMTP_USER),
    passConfigured: Boolean(process.env.SMTP_PASS),
  };

  if (!configurado) {
    return res.status(503).json({
      success: false,
      status: "error",
      message: "Configuração SMTP incompleta",
      smtp: {
        configured: false,
        connected: false,
        ...envInfo,
      },
      responseTime: `${Date.now() - startTime}ms`,
      requestId,
    });
  }

  const testResult = await testarConexaoSMTP();

  return res.status(testResult.success ? 200 : 503).json({
    success: testResult.success,
    status: testResult.success ? "success" : "error",
    message: testResult.success
      ? `Conexão SMTP validada com sucesso${testResult.usedFallback ? " (usando fallback porta 465)" : ""}`
      : "Falha ao conectar no SMTP (teste ambas portas 587 e 465)",
    smtp: {
      configured: true,
      connected: testResult.success,
      ...envInfo,
      testedHost: testResult.host,
      testedPort: testResult.port,
      usedSSL: testResult.secure,
      usedFallback: testResult.usedFallback || false,
    },
    responseTime: `${Date.now() - startTime}ms`,
    requestId,
  });
});

/**
 * Retorna a configuração SMTP atual para a página de configuração
 */
export const obterConfigSMTPController = asyncHandler(async (req, res) => {
  return res.json({
    success: true,
    status: "success",
    smtp: getSmtpConfig(),
    requestId: req.id,
  });
});

/**
 * Atualiza configuração SMTP em runtime e persiste em arquivo local
 */
export const atualizarConfigSMTPController = asyncHandler(async (req, res) => {
  try {
    const smtpConfig = await updateSmtpConfig(req.body || {});

    return res.json({
      success: true,
      status: "success",
      message: "Configuração SMTP atualizada com sucesso",
      smtp: smtpConfig,
      requestId: req.id,
    });
  } catch (error) {
    throw new ValidationError(
      "Falha ao atualizar configuração SMTP",
      error?.details || [error.message],
    );
  }
});
