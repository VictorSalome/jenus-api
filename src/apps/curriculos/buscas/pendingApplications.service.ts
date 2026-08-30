import { getDb } from "../../../core/database.js";
import { logInfo, logError } from "../shared/utils/logger.js";
import { registrarEnvio, registrarErro } from "../monitor/stats.service.js";

export interface PendingApplication {
  id: number;
  vaga_source: string;
  vaga_title: string;
  vaga_company: string;
  vaga_url: string;
  score: number;
  email_destino: string;
  dados_vaga_json: string;
  status: "pending" | "approved" | "rejected" | "sent" | "error";
  erro: string | null;
  created_at: string;
  reviewed_at: string | null;
}

/**
 * Salva uma candidatura gerada pelo pipeline como "aguardando revisão" —
 * o pipeline nunca envia email sozinho, só deixa pronto pra aprovação.
 */
export const salvarPendente = async (data: {
  vagaSource: string;
  vagaTitle: string;
  vagaCompany: string;
  vagaUrl: string;
  score: number;
  emailDestino: string;
  dadosVagaCompleto: Record<string, any>;
}): Promise<number> => {
  const db = await getDb();
  const result = await db.run(
    `INSERT INTO curriculo_pending_applications
      (vaga_source, vaga_title, vaga_company, vaga_url, score, email_destino, dados_vaga_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    data.vagaSource,
    data.vagaTitle,
    data.vagaCompany,
    data.vagaUrl,
    data.score,
    data.emailDestino,
    JSON.stringify(data.dadosVagaCompleto),
  );
  return result.lastID as number;
};

export const listarPendentes = async (
  status: string = "pending",
): Promise<PendingApplication[]> => {
  const db = await getDb();
  if (status === "all") {
    return db.all(
      "SELECT * FROM curriculo_pending_applications ORDER BY created_at DESC",
    );
  }
  return db.all(
    "SELECT * FROM curriculo_pending_applications WHERE status = ? ORDER BY created_at DESC",
    status,
  );
};

const carregarPersonalInfo = async () => {
  const db = await getDb();
  let personalInfo = {
    name: "Candidato",
    email: process.env.SMTP_USER || "",
    phone: "",
    hasWhatsApp: true,
    linkedin: "",
    github: "",
    portfolio: "",
    title: "",
    salaryPretension: "",
  };
  const personal = await db.get(
    "SELECT * FROM curriculo_profile_personal WHERE id = 1",
  );
  if (personal) {
    personalInfo = {
      name: personal.name || "Candidato",
      email: personal.email || process.env.SMTP_USER || "",
      phone: personal.phone || "",
      hasWhatsApp: personal.has_whatsapp === 1,
      linkedin: personal.linkedin || "",
      github: personal.github || "",
      portfolio: personal.portfolio || "",
      title: personal.title || "",
      salaryPretension: personal.salary_pretension || "",
    };
  }
  return personalInfo;
};

/**
 * Aprova uma candidatura pendente: regenera o currículo (com o perfil
 * mais atual, não uma versão congelada) e envia de fato o email.
 */
export const aprovarEEnviar = async (id: number): Promise<PendingApplication> => {
  const db = await getDb();
  const pendente: PendingApplication = await db.get(
    "SELECT * FROM curriculo_pending_applications WHERE id = ?",
    id,
  );
  if (!pendente) throw new Error("Candidatura pendente não encontrada");
  if (pendente.status !== "pending") {
    throw new Error(`Candidatura já está com status "${pendente.status}"`);
  }

  const startTime = Date.now();
  const dadosVaga = JSON.parse(pendente.dados_vaga_json);

  try {
    const { personalizarCurriculo } = await import(
      "../analisar/curriculoPersonalizador.service.js"
    );
    const { gerarPdfCurriculo } = await import(
      "../shared/pdf/pdfGenerator.service.js"
    );
    const { enviarCurriculo } = await import(
      "../shared/email/email.service.js"
    );
    const fs = await import("fs/promises");

    const personalInfo = await carregarPersonalInfo();
    const curriculo = await personalizarCurriculo(dadosVaga);
    const pdfPath = await gerarPdfCurriculo(curriculo, dadosVaga);
    if (!pdfPath) throw new Error("Falha ao gerar PDF do currículo");

    await enviarCurriculo(
      pendente.email_destino,
      pdfPath,
      dadosVaga,
      personalInfo,
    );

    try {
      await fs.unlink(pdfPath);
    } catch {}

    await db.run(
      "UPDATE curriculo_pending_applications SET status = 'sent', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
      id,
    );
    registrarEnvio(Date.now() - startTime);
    logInfo(`✅ Candidatura aprovada e enviada: ${pendente.vaga_title} → ${pendente.email_destino}`);

    return { ...pendente, status: "sent" };
  } catch (err: any) {
    await db.run(
      "UPDATE curriculo_pending_applications SET status = 'error', erro = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
      err.message,
      id,
    );
    registrarErro(err.message);
    logError(`Erro ao aprovar/enviar candidatura #${id}: ${err.message}`);
    throw err;
  }
};

export const rejeitar = async (id: number): Promise<void> => {
  const db = await getDb();
  const result = await db.run(
    "UPDATE curriculo_pending_applications SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'",
    id,
  );
  if (!result.changes) {
    throw new Error("Candidatura pendente não encontrada ou já revisada");
  }
};
