import { randomUUID } from "node:crypto";
import { getDb } from "../../../core/database.js";
import {
  StatusLead,
  normalizeStatusLead,
  type EmpresaLead,
  type EmpresaLeadRaw,
  type SalvarEmpresaLeadDTO,
  type EstatisticasStatus,
  type FotoMeta,
  type LandingPageSnapshot,
} from "../types.js";

const parseFotosComMeta = (
  fotosRaw: unknown
): { fotos: string[]; fotos_meta: FotoMeta[] } => {
  let rawList: any[] = [];
  if (Array.isArray(fotosRaw)) {
    rawList = fotosRaw;
  } else if (typeof fotosRaw === "string") {
    try {
      const parsed = JSON.parse(fotosRaw);
      rawList = Array.isArray(parsed) ? parsed : [];
    } catch {
      rawList = [];
    }
  }

  const fotos: string[] = [];
  const fotos_meta: FotoMeta[] = [];

  for (const item of rawList) {
    if (!item) continue;
    if (typeof item === "string") {
      fotos.push(item);
      fotos_meta.push({
        url: item,
        source: "painel",
        confianca: "alta",
      });
    } else if (typeof item === "object" && typeof item.url === "string") {
      fotos.push(item.url);
      fotos_meta.push({
        url: item.url,
        width: item.width,
        height: item.height,
        source: item.source || "painel",
        confianca: item.confianca || "alta",
      });
    }
  }

  return { fotos, fotos_meta };
};

const parseSnapshot = (snapshotRaw: unknown): LandingPageSnapshot | null => {
  if (!snapshotRaw) return null;
  if (typeof snapshotRaw === "object") return snapshotRaw as LandingPageSnapshot;
  if (typeof snapshotRaw === "string") {
    try {
      return JSON.parse(snapshotRaw) as LandingPageSnapshot;
    } catch {
      return null;
    }
  }
  return null;
};

const mapRowToLead = (row: EmpresaLeadRaw): EmpresaLead => {
  const { fotos, fotos_meta } = parseFotosComMeta(row.fotos);
  const { landing_page_snapshot, ...rest } = row;
  return {
    ...rest,
    status: normalizeStatusLead(row.status),
    fotos,
    fotos_meta,
    landing_page_snapshot: parseSnapshot(landing_page_snapshot),
  };
};

export const buscarPorId = async (id: string): Promise<EmpresaLead | null> => {
  const db = await getDb();
  const row = await db.get<EmpresaLeadRaw>(
    "SELECT * FROM prospeccao_empresas WHERE id = ?",
    id
  );
  return row ? mapRowToLead(row) : null;
};

export const buscarPorSlug = async (slug: string): Promise<EmpresaLead | null> => {
  const db = await getDb();
  const row = await db.get<EmpresaLeadRaw>(
    "SELECT * FROM prospeccao_empresas WHERE slug = ?",
    slug
  );
  return row ? mapRowToLead(row) : null;
};

export const salvarEmpresa = async (
  dados: SalvarEmpresaLeadDTO
): Promise<EmpresaLead> => {
  const db = await getDb();

  let existing: EmpresaLeadRaw | undefined;

  if (dados.id) {
    existing = await db.get<EmpresaLeadRaw>(
      "SELECT * FROM prospeccao_empresas WHERE id = ?",
      dados.id
    );
  }

  if (!existing && dados.slug) {
    existing = await db.get<EmpresaLeadRaw>(
      "SELECT * FROM prospeccao_empresas WHERE slug = ?",
      dados.slug
    );
  }

  const telTrim = dados.telefone?.trim();
  if (!existing && telTrim) {
    existing = await db.get<EmpresaLeadRaw>(
      "SELECT * FROM prospeccao_empresas WHERE telefone = ? LIMIT 1",
      telTrim
    );
  }

  const { fotos, fotos_meta } = parseFotosComMeta(dados.fotos);
  const fotosStr = JSON.stringify(fotos_meta.length > 0 ? fotos_meta : fotos);

  // Se já existe e já foi Aprovado, Enviado, Rejeitado ou Convertido:
  // REGRA DE IMUTABILIDADE: Não sobrescrever dados nem snapshot silenciosamente
  if (existing) {
    const statusExistente = normalizeStatusLead(existing.status);
    if (
      statusExistente === StatusLead.APPROVED ||
      statusExistente === StatusLead.SENT ||
      statusExistente === StatusLead.REPLIED ||
      statusExistente === StatusLead.CONVERTED ||
      statusExistente === StatusLead.REJECTED
    ) {
      return mapRowToLead(existing);
    }

    // Se ainda está pendente (PENDING_REVIEW), permite atualizar dados minerados
    await db.run(
      `UPDATE prospeccao_empresas
       SET
         nome = ?,
         slug = ?,
         segmento = ?,
         cidade = ?,
         bairro = ?,
         endereco = ?,
         telefone = ?,
         whatsapp = ?,
         email = ?,
         maps_url = ?,
         avaliacao = ?,
         total_avaliacoes = ?,
         fotos = ?,
         status = COALESCE(?, status),
         motivo_rejeicao = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      dados.nome ?? existing.nome,
      dados.slug ?? existing.slug,
      dados.segmento !== undefined ? dados.segmento : existing.segmento,
      dados.cidade !== undefined ? dados.cidade : existing.cidade,
      dados.bairro !== undefined ? dados.bairro : existing.bairro,
      dados.endereco !== undefined ? dados.endereco : existing.endereco,
      dados.telefone !== undefined ? dados.telefone : existing.telefone,
      dados.whatsapp !== undefined ? dados.whatsapp : existing.whatsapp,
      dados.email !== undefined ? dados.email : existing.email,
      dados.maps_url !== undefined ? dados.maps_url : existing.maps_url,
      dados.avaliacao !== undefined ? dados.avaliacao : existing.avaliacao,
      dados.total_avaliacoes !== undefined ? dados.total_avaliacoes : existing.total_avaliacoes,
      dados.fotos !== undefined ? fotosStr : existing.fotos,
      dados.status ? normalizeStatusLead(dados.status) : existing.status,
      dados.motivo_rejeicao !== undefined ? dados.motivo_rejeicao : existing.motivo_rejeicao,
      existing.id
    );

    return (await buscarPorId(existing.id))!;
  }

  // Criando novo lead: status inicial SEMPRE PENDING_REVIEW
  const id = dados.id || randomUUID();
  const slugFinal = dados.slug;
  const statusInicial = dados.status ? normalizeStatusLead(dados.status) : StatusLead.PENDING_REVIEW;
  const landingPageUrl = dados.landing_page_url || `https://jenus-site.vercel.app/demo/${slugFinal}`;

  const initialSnapshot: LandingPageSnapshot = {
    version: 1,
    nome: dados.nome,
    slug: slugFinal,
    segmento: dados.segmento || null,
    cidade: dados.cidade || null,
    bairro: dados.bairro || null,
    endereco: dados.endereco || null,
    telefone: dados.telefone || null,
    whatsapp: dados.whatsapp || null,
    email: dados.email || null,
    maps_url: dados.maps_url || null,
    avaliacao: dados.avaliacao || null,
    total_avaliacoes: dados.total_avaliacoes || null,
    fotos,
    fotos_meta,
    snapshot_at: new Date().toISOString(),
  };

  const snapshotStr = typeof dados.landing_page_snapshot === "string"
    ? dados.landing_page_snapshot
    : JSON.stringify(dados.landing_page_snapshot || initialSnapshot);

  try {
    await db.run(
      `INSERT INTO prospeccao_empresas (
         id, nome, slug, segmento, cidade, bairro, endereco,
         telefone, whatsapp, email, maps_url, avaliacao,
         total_avaliacoes, fotos, landing_page_url, landing_page_snapshot,
         snapshot_version, status, motivo_rejeicao,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id,
      dados.nome,
      slugFinal,
      dados.segmento ?? null,
      dados.cidade ?? null,
      dados.bairro ?? null,
      dados.endereco ?? null,
      dados.telefone ?? null,
      dados.whatsapp ?? null,
      dados.email ?? null,
      dados.maps_url ?? null,
      dados.avaliacao ?? null,
      dados.total_avaliacoes ?? null,
      fotosStr,
      landingPageUrl,
      snapshotStr,
      statusInicial,
      dados.motivo_rejeicao ?? null
    );
  } catch (insertErr: any) {
    if (insertErr?.message?.includes("UNIQUE constraint failed") && slugFinal) {
      const bySlug = await buscarPorSlug(slugFinal);
      if (bySlug) return bySlug;
    }
    throw insertErr;
  }

  return (await buscarPorId(id))!;
};

export const listarEmpresas = async (
  filtro?: { status?: string; limit?: number }
): Promise<EmpresaLead[]> => {
  const db = await getDb();
  let query = "SELECT * FROM prospeccao_empresas";
  const params: any[] = [];

  if (filtro?.status) {
    const st = normalizeStatusLead(filtro.status);
    if (st === StatusLead.PENDING_REVIEW) {
      query += " WHERE status IN ('PENDING_REVIEW', 'PENDENTE')";
    } else if (st === StatusLead.APPROVED) {
      query += " WHERE status IN ('APPROVED', 'APROVADA')";
    } else if (st === StatusLead.SENT) {
      query += " WHERE status IN ('SENT', 'ENVIADA')";
    } else if (st === StatusLead.REJECTED) {
      query += " WHERE status IN ('REJECTED', 'REJEITADA')";
    } else if (st === StatusLead.CONVERTED) {
      query += " WHERE status IN ('CONVERTED', 'CONVERTIDA')";
    } else if (st === StatusLead.REPLIED) {
      query += " WHERE status IN ('REPLIED', 'RESPONDIDA')";
    } else {
      query += " WHERE status = ?";
      params.push(st);
    }
  }

  query += " ORDER BY created_at DESC";

  if (typeof filtro?.limit === "number" && filtro.limit > 0) {
    query += " LIMIT ?";
    params.push(filtro.limit);
  }

  const rows = await db.all<EmpresaLeadRaw[]>(query, ...params);
  return rows.map(mapRowToLead);
};

export const listarPorStatus = async (
  status: string,
  limit?: number
): Promise<EmpresaLead[]> => {
  return listarEmpresas({ status, limit });
};

export const listarAprovadasParaEnvio = async (
  limit?: number
): Promise<EmpresaLead[]> => {
  return listarPorStatus(StatusLead.APPROVED, limit);
};

export const atualizarStatus = async (
  id: string,
  status: string,
  motivoRejeicao?: string
): Promise<EmpresaLead | null> => {
  const db = await getDb();
  const st = normalizeStatusLead(status);
  await db.run(
    `UPDATE prospeccao_empresas
     SET status = ?, motivo_rejeicao = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    st,
    motivoRejeicao ?? null,
    id
  );
  return buscarPorId(id);
};

export const aprovarLead = async (
  id: string,
  approvedBy: string = "victor"
): Promise<EmpresaLead | null> => {
  const db = await getDb();
  const existing = await buscarPorId(id);
  if (!existing) return null;

  let snapshotStr = existing.landing_page_snapshot
    ? JSON.stringify(existing.landing_page_snapshot)
    : null;

  if (!snapshotStr) {
    const snap: LandingPageSnapshot = {
      version: existing.snapshot_version || 1,
      nome: existing.nome,
      slug: existing.slug,
      segmento: existing.segmento || null,
      cidade: existing.cidade || null,
      bairro: existing.bairro || null,
      endereco: existing.endereco || null,
      telefone: existing.telefone || null,
      whatsapp: existing.whatsapp || null,
      email: existing.email || null,
      maps_url: existing.maps_url || null,
      avaliacao: existing.avaliacao || null,
      total_avaliacoes: existing.total_avaliacoes || null,
      fotos: existing.fotos || [],
      fotos_meta: existing.fotos_meta || [],
      snapshot_at: new Date().toISOString(),
    };
    snapshotStr = JSON.stringify(snap);
  }

  const landingPageUrl =
    existing.landing_page_url || `https://jenus-site.vercel.app/demo/${existing.slug}`;

  await db.run(
    `UPDATE prospeccao_empresas
     SET
       status = ?,
       approved_at = CURRENT_TIMESTAMP,
       approved_by = ?,
       rejected_at = NULL,
       rejected_by = NULL,
       rejection_reason = NULL,
       landing_page_url = ?,
       landing_page_snapshot = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    StatusLead.APPROVED,
    approvedBy,
    landingPageUrl,
    snapshotStr,
    id
  );

  return buscarPorId(id);
};

export const rejeitarLead = async (
  id: string,
  motivo: string = "REPROVADO_MANUAL",
  rejectedBy: string = "victor"
): Promise<EmpresaLead | null> => {
  const db = await getDb();
  await db.run(
    `UPDATE prospeccao_empresas
     SET
       status = ?,
       motivo_rejeicao = ?,
       rejection_reason = ?,
       rejected_at = CURRENT_TIMESTAMP,
       rejected_by = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    StatusLead.REJECTED,
    motivo,
    motivo,
    rejectedBy,
    id
  );
  return buscarPorId(id);
};

export const marcarRespondido = async (
  id: string
): Promise<EmpresaLead | null> => {
  const db = await getDb();
  await db.run(
    `UPDATE prospeccao_empresas
     SET
       status = ?,
       replied_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    StatusLead.REPLIED,
    id
  );
  return buscarPorId(id);
};

export const converterLead = async (
  id: string
): Promise<EmpresaLead | null> => {
  const db = await getDb();
  await db.run(
    `UPDATE prospeccao_empresas
     SET
       status = ?,
       converted_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    StatusLead.CONVERTED,
    id
  );
  return buscarPorId(id);
};

export const obterEstatisticas = async (): Promise<EstatisticasStatus> => {
  const db = await getDb();
  const rows = await db.all<{ status: string; total: number }[]>(
    "SELECT status, COUNT(*) as total FROM prospeccao_empresas GROUP BY status"
  );

  const stats: Record<string, number> = {
    [StatusLead.PENDING_REVIEW]: 0,
    [StatusLead.APPROVED]: 0,
    [StatusLead.SENT]: 0,
    [StatusLead.REPLIED]: 0,
    [StatusLead.CONVERTED]: 0,
    [StatusLead.REJECTED]: 0,
    [StatusLead.FAILED]: 0,
    // Aliases retrocompatíveis
    PENDENTE: 0,
    APROVADA: 0,
    ENVIADA: 0,
    CONVERTIDA: 0,
    REJEITADA: 0,
  };

  for (const row of rows) {
    const rawStatus = row.status;
    const norm = normalizeStatusLead(rawStatus);
    const count = Number(row.total);
    stats[norm] = (stats[norm] || 0) + count;
  }

  // Preenche aliases retrocompatíveis para o frontend legado
  stats.PENDENTE = stats[StatusLead.PENDING_REVIEW];
  stats.APROVADA = stats[StatusLead.APPROVED];
  stats.ENVIADA = stats[StatusLead.SENT];
  stats.CONVERTIDA = stats[StatusLead.CONVERTED];
  stats.REJEITADA = stats[StatusLead.REJECTED];

  return stats;
};
