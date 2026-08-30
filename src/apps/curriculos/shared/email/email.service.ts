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
  pretensaoSalarial = null,
  pretensaoNegociavel = false,
) => {
  try {
    logInfo("Iniciando envio de e-mail", { destino: emailDestino });
    await fs.access(caminhoArquivoPdf);

    const nomeArquivo = path.basename(caminhoArquivoPdf);
    const assunto = gerarAssunto(dadosVaga, candidato);
    const corpoEmail = gerarCorpoEmail(dadosVaga, candidato, pretensaoSalarial, pretensaoNegociavel);
    const sendTimeoutMs = parseInt(process.env.EMAIL_SEND_TIMEOUT_MS) || 20000;

    const mailOptions = {
      from: {
        name:
          candidato.name || process.env.SENDER_NAME || "Sistema de Currículo",
        address: process.env.EMAIL_FROM || process.env.SMTP_USER,
      },
      to: emailDestino,
      replyTo: "victorsalome41@hotmail.com",
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
 * Escapa caracteres HTML especiais pra evitar quebrar a marcação com dados
 * vindos do banco/vaga (nomes, empresas, etc podem conter & < > " ').
 */
const escapeHtml = (valor: unknown): string =>
  String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Garante que um link tenha protocolo (http/https) antes de virar href,
 * senão o link fica relativo ao domínio do cliente de e-mail e abre errado.
 */
const normalizarUrl = (url: string): string => {
  const limpo = url.trim();
  if (!limpo) return "";
  return /^https?:\/\//i.test(limpo) ? limpo : `https://${limpo}`;
};

const CORES = {
  texto: "#1f2937",
  textoSecundario: "#6b7280",
  fundo: "#f4f5f7",
  card: "#ffffff",
  borda: "#e5e7eb",
  destaque: "#2563eb",
};

/**
 * Gera corpo do e-mail em HTML. CSS inline em cada elemento (não em
 * <style>) e layout em <table> — necessário pra renderizar de forma
 * consistente em clientes de e-mail restritivos como Gmail (que ignora
 * blocos <style> em vários contextos) e Outlook desktop (motor MSO/Word,
 * suporte limitado a CSS moderno e a <div>).
 * @param {Object} dadosVaga - Dados da vaga
 * @param {Object} candidato - Dados do candidato
 * @returns {string} Corpo do e-mail em HTML
 */
const gerarCorpoEmail = (dadosVaga, candidato, pretensaoSalarial = null, pretensaoNegociavel = false) => {
  const nomeVaga = escapeHtml(dadosVaga.titulo || "a vaga anunciada");
  const nomeCandidato = escapeHtml(candidato.name || "Candidato");
  const cargoCandidato = escapeHtml(candidato.title || "");
  const empresa = escapeHtml(dadosVaga.empresa || "sua empresa");
  const emailContato = candidato.email || process.env.SMTP_USER || "";

  const linhasContato: string[] = [];
  if (emailContato) {
    linhasContato.push(
      `E-mail: <a href="mailto:${escapeHtml(emailContato)}" style="color:${CORES.destaque};text-decoration:none;">${escapeHtml(emailContato)}</a>`,
    );
  }
  if (candidato.phone && candidato.phone.trim()) {
    const digitos = candidato.phone.replace(/\D/g, "");
    linhasContato.push(
      candidato.hasWhatsApp !== false
        ? `WhatsApp: <a href="https://wa.me/55${digitos}" style="color:${CORES.destaque};text-decoration:none;">${escapeHtml(candidato.phone)}</a>`
        : `Telefone: ${escapeHtml(candidato.phone)}`,
    );
  }
  if (candidato.linkedin && candidato.linkedin.trim()) {
    linhasContato.push(
      `LinkedIn: <a href="${normalizarUrl(candidato.linkedin)}" style="color:${CORES.destaque};text-decoration:none;">${escapeHtml(candidato.linkedin)}</a>`,
    );
  }
  if (candidato.github && candidato.github.trim()) {
    linhasContato.push(
      `GitHub: <a href="${normalizarUrl(candidato.github)}" style="color:${CORES.destaque};text-decoration:none;">${escapeHtml(candidato.github)}</a>`,
    );
  }
  if (candidato.portfolio && candidato.portfolio.trim()) {
    linhasContato.push(
      `Portfólio: <a href="${normalizarUrl(candidato.portfolio)}" style="color:${CORES.destaque};text-decoration:none;">${escapeHtml(candidato.portfolio)}</a>`,
    );
  }

  const linhaEstilo = `margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:${CORES.textoSecundario};`;
  const contatoHtml = linhasContato
    .map((linha) => `<p style="${linhaEstilo}">${linha}</p>`)
    .join("\n");

  const pontosHtml = gerarPontosRelevantes(dadosVaga, candidato);
  const activePretensao = pretensaoSalarial !== null ? pretensaoSalarial : (candidato.salaryPretension || candidato.salary_pretension || "");
  const pretensaoSalarialHtml = activePretensao ? `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
  <tr>
    <td style="padding:14px 16px;background-color:${CORES.fundo};border:1px solid ${CORES.borda};border-radius:6px;">
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${CORES.textoSecundario};">Pretensão salarial</p>
      <p style="margin:4px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:${CORES.texto};">${pretensaoNegociavel ? "A negociar" : activePretensao}</p>
    </td>
  </tr>
</table>` : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Candidatura - ${nomeCandidato}</title>
</head>
<body style="margin:0;padding:0;background-color:${CORES.fundo};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CORES.fundo};">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:${CORES.card};border:1px solid ${CORES.borda};border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:${CORES.texto};padding:24px 32px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.5px;text-transform:uppercase;color:#9ca3af;">Candidatura</p>
              <h1 style="margin:4px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:20px;color:#ffffff;">${nomeVaga}</h1>
              <p style="margin:4px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#d1d5db;">${empresa}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:${CORES.texto};">Prezados(as),</p>
              <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:${CORES.texto};">
                Venho apresentar minha candidatura para a posição de <strong>${nomeVaga}</strong> em ${empresa}. Após analisar os requisitos da vaga, acredito que meu perfil está alinhado com o que buscam:
              </p>
              ${pretensaoSalarialHtml}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
                ${pontosHtml}
              </table>
              <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:${CORES.texto};">
                Em anexo, segue meu currículo com as experiências e competências mais relevantes para esta oportunidade.
              </p>
              <p style="margin:0 0 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:${CORES.texto};">
                Fico à disposição para uma conversa e agradeço desde já pela atenção.
              </p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:${CORES.texto};">Atenciosamente,</p>
              <p style="margin:2px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:${CORES.texto};">${nomeCandidato}</p>
              ${cargoCandidato ? `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${CORES.textoSecundario};">${cargoCandidato}</p>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:${CORES.fundo};border-top:1px solid ${CORES.borda};">
              ${contatoHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * Gera pontos relevantes para o corpo do e-mail
 * @param {Object} dadosVaga - Dados da vaga
 * @param {Object} candidato - Dados do candidato
 * @returns {string} HTML (linhas de <table>) com pontos relevantes
 */
const gerarPontosRelevantes = (dadosVaga, candidato) => {
  const pontos: string[] = [];

  // Experiência na área (nomes de campo reais do pipeline: areaAtuacao/stackTecnologica)
  if (dadosVaga.areaAtuacao && candidato.title) {
    pontos.push(
      `Experiência comprovada em <strong>${escapeHtml(dadosVaga.areaAtuacao)}</strong>`,
    );
  }

  // Stack tecnológica
  if (dadosVaga.stackTecnologica && dadosVaga.stackTecnologica.length > 0) {
    const stackPrincipal = dadosVaga.stackTecnologica.slice(0, 3).join(", ");
    pontos.push(
      `Domínio das principais tecnologias: <strong>${escapeHtml(stackPrincipal)}</strong>`,
    );
  }

  // Formação
  if (candidato.education && candidato.education.length > 0) {
    const formacao = candidato.education[0].degree;
    pontos.push(`Formação em <strong>${escapeHtml(formacao)}</strong>`);
  }

  // Experiência profissional
  if (candidato.experiences && candidato.experiences.length > 0) {
    const anosExperiencia = calcularAnosExperiencia(candidato.experiences);
    if (anosExperiencia > 0) {
      pontos.push(
        `Mais de <strong>${anosExperiencia} anos</strong> de experiência profissional`,
      );
    }
  }

  // Certificações relevantes
  if (candidato.certifications && candidato.certifications.length > 0) {
    pontos.push(`Certificações profissionais relevantes`);
  }

  // Se não houver pontos específicos, adicionar genéricos
  if (pontos.length === 0) {
    pontos.push(
      "Perfil profissional alinhado com os requisitos da vaga",
      "Experiência prática e conhecimento técnico atualizado",
      "Motivação para contribuir com o crescimento da empresa",
    );
  }

  return pontos
    .map(
      (ponto) => `<tr>
                  <td style="padding:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:${CORES.texto};vertical-align:top;width:16px;">•</td>
                  <td style="padding:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:${CORES.texto};">${ponto}</td>
                </tr>`,
    )
    .join("\n");
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
  curriculoSnapshot = null,
  salaryPretension = null,
  salaryPretensionNegotiable = 0,
}) => {
  const db = await getDb();
  
  // 1. Criar registro como PENDING (transação atômica)
  let envioId = null;
  try {
    await db.exec("BEGIN TRANSACTION");
    const result = await db.run(
      `INSERT INTO curriculo_envios (vaga_id, filename, email_destino, vaga_titulo, status, salary_pretension, salary_pretension_negotiable, curriculo_snapshot)
       VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      vagaId,
      path.basename(caminhoArquivoPdf),
      emailDestino,
      dadosVaga.titulo || "Vaga não identificada",
      salaryPretension,
      salaryPretensionNegotiable ? 1 : 0,
      curriculoSnapshot,
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
    resultadoEmail = await enviarCurriculo(emailDestino, caminhoArquivoPdf, dadosVaga, candidato, salaryPretension, Boolean(salaryPretensionNegotiable));
    
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
    `SELECT e.id, e.vaga_id, e.filename, e.email_destino, e.vaga_titulo, e.status, e.created_at,
            e.salary_pretension, e.salary_pretension_negotiable,
            COALESCE(v.company, '') as company
     FROM curriculo_envios e
     LEFT JOIN curriculo_vagas v ON e.vaga_id = v.id
     ORDER BY e.created_at DESC LIMIT ?`,
    limit
  );
  return envios;
};
