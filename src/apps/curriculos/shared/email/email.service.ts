import fs from "fs/promises";
import path from "path";
import { logInfo, logError } from "../utils/logger.js";
import { getDb } from "../../../../core/database.js";
import {
  getSmtpRuntimeConfig,
  criarTransporter,
  withSendTimeout,
  isTimeoutLikeError,
  getTransportFallbacks,
  type SmtpOverrides,
} from "../../../../shared/email/mailer.js";

export { getSmtpRuntimeConfig, criarTransporter };

/**
 * Envia currículo por e-mail
 * @param {string} emailDestino - E-mail de destino
 * @param {string} caminhoArquivoPdf - Caminho do arquivo PDF
 * @param {Object} dadosVaga - Dados da vaga
 * @param {Object} candidato - Dados do candidato
 * @returns {Object} Resultado do envio
 */
export const enviarCurriculo = async (
  emailDestino,
  caminhoArquivoPdf,
  dadosVaga,
  candidato,
) => {
  try {
    logInfo("Iniciando envio de e-mail", { destino: emailDestino });
    await fs.access(caminhoArquivoPdf);

    const nomeArquivo = path.basename(caminhoArquivoPdf);
    const assunto = gerarAssunto(dadosVaga, candidato);
    const corpoEmail = gerarCorpoEmail(dadosVaga, candidato);
    const sendTimeoutMs = parseInt(process.env.EMAIL_SEND_TIMEOUT_MS) || 20000;

    const mailOptions = {
      from: {
        name:
          candidato.name || process.env.SENDER_NAME || "Sistema de Currículo",
        address: process.env.EMAIL_FROM || process.env.SMTP_USER,
      },
      to: emailDestino,
      subject: assunto,
      html: corpoEmail,
      attachments: [
        {
          filename: nomeArquivo,
          path: caminhoArquivoPdf,
          contentType: "application/pdf",
        },
      ],
    };

    const transportFallbacks = getTransportFallbacks();
    let resultado = null;
    let lastError = null;

    for (const transportTry of transportFallbacks) {
      const transporter = criarTransporter(transportTry.overrides);

      try {
        logInfo("Tentando envio SMTP", {
          destino: emailDestino,
          transport: transportTry.name,
        });

        resultado = await withSendTimeout(
          transporter.sendMail(mailOptions),
          sendTimeoutMs,
        );
        break;
      } catch (error) {
        lastError = error;
        logError("Falha no transporte SMTP", {
          transport: transportTry.name,
          error: error.message,
          code: error.code,
        });

        const isLast =
          transportTry === transportFallbacks[transportFallbacks.length - 1];
        if (!isTimeoutLikeError(error) || isLast) {
          throw error;
        }
      } finally {
        if (typeof transporter.close === "function") {
          transporter.close();
        }
      }
    }

    if (!resultado && lastError) {
      throw lastError;
    }

    logInfo("E-mail enviado com sucesso", {
      messageId: resultado.messageId,
      destino: emailDestino,
      arquivo: nomeArquivo,
    });

    if (process.env.NODE_ENV === "development" && resultado.previewUrl) {
      logInfo("Preview do e-mail (desenvolvimento)", {
        url: resultado.previewUrl,
      });
    }

    return {
      sucesso: true,
      messageId: resultado.messageId,
      previewUrl: resultado.previewUrl || null,
      arquivo: nomeArquivo,
    };
  } catch (error) {
    logError("Erro no envio de e-mail", error);
    throw new Error(`Falha no envio do e-mail: ${error.message}`);
  }
};

/**
 * Gera assunto do e-mail
 * @param {Object} dadosVaga - Dados da vaga
 * @param {Object} candidato - Dados do candidato
 * @returns {string} Assunto do e-mail
 */
const gerarAssunto = (dadosVaga, candidato) => {
  const nomeVaga = dadosVaga.titulo || "Vaga de Emprego";
  const nomeCandidato = candidato.name || "Candidato";

  return `Candidatura: ${nomeCandidato} - ${nomeVaga}`;
};

/**
 * Gera corpo do e-mail em HTML
 * @param {Object} dadosVaga - Dados da vaga
 * @param {Object} candidato - Dados do candidato
 * @returns {string} Corpo do e-mail em HTML
 */
const gerarCorpoEmail = (dadosVaga, candidato) => {
  const nomeVaga = dadosVaga.titulo || "a vaga anunciada";
  const nomeCandidato = candidato.name || "Candidato";
  const empresa = dadosVaga.empresa || "sua empresa";

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Candidatura - ${nomeCandidato}</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
            }
            .header {
                background-color: #f8f9fa;
                padding: 20px;
                border-radius: 8px;
                margin-bottom: 20px;
                text-align: center;
            }
            .content {
                background-color: #ffffff;
                padding: 20px;
                border-radius: 8px;
                border: 1px solid #e9ecef;
            }
            .footer {
                margin-top: 20px;
                padding: 15px;
                background-color: #f8f9fa;
                border-radius: 8px;
                font-size: 0.9em;
                color: #6c757d;
            }
            .highlight {
                color: #007bff;
                font-weight: bold;
            }
            .contact-info {
                margin: 15px 0;
                padding: 10px;
                background-color: #f8f9fa;
                border-radius: 4px;
            }
            ul {
                padding-left: 20px;
            }
            li {
                margin-bottom: 5px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h2>Candidatura para: <span class="highlight">${nomeVaga}</span></h2>
        </div>

        <div class="content">
            <p>Prezados(as) Senhores(as),</p>

            <p>Venho por meio desta apresentar minha candidatura para a posição de <strong>${nomeVaga}</strong> em ${empresa}.</p>

            <p>Após analisar detalhadamente os requisitos da vaga, acredito que meu perfil profissional está alinhado com as necessidades da posição. Destaco alguns pontos relevantes:</p>

            <ul>
                ${gerarPontosRelevantes(dadosVaga, candidato)}
            </ul>

            <div class="contact-info">
                <strong>Informações de Contato:</strong><br>
                📧 E-mail: <a href="mailto:${candidato.email || process.env.SMTP_USER || ''}">${candidato.email || process.env.SMTP_USER || "Não informado"}</a><br>
                ${candidato.phone && candidato.phone.trim()
                  ? candidato.hasWhatsApp !== false
                    ? `📱 WhatsApp: <a href="https://wa.me/55${candidato.phone.replace(/\D/g, '')}">${candidato.phone}</a><br>`
                    : `📞 Telefone: ${candidato.phone}<br>`
                  : ""
                }${
                  candidato.linkedin && candidato.linkedin.trim()
                    ? `🔗 LinkedIn: <a href="${candidato.linkedin}">${candidato.linkedin}</a><br>`
                    : ""
                }${candidato.github && candidato.github.trim() ? `💻 GitHub: <a href="${candidato.github}">${candidato.github}</a><br>` : ""}${candidato.portfolio && candidato.portfolio.trim()
                    ? `🌐 Portfolio: <a href="${candidato.portfolio}">${candidato.portfolio}</a><br>`
                    : ""
                }

            <p>Em anexo, segue meu currículo para esta oportunidade, destacando as experiências e competências mais relevantes para a posição.</p>

            <p>Estou disponível para uma conversa e agradeço desde já pela atenção dispensada.</p>

            <p>Atenciosamente,<br>
            <strong>${nomeCandidato}</strong></p>
        </div>


    </body>
    </html>
  `;
};

/**
 * Gera pontos relevantes para o corpo do e-mail
 * @param {Object} dadosVaga - Dados da vaga
 * @param {Object} candidato - Dados do candidato
 * @returns {string} HTML com pontos relevantes
 */
const gerarPontosRelevantes = (dadosVaga, candidato) => {
  const pontos = [];

  // Experiência na área
  if (dadosVaga.area && candidato.title) {
    pontos.push(
      `<li>Experiência comprovada em <strong>${dadosVaga.area}</strong></li>`,
    );
  }

  // Stack tecnológica
  if (dadosVaga.stack && dadosVaga.stack.length > 0) {
    const stackPrincipal = dadosVaga.stack.slice(0, 3).join(", ");
    pontos.push(
      `<li>Domínio das principais tecnologias: <strong>${stackPrincipal}</strong></li>`,
    );
  }

  // Formação
  if (candidato.education && candidato.education.length > 0) {
    const formacao = candidato.education[0].degree;
    pontos.push(`<li>Formação em <strong>${formacao}</strong></li>`);
  }

  // Experiência profissional
  if (candidato.experiences && candidato.experiences.length > 0) {
    const anosExperiencia = calcularAnosExperiencia(candidato.experiences);
    if (anosExperiencia > 0) {
      pontos.push(
        `<li>Mais de <strong>${anosExperiencia} anos</strong> de experiência profissional</li>`,
      );
    }
  }

  // Certificações relevantes
  if (candidato.certifications && candidato.certifications.length > 0) {
    pontos.push(`<li>Certificações profissionais relevantes</li>`);
  }

  // Se não houver pontos específicos, adicionar genéricos
  if (pontos.length === 0) {
    pontos.push(
      "<li>Perfil profissional alinhado com os requisitos da vaga</li>",
      "<li>Experiência prática e conhecimento técnico atualizado</li>",
      "<li>Motivação para contribuir com o crescimento da empresa</li>",
    );
  }

  return pontos.join("\n                ");
};

/**
 * Calcula anos de experiência com base nas experiências profissionais
 * @param {Array} experiences - Array de experiências
 * @returns {number} Anos de experiência
 */
const calcularAnosExperiencia = (experiences) => {
  if (!experiences || experiences.length === 0) return 0;

  let totalMeses = 0;

  experiences.forEach((exp) => {
    const inicio = new Date(exp.startDate);
    const fim = exp.endDate === "present" ? new Date() : new Date(exp.endDate);

    if (inicio && fim && fim > inicio) {
      const diffTime = Math.abs(fim.getTime() - inicio.getTime());
      const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
      totalMeses += diffMonths;
    }
  });

  return Math.floor(totalMeses / 12);
};

/**
 * Valida configuração de e-mail
 * @returns {boolean} True se configuração está válida
 */
export const validarConfiguracaoEmail = () => {
  const smtp = getSmtpRuntimeConfig();

  // Em desenvolvimento, permitir sem configuração SMTP
  if (process.env.NODE_ENV === "development") {
    return true;
  }

  return [smtp.host, smtp.auth.user, smtp.auth.pass].every(
    (value) => value && String(value).trim() !== "",
  );
};

/**
 * Testa conexão SMTP
 * @returns {Promise<boolean>} True se conexão está funcionando
 */
export const testarConexaoSMTP = async (overrides: SmtpOverrides = {}) => {
  const runtimeConfig = getSmtpRuntimeConfig(overrides);

  try {
    const transportFallbacks = getTransportFallbacks(runtimeConfig);

    for (const transportTry of transportFallbacks) {
      const transporter = criarTransporter(transportTry.overrides);
      try {
        await transporter.verify();
        return {
          success: true,
          host: transportTry.overrides.host,
          port: transportTry.overrides.port,
          secure: transportTry.overrides.secure,
          usedFallback: Boolean(
            transportTry.overrides.port !== runtimeConfig.port,
          ),
        };
      } catch (error) {
        logError("Erro na verificação SMTP", {
          transport: transportTry.name,
          error: error.message,
          code: error.code,
        });
      } finally {
        if (typeof transporter.close === "function") {
          transporter.close();
        }
      }
    }

    return {
      success: false,
      host: runtimeConfig.host,
      port: runtimeConfig.port,
      secure: runtimeConfig.secure,
      usedFallback: false,
    };
  } catch (error) {
    logError("Erro geral ao testar conexão SMTP", error);
    return {
      success: false,
      host: runtimeConfig.host,
      port: runtimeConfig.port,
      secure: runtimeConfig.secure,
      usedFallback: false,
    };
  }
};

/**
 * Envia currículo com registro atômico no banco (PENDING → SENT/FAILED)
 * Fluxo:
 * 1. INSERT INTO curriculo_envios (status='PENDING') → COMMIT
 * 2. Tentar envio via nodemailer
 * 3. Sucesso → UPDATE curriculo_envios SET status='SENT' WHERE id=?
 * 4. Falha → UPDATE curriculo_envios SET status='FAILED' WHERE id=?
 * 
 * @param {Object} params
 * @param {string} params.emailDestino - E-mail de destino
 * @param {string} params.caminhoArquivoPdf - Caminho do arquivo PDF
 * @param {Object} params.dadosVaga - Dados da vaga
 * @param {Object} params.candidato - Dados do candidato
 * @param {number} [params.vagaId] - ID da vaga (opcional)
 * @returns {Object} Resultado do envio com envioId
 */
export const enviarCurriculoComRegistro = async ({
  emailDestino,
  caminhoArquivoPdf,
  dadosVaga,
  candidato,
  vagaId = null,
}) => {
  const db = await getDb();
  
  // 1. Criar registro como PENDING (transação atômica)
  let envioId = null;
  try {
    await db.exec("BEGIN TRANSACTION");
    const result = await db.run(
      `INSERT INTO curriculo_envios (vaga_id, filename, email_destino, vaga_titulo, status)
       VALUES (?, ?, ?, ?, 'PENDING')`,
      vagaId,
      path.basename(caminhoArquivoPdf),
      emailDestino,
      dadosVaga.titulo || "Vaga não identificada"
    );
    envioId = result.lastID;
    await db.exec("COMMIT");
    logInfo("Envio registrado como PENDING", { envioId, emailDestino });
  } catch (error) {
    await db.exec("ROLLBACK");
    logError("Erro ao registrar envio PENDING", error);
    throw new Error(`Falha ao registrar envio: ${error.message}`);
  }
  
  // 2. Tentar envio
  let resultadoEmail = null;
  let erroEnvio = null;
  
  try {
    resultadoEmail = await enviarCurriculo(emailDestino, caminhoArquivoPdf, dadosVaga, candidato);
    
    // 3. Sucesso → UPDATE status = SENT
    await db.run(
      "UPDATE curriculo_envios SET status = 'SENT' WHERE id = ?",
      envioId
    );
    logInfo("Envio marcado como SENT", { envioId, messageId: resultadoEmail.messageId });
    
    return {
      ...resultadoEmail,
      envioId,
      status: 'SENT'
    };
  } catch (error) {
    erroEnvio = error;
    
    // 4. Falha → UPDATE status = FAILED
    try {
      await db.run(
        "UPDATE curriculo_envios SET status = 'FAILED' WHERE id = ?",
        envioId
      );
      logInfo("Envio marcado como FAILED", { envioId, error: error.message });
    } catch (updateError) {
      logError("Erro ao atualizar status para FAILED", updateError);
    }
    
    throw error;
  }
};

/**
 * Obtém contagem de envios com status SENT
 */
export const getEnviosCount = async () => {
  const db = await getDb();
  const result = await db.get(
    "SELECT COUNT(*) as count FROM curriculo_envios WHERE status = 'SENT'"
  );
  return result?.count || 0;
};

/**
 * Obtém histórico de envios
 */
export const getEnviosHistory = async (limit = 50) => {
  const db = await getDb();
  const envios = await db.all(
    `SELECT id, vaga_id, filename, email_destino, vaga_titulo, status, created_at
     FROM curriculo_envios ORDER BY created_at DESC LIMIT ?`,
    limit
  );
  return envios;
};
