import { personalizarCurriculo } from "../analisar/curriculoPersonalizador.service.js";
import { buildCurriculoDocx } from "./docx.builder.js";
import { logInfo, logError } from "../shared/utils/logger.js";

export interface CurriculoExportado {
  personalInfo: Record<string, any>;
  summary?: string;
  areasAtuacao?: string[];
  specializations?: Array<Record<string, any> | string>;
  skills: Record<string, any[]>;
  matchingSkills?: string[];
  experiences: Array<Record<string, any>>;
  education: Array<Record<string, any>>;
  certifications: Array<Record<string, any>>;
  languages: Array<Record<string, any>>;
}

/**
 * Gera o Buffer do DOCX a partir do perfil completo do candidato —
 * reusa o mesmo personalizador do pipeline de candidaturas (matching
 * de skills, resumo dinâmico, ordenação por relevância).
 * `dadosVaga` opcional: sem ele, o matching fica genérico (perfil completo).
 */
export async function gerarDocxCurriculo(
  dadosVaga: Record<string, any> = {},
  variant: "classic" | "ats" = "classic",
): Promise<{ buffer: Buffer; fileName: string }> {
  try {
    logInfo(`[Export] Iniciando geração de DOCX (variant=${variant})`);
    const curriculo: CurriculoExportado = await personalizarCurriculo(dadosVaga);
    const doc = buildCurriculoDocx(curriculo, dadosVaga.titulo, variant);
    const { Packer } = await import("docx");
    const buffer = await Packer.toBuffer(doc);

    const nome = (curriculo.personalInfo?.name || "candidato")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const fileName = variant === "ats" ? `curriculo_${nome}_ats.docx` : `curriculo_${nome}.docx`;
    logInfo(`[Export] DOCX gerado: ${fileName} (${(buffer.length / 1024).toFixed(0)} KB)`);
    return { buffer, fileName };
  } catch (err: any) {
    logError(`[Export] Falha ao gerar DOCX: ${err.message}`);
    throw err;
  }
}
