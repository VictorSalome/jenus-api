import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ExternalHyperlink,
  type ISectionOptions,
} from "docx";
import type { CurriculoExportado } from "./export.service.js";

const FONT = "Calibri";
const COR_TEXTO = "1a1a1a";
const COR_SECUNDARIA = "555555";

// ATS (Gupy etc.) esperam datas consistentes MM/YYYY — "out/2024" e
// "mar-jun/2024" confundem o parser (erro #5 do checklist ATS).
const MESES_PT: Record<string, string> = {
  jan: "01", janeiro: "01",
  fev: "02", fevereiro: "02",
  mar: "03", marco: "03", março: "03",
  abr: "04", abril: "04",
  mai: "05", maio: "05",
  jun: "06", junho: "06",
  jul: "07", julho: "07",
  ago: "08", agosto: "08",
  set: "09", setembro: "09",
  out: "10", outubro: "10",
  nov: "11", novembro: "11",
  dez: "12", dezembro: "12",
};

const monthNum = (sigla: string): string => MESES_PT[sigla.toLowerCase()] ?? sigla;

export function normalizarDatasParaAts(periodo: string): string {
  if (!periodo) return "";
  return periodo
    .replace(/\b(\d{4})-(\d{2})(?:-\d{2})?\b/g, "$2/$1")
    .replace(/([a-zç]{3,9})\s*-\s*([a-zç]{3,9})\s*(?:\/|\s+de\s+)(\d{4})/gi,
      (_m, a: string, b: string, ano: string) =>
        `${monthNum(a)}/${ano} - ${monthNum(b)}/${ano}`)
    .replace(/([a-zç]{3,9})\s*(?:\/|\s+de\s+)(\d{4})/gi,
      (_m, mes: string, ano: string) => `${monthNum(mes)}/${ano}`);
}

const run = (text: string, opts: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) =>
  new TextRun({
    text,
    bold: opts.bold,
    italics: opts.italics,
    size: opts.size ?? 22, // half-points: 22 = 11pt
    color: opts.color ?? COR_TEXTO,
    font: FONT,
  });

const heading = (text: string, isAts = false) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    // ATS: sem borda — parsers leem "Experiência Profissional" limpo;
    // clássico: borda inferior como separador visual
    border: isAts ? undefined : { bottom: { style: BorderStyle.SINGLE, size: 6, color: COR_TEXTO } },
    children: [run(text, { bold: true, size: 26 })],
  });

const bullet = (text: string) =>
  new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [run(text)],
  });

const secondary = (text: string) =>
  new Paragraph({
    spacing: { after: 40 },
    children: [run(text, { color: COR_SECUNDARIA, size: 20 })],
  });

function contactLine(label: string, value: string): Paragraph | null {
  if (!value) return null;
  const isUrl = /^https?:\/\//i.test(value);
  if (isUrl) {
    return new Paragraph({
      spacing: { after: 40 },
      children: [
        run(`${label}: `, { size: 20, color: COR_SECUNDARIA }),
        new ExternalHyperlink({
          link: value,
          children: [run(value, { size: 20, color: "1155CC" })],
        }),
      ],
    });
  }
  return new Paragraph({
    spacing: { after: 40 },
    children: [run(`${label}: `, { size: 20, color: COR_SECUNDARIA }), run(value, { size: 20 })],
  });
}

function experienceBlock(exp: Record<string, any>, isAts: boolean) {
  const children: Paragraph[] = [
    new Paragraph({
      spacing: { before: 200, after: 40 },
      children: [
        run(exp.role || exp.cargo || exp.position || "—", { bold: true, size: 24 }),
        run(` — ${exp.company || exp.empresa || "—"}`, { bold: true, size: 22, color: COR_SECUNDARIA }),
      ],
    }),
  ];
  const period = exp.period || exp.dataInicio || (exp.startDate ? `${exp.startDate} - ${!exp.endDate || exp.endDate === 'present' || exp.endDate === 'Atual' ? 'Atual' : exp.endDate}` : "");
  const location = exp.location || exp.localizacao || "";
  const meta = [isAts ? normalizarDatasParaAts(period) : period, location].filter(Boolean).join(" | ");
  if (meta) children.push(secondary(meta));
  if (exp.description || exp.descricao) {
    children.push(new Paragraph({ spacing: { after: 60 }, children: [run(exp.description || exp.descricao)] }));
  }
  for (const b of exp.bullets || []) children.push(bullet(b));
  if (exp.technologies?.length) {
    children.push(secondary(`Tecnologias: ${exp.technologies.join(", ")}`));
  }
  return children;
}

/**
 * Constrói o Document docx a partir do currículo personalizado.
 * variant 'classic': visual com títulos com borda e layout refinado
 * variant 'ats': otimizado para parsers de ATS (Gupy et al.) — títulos
 * simples, datas MM/YYYY, sem decoração, layout 100% linear.
 */
export function buildCurriculoDocx(
  curriculo: CurriculoExportado,
  vagaTitulo?: string,
  variant: "classic" | "ats" = "classic",
): Document {
  const isAts = variant === "ats";
  const p = curriculo.personalInfo;
  const header: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 80 },
      children: [run(p.name || "Candidato", { bold: true, size: 40 })],
    }),
  ];
  if (p.title) header.push(new Paragraph({ spacing: { after: 120 }, children: [run(p.title, { color: COR_SECUNDARIA, size: 22 })] }));

  for (const line of [
    contactLine("Email", p.email || ""),
    contactLine("Telefone", p.phone || ""),
    contactLine("LinkedIn", p.linkedin || ""),
    contactLine("GitHub", p.github || ""),
    contactLine("Portfólio", p.portfolio || ""),
    contactLine("Localização", p.location || ""),
  ]) {
    if (line) header.push(line);
  }

  const body: Paragraph[] = [...header];

  if (curriculo.summary) {
    body.push(heading("Resumo Profissional", isAts));
    body.push(new Paragraph({
      spacing: { after: 120 },
      children: [run(curriculo.summary, { size: 21 })],
    }));
  }

  if (curriculo.skills && Object.keys(curriculo.skills).length) {
    body.push(heading("Habilidades Técnicas", isAts));
    const MAX_SKILLS_ATS = 30;
    let count = 0;
    for (const [categoria, items] of Object.entries(curriculo.skills)) {
      const arr = Array.isArray(items) ? items : [];
      if (!arr.length) continue;
      let render = arr
        .map((s: any) => (typeof s === "string" ? s : s?.tech || s?.name || ""))
        .filter((text) => text.length > 0);
      if (isAts) {
        if (count >= MAX_SKILLS_ATS) break;
        render = render.slice(0, MAX_SKILLS_ATS - count);
        count += render.length;
      }
      body.push(new Paragraph({
        spacing: { after: 80 },
        children: [run(`${categoria}: `, { bold: true, size: 21 }), run(render.join(" • "), { size: 21 })],
      }));
    }
  }

  if (curriculo.experiences?.length) {
    body.push(heading("Experiência Profissional", isAts));
    for (const exp of curriculo.experiences) body.push(...experienceBlock(exp, isAts));
  }

  if (curriculo.education?.length) {
    body.push(heading("Formação Acadêmica", isAts));
    for (const ed of curriculo.education) {
      const children = [run(ed.degree || ed.curso || "—", { bold: true, size: 22 })];
      if (ed.institution || ed.instituicao) {
        children.push(run(` — ${ed.institution || ed.instituicao}`, { size: 21, color: COR_SECUNDARIA }));
      }
      body.push(new Paragraph({ spacing: { after: 20 }, children }));
      const period = ed.period || [ed.startDate, ed.endDate].filter(Boolean).join(" - ");
      if (period) body.push(secondary(isAts ? normalizarDatasParaAts(period) : period));
    }
  }

  if (curriculo.certifications?.length) {
    body.push(heading("Certificações", isAts));
    for (const c of curriculo.certifications) {
      const date = c.date ? (isAts ? normalizarDatasParaAts(c.date) : c.date) : "";
      const parts = [c.name, c.issuer, date ? `(${date})` : ""].filter(Boolean).join(" - ");
      body.push(bullet(parts));
    }
  }

  if (curriculo.languages?.length) {
    body.push(heading("Idiomas", isAts));
    for (const l of curriculo.languages) {
      const lang = l.language || l.idioma || "—";
      const level = l.level || l.nivel || "—";
      body.push(bullet(`${lang}: ${level}`));
    }
  }

  return new Document({
    creator: p.name || "Jenus",
    title: `Currículo - ${p.name || ""}${vagaTitulo ? ` (${vagaTitulo})` : ""}`,
    description: "Currículo gerado pelo Jenus",
    sections: [{ properties: {}, children: body }],
  });
}
