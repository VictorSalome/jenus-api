import { Request, Response } from "express";
import { gerarDocxCurriculo } from "./export.service.js";
import { logError } from "../shared/utils/logger.js";

/**
 * POST /export
 * Body (validado por validateBody/ExportRequestSchema): { format: 'pdf'|'docx', vagaTitulo? }
 * Responde o arquivo binário com Content-Disposition attachment (stream direto,
 * sem persistir em disco — zero limpeza, zero arquivos órfãos).
 */
export const exportarCurriculo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { format, vagaTitulo, variant = "classic" } = req.body as {
      format: "pdf" | "docx";
      vagaTitulo?: string;
      variant?: "classic" | "ats";
    };

    if (format === "docx") {
      const { buffer, fileName } = await gerarDocxCurriculo(
        vagaTitulo ? { titulo: vagaTitulo } : {},
        variant,
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Content-Length", buffer.length);
      res.status(200).send(buffer);
      return;
    }

    // PDF: reusa o pipeline existente (personalizar + gerarPdfCurriculo)
    const { personalizarCurriculo } = await import("../analisar/curriculoPersonalizador.service.js");
    const { gerarPdfCurriculo } = await import("../shared/pdf/pdfGenerator.service.js");
    const fs = await import("fs/promises");

    const curriculo = await personalizarCurriculo(vagaTitulo ? { titulo: vagaTitulo } : {});
    const pdfPath = await gerarPdfCurriculo(curriculo, vagaTitulo ? { titulo: vagaTitulo } : {});
    const pdfBuffer = await fs.readFile(pdfPath);
    await fs.unlink(pdfPath).catch(() => {});

    const nome = (curriculo.personalInfo?.name || "candidato")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const fileName = `curriculo_${nome}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.status(200).send(pdfBuffer);
  } catch (err: any) {
    logError(`[Export] Erro na exportação: ${err.message}`);
    res.status(500).json({ success: false, message: "Falha ao exportar currículo", error: err.message });
  }
};
