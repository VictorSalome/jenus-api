import "dotenv/config";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { initDb, getDb } from "../../../core/database.js";
import {
  listarAprovadasParaEnvio,
  atualizarStatus,
} from "../repositories/empresa.repository.js";
import { sendMail } from "../../../shared/email/mailer.js";
import { StatusLead, normalizeStatusLead, type EmpresaLead } from "../types.js";
import { sanitizePhone } from "../scraper/utils/phoneSanitizer.js";

export const REPLY_TO_COMERCIAL = "victorsalome41@hotmail.com";

export interface DispatcherOptions {
  minDelayMs?: number;
  maxDelayMs?: number;
  baseUrl?: string;
  dryRun?: boolean;
  limite?: number;
  force?: boolean;
}

export interface DispatchItemResult {
  empresaId: string;
  nome: string;
  canal: "EMAIL" | "WHATSAPP" | "NENHUM";
  sucesso: boolean;
  statusFinal: string;
  motivo?: string;
  waLink?: string;
  messageId?: string;
}

const escapeHtml = (val: unknown): string =>
  String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const gerarTemplateEmail = (empresa: EmpresaLead, demoUrl: string): string => {
  const nomeEmpresa = escapeHtml(empresa.nome);
  const segmento = escapeHtml(empresa.segmento || "Comércio Local");
  const localizacao = escapeHtml(
    [empresa.bairro, empresa.cidade].filter(Boolean).join(", ") || "sua região",
  );
  const fotosExibicao = (empresa.fotos || []).slice(0, 3);

  const fotosHtml =
    fotosExibicao.length > 0
      ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
          <tr>
            <td style="padding-bottom:12px;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#64748b;">
                Imagens reais do estabelecimento integradas na demonstração:
              </p>
            </td>
          </tr>
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  ${fotosExibicao
                    .map(
                      (foto) => `
                    <td width="${Math.floor(100 / fotosExibicao.length)}%" style="padding:0 4px;">
                      <img src="${escapeHtml(foto)}" alt="${nomeEmpresa}" style="width:100%;height:140px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;display:block;" />
                    </td>`,
                    )
                    .join("")}
                </tr>
              </table>
            </td>
          </tr>
        </table>`
      : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Demonstração Exclusiva - ${nomeEmpresa}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1),0 8px 10px -6px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#312e81 100%);padding:40px 36px;text-align:left;">
              <span style="display:inline-block;padding:4px 12px;background-color:rgba(99,102,241,0.2);border:1px solid rgba(165,180,252,0.3);border-radius:9999px;font-size:12px;font-weight:600;color:#c7d2fe;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">
                Demonstração Interativa
              </span>
              <h1 style="margin:8px 0 0 0;font-size:24px;line-height:32px;font-weight:700;color:#ffffff;">
                Nova presença digital para a <span style="color:#38bdf8;">${nomeEmpresa}</span>
              </h1>
              <p style="margin:8px 0 0 0;font-size:14px;color:#94a3b8;line-height:20px;">
                ${segmento} em ${localizacao}
              </p>
            </td>
          </tr>

          <!-- Corpo Principal -->
          <tr>
            <td style="padding:36px 36px 28px 36px;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:#334155;">
                Olá, equipe da <strong>${nomeEmpresa}</strong>,
              </p>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:#334155;">
                Acompanho empresas em ${localizacao} e tomei a iniciativa de montar uma demonstração exclusiva de um novo site para a <strong>${nomeEmpresa}</strong>, estruturado com as fotos reais do seu negócio e otimizado para celulares e WhatsApp.
              </p>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:#334155;">
                Esta é uma demonstração cortesia para que vocês possam avaliar como uma presença digital moderna valoriza os atendimentos da empresa:
              </p>

              ${fotosHtml}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td style="background-color:#f8fafc;border-left:4px solid #10b981;border-radius:0 8px 8px 0;padding:16px;">
                    <p style="margin:0;font-size:14px;line-height:22px;color:#475569;">
                      ✨ <strong>O que preparamos na demonstração:</strong><br>
                      • Carregamento ultra-rápido otimizado para celulares<br>
                      • Fotos reais da sua empresa integradas ao layout<br>
                      • Botão de conversão direta para atendimento imediato
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 24px 0;">
                <tr>
                  <td align="center">
                    <a href="${demoUrl}" target="_blank" style="display:inline-block;padding:16px 32px;background:linear-gradient(135deg,#4f46e5 0%,#4338ca 100%);color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:10px;box-shadow:0 10px 15px -3px rgba(79,70,229,0.3);text-align:center;">
                      Acessar Demonstração da ${nomeEmpresa} &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 20px 0;font-size:13px;line-height:20px;color:#64748b;text-align:center;">
                Ou copie e cole o link no seu navegador: <br>
                <a href="${demoUrl}" style="color:#4f46e5;word-break:break-all;">${demoUrl}</a>
              </p>

              <p style="margin:24px 0 0 0;font-size:14px;line-height:22px;color:#334155;">
                Caso tenham interesse em conhecer a proposta e publicar este site no domínio oficial de vocês, basta responder diretamente a este e-mail.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 36px;background-color:#f1f5f9;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;line-height:18px;color:#64748b;text-align:center;">
                Demonstração comercial independente preparada para ${nomeEmpresa}. Respostas são direcionadas a ${REPLY_TO_COMERCIAL}.<br>
                Se não tiver interesse, basta desconsiderar este e-mail.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export const gerarMensagemWhatsapp = (empresa: EmpresaLead, demoUrl: string): { texto: string; link: string } => {
  const nomeEmpresa = empresa.nome;
  const texto = `Olá! Notamos a presença da *${nomeEmpresa}* e preparamos uma demonstração interativa de um site moderno com as fotos reais do seu negócio, otimizado para celular e WhatsApp: ${demoUrl} . Gostaria de conferir como ficou?`;
  
  const sanitized = sanitizePhone(empresa.whatsapp || empresa.telefone);
  const target = sanitized.raw || "";
  const link = target
    ? `https://wa.me/${target}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/?text=${encodeURIComponent(texto)}`;

  return { texto, link };
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export const dispararParaEmpresa = async (
  empresa: EmpresaLead,
  options: DispatcherOptions = {},
): Promise<DispatchItemResult> => {
  await initDb();
  const db = await getDb();

  // 1. PROTEÇÃO CONTRA DUPLICIDADE: Impede disparo repetido se já estiver SENT
  const statusNorm = normalizeStatusLead(empresa.status);
  if (statusNorm === StatusLead.SENT && !options.force) {
    return {
      empresaId: empresa.id,
      nome: empresa.nome,
      canal: "NENHUM",
      sucesso: false,
      statusFinal: StatusLead.SENT,
      motivo: `BLOQUEADO_DUPLICIDADE: lead já enviado anteriormente em ${empresa.sent_at || "data registrada"}.`,
    };
  }

  // 2. REGRA DE SEGURANÇA NO BACKEND: Lead DEVE estar APPROVED
  if (statusNorm !== StatusLead.APPROVED) {
    return {
      empresaId: empresa.id,
      nome: empresa.nome,
      canal: "NENHUM",
      sucesso: false,
      statusFinal: empresa.status,
      motivo: `BLOQUEADO_NAO_APROVADO: o lead precisa ser aprovado na esteira de qualidade antes do disparo (status atual: ${empresa.status}).`,
    };
  }

  const baseUrl = options.baseUrl || process.env.DEMO_BASE_URL || "https://jenus-site.vercel.app";
  const demoUrl = empresa.landing_page_url || `${baseUrl.replace(/\/$/, "")}/demo/${empresa.slug}`;

  const temEmail = Boolean(empresa.email && empresa.email.trim());
  const temWhatsapp = Boolean(empresa.whatsapp && empresa.whatsapp.trim());

  if (!temEmail && !temWhatsapp) {
    await atualizarStatus(empresa.id, StatusLead.REJECTED, "SEM_CONTATO");
    return {
      empresaId: empresa.id,
      nome: empresa.nome,
      canal: "NENHUM",
      sucesso: false,
      statusFinal: StatusLead.REJECTED,
      motivo: "SEM_CONTATO",
    };
  }

  const canal = temEmail ? "EMAIL" : "WHATSAPP";
  const destinatario = temEmail ? empresa.email!.trim() : (empresa.whatsapp || empresa.telefone || "").trim();
  const replyTo = REPLY_TO_COMERCIAL;

  // 3. RECUPERAÇÃO DE TIMEOUT DE 'PROCESSING' (registros abandonados após 5 minutos)
  const timeoutSegundos = 300;
  await db.run(
    `UPDATE prospeccao_disparos
     SET status = 'FAILED', error = 'TIMEOUT_EXECUCAO_ABANDONADA', updated_at = CURRENT_TIMESTAMP
     WHERE lead_id = ? AND canal = ? AND status = 'PROCESSING'
       AND (strftime('%s', 'now') - strftime('%s', created_at)) > ?`,
    empresa.id,
    canal,
    timeoutSegundos
  );

  // 4. PROTEÇÃO CONTRA DISPARO CONCORRENTE ATIVO
  const activeProc = await db.get(
    `SELECT * FROM prospeccao_disparos WHERE lead_id = ? AND canal = ? AND status = 'PROCESSING'`,
    empresa.id,
    canal
  );
  if (activeProc) {
    return {
      empresaId: empresa.id,
      nome: empresa.nome,
      canal,
      sucesso: false,
      statusFinal: StatusLead.APPROVED,
      motivo: "BLOQUEADO_EM_PROCESSAMENTO: existe um disparo em andamento iniciado recentemente para este lead.",
    };
  }

  // 5. PROTEÇÃO NO BANCO CONTRA DISPARO DUPLICADO CONCLUÍDO
  const alreadySent = await db.get(
    `SELECT * FROM prospeccao_disparos WHERE lead_id = ? AND canal = ? AND status = 'SENT'`,
    empresa.id,
    canal
  );
  if (alreadySent && !options.force) {
    return {
      empresaId: empresa.id,
      nome: empresa.nome,
      canal,
      sucesso: false,
      statusFinal: StatusLead.SENT,
      motivo: `BLOQUEADO_DUPLICIDADE_BANCO: disparo já concluído no banco em ${alreadySent.sent_at} (Message-ID: ${alreadySent.message_id || "N/A"}).`,
    };
  }

  if (options.dryRun) {
    return {
      empresaId: empresa.id,
      nome: empresa.nome,
      canal,
      sucesso: true,
      statusFinal: StatusLead.SENT,
      waLink: canal === "WHATSAPP" ? gerarMensagemWhatsapp(empresa, demoUrl).link : undefined,
    };
  }

  // Inserção atômica com status PROCESSING protegida pelo índice de unicidade
  const disparoId = randomUUID();
  try {
    await db.run(
      `INSERT INTO prospeccao_disparos (
         id, lead_id, canal, tipo_disparo, recipient, reply_to,
         landing_page_url, status, created_at, updated_at
       ) VALUES (?, ?, ?, 'PRIMEIRO_CONTATO', ?, ?, ?, 'PROCESSING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      disparoId,
      empresa.id,
      canal,
      destinatario,
      replyTo,
      demoUrl
    );
  } catch (insertErr: any) {
    if (insertErr?.message?.includes("UNIQUE constraint failed")) {
      return {
        empresaId: empresa.id,
        nome: empresa.nome,
        canal,
        sucesso: false,
        statusFinal: empresa.status,
        motivo: "BLOQUEADO_CONCORRENCIA: disparo simultâneo travado pelo banco de dados.",
      };
    }
    throw insertErr;
  }

  if (canal === "EMAIL") {
    try {
      const html = gerarTemplateEmail(empresa, demoUrl);
      const resultado = await sendMail({
        from: {
          name: process.env.SENDER_NAME || "Victor Salomé | Jenus",
          address: process.env.EMAIL_FROM || process.env.SMTP_USER,
        },
        to: destinatario,
        replyTo: REPLY_TO_COMERCIAL,
        subject: `Demonstração exclusiva: nova presença digital para ${empresa.nome}`,
        html,
      });

      const messageId = resultado?.messageId || null;

      // Sucesso: atualiza tabela de auditoria
      await db.run(
        `UPDATE prospeccao_disparos
         SET status = 'SENT', message_id = ?, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        messageId,
        disparoId
      );

      // Atualiza lead para SENT com metadata
      await db.run(
        `UPDATE prospeccao_empresas
         SET status = ?, sent_at = CURRENT_TIMESTAMP, message_id = ?, reply_to = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        StatusLead.SENT,
        messageId,
        REPLY_TO_COMERCIAL,
        empresa.id
      );

      return {
        empresaId: empresa.id,
        nome: empresa.nome,
        canal: "EMAIL",
        sucesso: true,
        statusFinal: StatusLead.SENT,
        messageId,
      };
    } catch (error: any) {
      // Falha: registra erro no histórico e marca lead como FAILED (permite retry pelo usuário)
      await db.run(
        `UPDATE prospeccao_disparos
         SET status = 'FAILED', error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        error?.message || String(error),
        disparoId
      );

      await db.run(
        `UPDATE prospeccao_empresas
         SET status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        StatusLead.FAILED,
        empresa.id
      );

      return {
        empresaId: empresa.id,
        nome: empresa.nome,
        canal: "EMAIL",
        sucesso: false,
        statusFinal: StatusLead.FAILED,
        motivo: `FALHA_ENVIO_EMAIL: ${error?.message || "Erro desconhecido"}`,
      };
    }
  }

  // Disparo via WhatsApp
  const { link } = gerarMensagemWhatsapp(empresa, demoUrl);
  await db.run(
    `UPDATE prospeccao_disparos
     SET status = 'SENT', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    disparoId
  );

  await db.run(
    `UPDATE prospeccao_empresas
     SET status = ?, sent_at = CURRENT_TIMESTAMP, reply_to = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    StatusLead.SENT,
    REPLY_TO_COMERCIAL,
    empresa.id
  );

  return {
    empresaId: empresa.id,
    nome: empresa.nome,
    canal: "WHATSAPP",
    sucesso: true,
    statusFinal: StatusLead.SENT,
    waLink: link,
  };
};

export const executarDisparoAutomatico = async (
  options: DispatcherOptions = {},
): Promise<DispatchItemResult[]> => {
  await initDb();
  const empresas = await listarAprovadasParaEnvio(options.limite);

  console.log(`[Dispatcher] Encontradas ${empresas.length} empresas aprovadas para envio.`);
  const resultados: DispatchItemResult[] = [];

  const defaultMin = process.env.NODE_ENV === "test" ? 50 : 15000;
  const defaultMax = process.env.NODE_ENV === "test" ? 100 : 30000;
  const minDelay = options.minDelayMs ?? defaultMin;
  const maxDelay = options.maxDelayMs ?? defaultMax;

  for (let i = 0; i < empresas.length; i++) {
    const empresa = empresas[i];
    console.log(`[Dispatcher] (${i + 1}/${empresas.length}) Processando: ${empresa.nome}...`);

    const res = await dispararParaEmpresa(empresa, options);
    resultados.push(res);

    console.log(
      `[Dispatcher] -> ${res.nome}: Canal=${res.canal}, Sucesso=${res.sucesso}, Status=${res.statusFinal}${
        res.motivo ? ` (${res.motivo})` : ""
      }${res.waLink ? ` | URL: ${res.waLink}` : ""}`,
    );

    if (i < empresas.length - 1 && res.canal === "EMAIL" && res.sucesso && !options.dryRun) {
      const waitTime = randomInt(minDelay, maxDelay);
      console.log(`[Dispatcher] Anti-spam: aguardando ${Math.round(waitTime / 1000)}s antes do próximo envio...`);
      await delay(waitTime);
    }
  }

  return resultados;
};

export const executarDisparador = executarDisparoAutomatico;

const isDirectCli = () => {
  if (typeof process === "undefined" || !process.argv[1]) return false;
  const currentFilePath = fileURLToPath(import.meta.url);
  return process.argv[1] === currentFilePath;
};

if (isDirectCli()) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const isDry = args.includes("--dry-run");
      const limitIdx = args.findIndex((a) => a === "--limit" || a === "-l");
      const limite = limitIdx !== -1 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : undefined;

      console.log(`=== Iniciando Disparador de Prospecção ${isDry ? "(MODO DRY-RUN)" : ""} ===`);
      const resultados = await executarDisparoAutomatico({
        dryRun: isDry,
        limite,
      });
      console.log(`=== Finalizado. Total processado: ${resultados.length} ===`);
      process.exit(0);
    } catch (err) {
      console.error("Erro fatal no disparador:", err);
      process.exit(1);
    }
  })();
}
