import { randomUUID } from "node:crypto";
import { getDb } from "../../../core/database.js";
import {
  StatusLead,
  type EmpresaLead,
  type EmpresaLeadRaw,
  type SalvarEmpresaLeadDTO,
  type EstatisticasStatus,
} from "../types.js";

const parseFotos = (fotosRaw: unknown): string[] => {
  if (Array.isArray(fotosRaw)) return fotosRaw;
  if (typeof fotosRaw === "string") {
    try {
      const parsed = JSON.parse(fotosRaw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const mapRowToLead = (row: EmpresaLeadRaw): EmpresaLead => ({
  ...row,
  fotos: parseFotos(row.fotos),
});

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

  const fotosStr = Array.isArray(dados.fotos)
    ? JSON.stringify(dados.fotos)
    : typeof dados.fotos === "string"
      ? dados.fotos
      : "[]";

  if (existing) {
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
      dados.status ?? existing.status,
      dados.motivo_rejeicao !== undefined ? dados.motivo_rejeicao : existing.motivo_rejeicao,
      existing.id
    );

    return (await buscarPorId(existing.id))!;
  }

  const id = dados.id || randomUUID();
  try {
    await db.run(
      `INSERT INTO prospeccao_empresas (
         id, nome, slug, segmento, cidade, bairro, endereco,
         telefone, whatsapp, email, maps_url, avaliacao,
         total_avaliacoes, fotos, status, motivo_rejeicao,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id,
      dados.nome,
      dados.slug,
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
      dados.status ?? StatusLead.PENDENTE,
      dados.motivo_rejeicao ?? null
    );
  } catch (insertErr: any) {
    if (insertErr?.message?.includes("UNIQUE constraint failed") && dados.slug) {
      const bySlug = await buscarPorSlug(dados.slug);
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
    query += " WHERE status = ?";
    params.push(filtro.status);
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
  return listarPorStatus(StatusLead.APROVADA, limit);
};

export const atualizarStatus = async (
  id: string,
  status: string,
  motivoRejeicao?: string
): Promise<EmpresaLead | null> => {
  const db = await getDb();
  await db.run(
    `UPDATE prospeccao_empresas
     SET status = ?, motivo_rejeicao = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    status,
    motivoRejeicao ?? null,
    id
  );
  return buscarPorId(id);
};

export const obterEstatisticas = async (): Promise<EstatisticasStatus> => {
  const db = await getDb();
  const rows = await db.all<{ status: string; total: number }[]>(
    "SELECT status, COUNT(*) as total FROM prospeccao_empresas GROUP BY status"
  );

  const stats: EstatisticasStatus = {
    [StatusLead.PENDENTE]: 0,
    [StatusLead.APROVADA]: 0,
    [StatusLead.REJEITADA]: 0,
    [StatusLead.ENVIADA]: 0,
    [StatusLead.CONVERTIDA]: 0,
  };

  for (const row of rows) {
    if (row.status in stats) {
      stats[row.status as StatusLead] = Number(row.total);
    }
  }

  return stats;
};
