import PDFDocument from "pdfkit";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { logInfo, logError } from "../utils/logger.js";
import { formatarData, formatarTelefone } from "../utils/formatters.js";
import config from "../../config/index.js";

/**
 * Cores e espaçamentos usados em todo o PDF — um único lugar para manter
 * consistência visual entre as seções (evita valores mágicos duplicados
 * e divergentes espalhados pelos helpers de cada seção).
 */
const CORES = {
  texto: "#1a1a1a",
  textoSecundario: "#555555",
  textoTerciario: "#777777",
  linha: "#1a1a1a",
};

/**
 * Remove caracteres que podem causar `URI malformed` no `pdfkit` (emojis, etc.)
 * Mantém caracteres acentuados comuns do português.
 */
const sanitizeTextForPdf = (text: string = ""): string => {
  if (!text) return "";
  return (
    text
      // Remove emojis e caracteres fora do BMP (Supplementary Multilingual Plane)
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
      // Remove outros caracteres de controle/invisíveis problemáticos
      .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/g, "")
      .trim()
  );
};

const ESTILOS = {
  nomeCompleto: { font: "Helvetica-Bold", size: 18 },
  titulo: { font: "Helvetica-Bold", size: 14 },
  subtitulo: { font: "Helvetica-Bold", size: 12 },
  texto: { font: "Helvetica", size: 11 },
  textoSmall: { font: "Helvetica", size: 10 },
  contato: { font: "Helvetica", size: 10 },
  espacamento: {
    entreSecoes: 28,
    entreItens: 16,
    entreLinhas: 10,
    cabecalho: 25,
    aposTitulo: 20,
    sublinhadoOffset: 14,
  },
};

/**
 * Gera PDF do currículo seguindo normas ABNT
 * @param {Object} curriculo - Currículo personalizado
 * @param {Object} dadosVaga - Dados da vaga
 * @returns {string} Caminho do arquivo PDF gerado
 */
export const gerarPdfCurriculo = async (curriculo, dadosVaga) => {
  try {
    logInfo("Iniciando geração do PDF do currículo");

    if (dadosVaga && dadosVaga.titulo) {
      dadosVaga.titulo = sanitizeTextForPdf(dadosVaga.titulo);
    }
    if (dadosVaga && dadosVaga.empresa) {
      dadosVaga.empresa = sanitizeTextForPdf(dadosVaga.empresa);
    }

    // Criar diretório temp se não existir
    const tempDir = config.paths.temp;
    await fs.mkdir(tempDir, { recursive: true });

    // Nome do arquivo PDF (removendo acentos e caracteres especiais)
    const nomeLimpo = curriculo.personalInfo.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, "_")
      .toLowerCase();
    const nomeArquivo = `curriculo_${nomeLimpo}_${Date.now()}.pdf`;
    const caminhoArquivo = path.join(tempDir, nomeArquivo);

    // Criar documento PDF com informações saneadas
    const doc = new PDFDocument({
      size: "A4",
      margins: {
        top: 50,
        bottom: 50,
        left: 50,
        right: 50,
      },
      info: {
        Title: sanitizeTextForPdf(`Currículo - ${curriculo.personalInfo.name}`),
        Author: sanitizeTextForPdf(curriculo.personalInfo.name),
        Subject: sanitizeTextForPdf(`Candidatura para: ${dadosVaga.titulo}`),
        Creator: "Sistema de Currículo Automatizado",
      },
      bufferPages: true,
    });

    // Stream para arquivo
    const stream = doc.pipe(createWriteStream(caminhoArquivo));

    const estilos = ESTILOS;

    let yPosition = doc.y;

    // 1. CABEÇALHO COM INFORMAÇÕES PESSOAIS
    yPosition = adicionarCabecalho(
      doc,
      curriculo.personalInfo,
      estilos,
      yPosition,
    );

    // 2. RESUMO PROFISSIONAL
    yPosition = adicionarSecao(
      doc,
      "RESUMO PROFISSIONAL",
      curriculo.summary,
      estilos,
      yPosition,
      "paragrafo",
    );

    // 3. ÁREAS DE ATUAÇÃO (se houver)
    if (curriculo.areasAtuacao && curriculo.areasAtuacao.length > 0) {
      yPosition = adicionarEspecializacoes(
        doc,
        curriculo.areasAtuacao,
        estilos,
        yPosition,
      );
    } else if (
      curriculo.specializations &&
      curriculo.specializations.length > 0
    ) {
      yPosition = adicionarEspecializacoes(
        doc,
        curriculo.specializations,
        estilos,
        yPosition,
      );
    }

    // 4. HABILIDADES TÉCNICAS (destacar as relevantes)
    yPosition = adicionarHabilidades(
      doc,
      curriculo.skills,
      curriculo.matchingSkills,
      estilos,
      yPosition,
    );

    // 5. EXPERIÊNCIA PROFISSIONAL
    yPosition = adicionarExperiencias(
      doc,
      curriculo.experiences,
      estilos,
      yPosition,
    );

    // 6. FORMAÇÃO ACADÊMICA
    yPosition = adicionarFormacao(doc, curriculo.education, estilos, yPosition);

    // 7. CERTIFICAÇÕES
    if (curriculo.certifications && curriculo.certifications.length > 0) {
      yPosition = adicionarCertificacoes(
        doc,
        curriculo.certifications,
        estilos,
        yPosition,
      );
    }

    // 8. IDIOMAS
    if (curriculo.languages && curriculo.languages.length > 0) {
      yPosition = adicionarIdiomas(
        doc,
        curriculo.languages,
        estilos,
        yPosition,
      );
    }

    // Finalizar documento
    doc.end();

    // Aguardar conclusão da escrita
    await new Promise((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    // Verificar se o arquivo foi realmente criado
    await fs.access(caminhoArquivo);

    logInfo("PDF gerado com sucesso", { arquivo: nomeArquivo });
    return caminhoArquivo;
  } catch (error) {
    logError("Erro na geração do PDF", error);
    throw error;
  }
};

/**
 * Verifica se precisa de nova página
 */
const verificarNovaPagina = (doc, yPosition, espacoNecessario = 100) => {
  if (
    yPosition >
    doc.page.height - doc.page.margins.bottom - espacoNecessario
  ) {
    doc.addPage();
    return doc.page.margins.top;
  }
  return yPosition;
};

/**
 * Escreve o título de uma seção (com sublinhado) e devolve o yPosition
 * logo abaixo, pronto para o conteúdo da seção. Centraliza a formatação
 * que antes era repetida (e divergia sutilmente) em cada helper de seção.
 */
const escreverTituloSecao = (doc, titulo, estilos, yPosition) => {
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(CORES.linha)
    .text(titulo, doc.page.margins.left, yPosition);

  const tituloWidth = doc.widthOfString(titulo);
  doc
    .strokeColor(CORES.linha)
    .lineWidth(0.8)
    .moveTo(doc.page.margins.left, yPosition + estilos.espacamento.sublinhadoOffset)
    .lineTo(
      doc.page.margins.left + tituloWidth,
      yPosition + estilos.espacamento.sublinhadoOffset,
    )
    .stroke();

  return yPosition + estilos.espacamento.aposTitulo;
};

/**
 * Adiciona cabeçalho com informações pessoais
 */
const adicionarCabecalho = (doc, personalInfo, estilos, yPosition) => {
  // Nome completo em destaque
  doc
    .font(estilos.nomeCompleto.font)
    .fontSize(estilos.nomeCompleto.size)
    .fillColor(CORES.texto)
    .text(`${personalInfo.name}`, doc.page.margins.left, yPosition);

  yPosition += estilos.nomeCompleto.size + 10;

  // Informações de contato em linha horizontal
  const contatos = [];
  if (personalInfo.email) contatos.push(`Email: ${personalInfo.email}`);
  if (personalInfo.phone)
    contatos.push(`Telefone: ${formatarTelefone(personalInfo.phone)}`);
  if (personalInfo.linkedin)
    contatos.push(`LinkedIn: ${personalInfo.linkedin}`);
  if (personalInfo.github) contatos.push(`GitHub: ${personalInfo.github}`);
  if (personalInfo.location)
    contatos.push(`Localização: ${personalInfo.location}`);

  doc.font(estilos.contato.font).fontSize(estilos.contato.size).fillColor(CORES.texto);

  contatos.forEach((contato, index) => {
    doc.text(contato, doc.page.margins.left, yPosition + index * 12);
  });

  yPosition += contatos.length * 12 + estilos.espacamento.cabecalho;

  // Linha separadora simples
  doc
    .strokeColor(CORES.linha)
    .lineWidth(1)
    .moveTo(doc.page.margins.left, yPosition)
    .lineTo(doc.page.width - doc.page.margins.right, yPosition)
    .stroke();

  return yPosition + estilos.espacamento.cabecalho;
};

/**
 * Adiciona seção genérica
 */
const adicionarSecao = (
  doc,
  titulo,
  conteudo,
  estilos,
  yPosition,
  tipo = "texto",
) => {
  yPosition = verificarNovaPagina(doc, yPosition, 120);
  yPosition = escreverTituloSecao(doc, titulo, estilos, yPosition);

  doc.font(estilos.texto.font).fontSize(estilos.texto.size).fillColor(CORES.texto);

  if (tipo === "paragrafo") {
    doc.text(conteudo, {
      align: "justify",
      lineGap: 4,
      y: yPosition,
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      indent: 0,
    });
    yPosition = doc.y + estilos.espacamento.entreSecoes;
  } else {
    doc.text(conteudo, doc.x, yPosition);
    yPosition += estilos.espacamento.entreSecoes;
  }

  return yPosition;
};

/**
 * Adiciona seção de especializações
 */
const adicionarEspecializacoes = (doc, especializacoes, estilos, yPosition) => {
  yPosition = verificarNovaPagina(doc, yPosition, 80);
  yPosition = escreverTituloSecao(doc, "Áreas de Atuação", estilos, yPosition);

  doc.font(estilos.texto.font).fontSize(estilos.texto.size).fillColor(CORES.texto);

  especializacoes.forEach((esp) => {
    yPosition = verificarNovaPagina(doc, yPosition, 30);
    doc.text(`• ${esp}`, doc.page.margins.left, yPosition);
    yPosition += estilos.espacamento.entreLinhas + 6;
  });

  return yPosition + estilos.espacamento.entreSecoes;
};

/**
 * Adiciona seção de habilidades técnicas.
 *
 * As chaves abaixo espelham exatamente o formato retornado por
 * carregarPerfilCandidato() (curriculoPersonalizador.service.ts): programming,
 * frameworks, databases, methodologies, testing, devops, aiAutomation.
 */
const adicionarHabilidades = (
  doc,
  skills,
  matchingSkills,
  estilos,
  yPosition,
) => {
  yPosition = verificarNovaPagina(doc, yPosition, 150);
  yPosition = escreverTituloSecao(doc, "Habilidades Técnicas", estilos, yPosition);

  const categorias = {
    "Linguagens de Programação": skills.programming || [],
    "Frameworks e Bibliotecas": skills.frameworks || [],
    "Banco de Dados": skills.databases || [],
    "Metodologias": skills.methodologies || [],
    "Testes e Qualidade": skills.testing || [],
    "Cloud e DevOps": skills.devops || [],
    "IA e Automação": skills.aiAutomation || [],
  };

  let algumaCategoriaComItens = false;

  Object.entries(categorias).forEach(([categoria, habilidades]) => {
    if (habilidades.length > 0) {
      algumaCategoriaComItens = true;
      yPosition = verificarNovaPagina(doc, yPosition, 80);

      doc
        .font(estilos.texto.font)
        .fontSize(estilos.texto.size)
        .fillColor(CORES.textoSecundario)
        .text(`${categoria}:`, doc.x, yPosition);

      yPosition += estilos.espacamento.entreLinhas + 4;

      // Habilidades compatíveis com a vaga recebem um marcador "*" —
      // evitamos glyphs Unicode (ex.: ★) que não existem na fonte base
      // Helvetica do PDFKit e podem renderizar como caixa vazia.
      const habilidadesTexto = habilidades
        .map((skill) => {
          const isRelevant = matchingSkills && matchingSkills.includes(skill);
          return isRelevant ? `${skill} *` : skill;
        })
        .join(" • ");

      doc
        .font(estilos.textoSmall.font)
        .fontSize(estilos.textoSmall.size)
        .fillColor(CORES.texto)
        .text(habilidadesTexto, {
          indent: 25,
          y: yPosition,
          width:
            doc.page.width -
            doc.page.margins.left -
            doc.page.margins.right -
            25,
          lineGap: 2,
        });

      yPosition = doc.y + estilos.espacamento.entreLinhas;
    }
  });

  if (algumaCategoriaComItens && matchingSkills && matchingSkills.length > 0) {
    yPosition = verificarNovaPagina(doc, yPosition, 20);
    doc
      .font(estilos.textoSmall.font)
      .fontSize(9)
      .fillColor(CORES.textoTerciario)
      .text("* Habilidade diretamente relacionada aos requisitos da vaga", doc.x, yPosition);
    yPosition += estilos.espacamento.entreLinhas;
  }

  return yPosition + estilos.espacamento.entreSecoes;
};

/**
 * Adiciona experiências profissionais
 */
const adicionarExperiencias = (doc, experiences, estilos, yPosition) => {
  yPosition = verificarNovaPagina(doc, yPosition, 150);
  yPosition = escreverTituloSecao(doc, "Experiência Profissional", estilos, yPosition);

  experiences.forEach((exp, index) => {
    yPosition = verificarNovaPagina(doc, yPosition, 120);

    doc
      .font(estilos.texto.font)
      .fontSize(estilos.texto.size)
      .fillColor(CORES.texto)
      .text(`${exp.position} - ${exp.company}`, doc.x, yPosition);

    yPosition += estilos.espacamento.entreLinhas + 3;

    const periodo = `${formatarData(exp.startDate)} - ${exp.endDate === "present" ? "Atual" : formatarData(exp.endDate)}`;
    doc
      .font(estilos.textoSmall.font)
      .fontSize(estilos.textoSmall.size)
      .fillColor(CORES.textoSecundario)
      .text(`${periodo} | ${exp.location}`, doc.x, yPosition);

    yPosition += estilos.espacamento.entreLinhas + 4;

    if (exp.description) {
      doc
        .font(estilos.textoSmall.font)
        .fontSize(estilos.textoSmall.size)
        .fillColor(CORES.texto)
        .text(exp.description, {
          indent: 10,
          y: yPosition,
          width:
            doc.page.width -
            doc.page.margins.left -
            doc.page.margins.right -
            10,
        });
      yPosition = doc.y + 6;
    }

    if (exp.achievements && exp.achievements.length > 0) {
      exp.achievements.slice(0, 4).forEach((achievement) => {
        doc
          .font(estilos.textoSmall.font)
          .fontSize(estilos.textoSmall.size)
          .fillColor(CORES.texto)
          .text(`• ${achievement}`, {
            indent: 15,
            y: yPosition,
            width:
              doc.page.width -
              doc.page.margins.left -
              doc.page.margins.right -
              15,
          });
        yPosition = doc.y + 4;
      });
    }

    if (exp.technologies && exp.technologies.length > 0) {
      yPosition += 4;
      doc
        .font(estilos.textoSmall.font)
        .fontSize(9)
        .fillColor(CORES.textoTerciario)
        .text(`Tecnologias: ${exp.technologies.join(", ")}`, {
          indent: 10,
          y: yPosition,
          width:
            doc.page.width -
            doc.page.margins.left -
            doc.page.margins.right -
            10,
        });
      yPosition = doc.y + 2;
    }

    if (index < experiences.length - 1) {
      yPosition += estilos.espacamento.entreItens;
    }
  });

  return yPosition + estilos.espacamento.entreSecoes;
};

/**
 * Adiciona formação acadêmica
 */
const adicionarFormacao = (doc, education, estilos, yPosition) => {
  yPosition = verificarNovaPagina(doc, yPosition, 120);
  yPosition = escreverTituloSecao(doc, "Formação Acadêmica", estilos, yPosition);

  education.forEach((edu, index) => {
    yPosition = verificarNovaPagina(doc, yPosition, 60);

    doc
      .font(estilos.texto.font)
      .fontSize(estilos.texto.size)
      .fillColor(CORES.texto)
      .text(edu.degree, doc.x, yPosition);

    yPosition += estilos.espacamento.entreLinhas + 2;

    const periodo = `${formatarData(edu.startDate)} - ${formatarData(edu.endDate)}`;
    doc
      .font(estilos.textoSmall.font)
      .fontSize(estilos.textoSmall.size)
      .fillColor(CORES.textoSecundario)
      .text(`${edu.institution} | ${periodo}`, doc.x, yPosition);

    yPosition += estilos.espacamento.entreLinhas + 2;

    if (index < education.length - 1) {
      yPosition += estilos.espacamento.entreItens / 2;
    }
  });

  return yPosition + estilos.espacamento.entreSecoes;
};

/**
 * Adiciona certificações
 */
const adicionarCertificacoes = (doc, certifications, estilos, yPosition) => {
  yPosition = verificarNovaPagina(doc, yPosition, 100);
  yPosition = escreverTituloSecao(doc, "Certificações", estilos, yPosition);

  certifications.forEach((cert) => {
    yPosition = verificarNovaPagina(doc, yPosition, 30);

    doc
      .font(estilos.textoSmall.font)
      .fontSize(estilos.textoSmall.size)
      .fillColor(CORES.texto)
      .text(`• ${cert.name} - ${cert.issuer} (${cert.date})`, {
        indent: 10,
        y: yPosition,
      });
    yPosition = doc.y + estilos.espacamento.entreLinhas / 2;
  });

  return yPosition + estilos.espacamento.entreSecoes;
};

/**
 * Adiciona idiomas
 */
const adicionarIdiomas = (doc, languages, estilos, yPosition) => {
  yPosition = verificarNovaPagina(doc, yPosition, 80);
  yPosition = escreverTituloSecao(doc, "Idiomas", estilos, yPosition);

  languages.forEach((lang) => {
    yPosition = verificarNovaPagina(doc, yPosition, 25);

    doc
      .font(estilos.textoSmall.font)
      .fontSize(estilos.textoSmall.size)
      .fillColor(CORES.texto)
      .text(`• ${lang.language}: ${lang.level}`, {
        indent: 10,
        y: yPosition,
      });
    yPosition = doc.y + estilos.espacamento.entreLinhas / 2;
  });

  return yPosition + estilos.espacamento.entreSecoes;
};
