import PDFDocument from "pdfkit";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { logInfo, logError } from "../utils/logger.js";
import { formatarData, formatarTelefone } from "../utils/formatters.js";

/**
 * Gera PDF do currículo seguindo normas ABNT
 * @param {Object} curriculo - Currículo personalizado
 * @param {Object} dadosVaga - Dados da vaga
 * @returns {string} Caminho do arquivo PDF gerado
 */
export const gerarPdfCurriculo = async (curriculo, dadosVaga) => {
  try {
    logInfo("Iniciando geração do PDF do currículo");

    // Criar diretório temp se não existir
    const tempDir = path.join(process.cwd(), process.env.TEMP_DIR || "temp");
    await fs.mkdir(tempDir, { recursive: true });

    // Nome do arquivo PDF (removendo acentos e caracteres especiais)
    const nomeLimpo = curriculo.personalInfo.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, "_")
      .toLowerCase();
    const nomeArquivo = `curriculo_${nomeLimpo}_${Date.now()}.pdf`;
    const caminhoArquivo = path.join(tempDir, nomeArquivo);

    // Criar documento PDF
    const doc = new PDFDocument({
      size: "A4",
      margins: {
        top: 50, // 1.8cm
        bottom: 50, // 1.8cm
        left: 50, // 1.8cm
        right: 50, // 1.8cm
      },
      info: {
        Title: `Currículo - ${curriculo.personalInfo.name}`,
        Author: curriculo.personalInfo.name,
        Subject: `Candidatura para: ${dadosVaga.titulo}`,
        Creator: "Sistema de Currículo Automatizado",
      },
      bufferPages: true,
    });

    // Stream para arquivo
    const stream = doc.pipe(createWriteStream(caminhoArquivo));

    // Configurações de fonte e estilo ABNT melhoradas
    const estilos = {
      nomeCompleto: { font: "Helvetica-Bold", size: 18 },
      titulo: { font: "Helvetica-Bold", size: 14 },
      subtitulo: { font: "Helvetica-Bold", size: 12 },
      texto: { font: "Helvetica", size: 11 },
      textoSmall: { font: "Helvetica", size: 10 },
      contato: { font: "Helvetica", size: 10 },
      espacamento: {
        entreSecoes: 35,
        entreItens: 20,
        entreLinhas: 10,
        cabecalho: 25,
        aposTitulo: 30,
      },
    };

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

    logInfo("PDF gerado com sucesso", { arquivo: nomeArquivo });
    return caminhoArquivo;
  } catch (error) {
    logError("Erro na geração do PDF", error);
    throw error;
  }
};

/**
 * Adiciona cabeçalho com informações pessoais
 */
const adicionarCabecalho = (doc, personalInfo, estilos, yPosition) => {
  const pageWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Nome completo em destaque (similar à segunda imagem)
  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor("black")
    .text(`${personalInfo.name} Sousa`, doc.page.margins.left, yPosition);

  yPosition += 30;

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

  // Adicionar informações de contato em linhas separadas (mais limpo)
  doc.font("Helvetica").fontSize(10).fillColor("black");

  contatos.forEach((contato, index) => {
    doc.text(contato, doc.page.margins.left, yPosition + index * 12);
  });

  yPosition += contatos.length * 12 + 25;

  // Linha separadora simples
  doc
    .strokeColor("black")
    .lineWidth(1)
    .moveTo(doc.page.margins.left, yPosition)
    .lineTo(doc.page.width - doc.page.margins.right, yPosition)
    .stroke();

  return yPosition + 25;
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
  // Verificar se precisa de nova página
  yPosition = verificarNovaPagina(doc, yPosition, 120);

  // Título da seção com formatação limpa
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("black")
    .text(titulo, doc.page.margins.left, yPosition);

  // Linha sublinhada simples
  const tituloWidth = doc.widthOfString(titulo);
  doc
    .strokeColor("black")
    .lineWidth(0.8)
    .moveTo(doc.page.margins.left, yPosition + 14)
    .lineTo(doc.page.margins.left + tituloWidth, yPosition + 14)
    .stroke();

  // Espaçamento padrão para todas as seções
  yPosition += 25;

  // Conteúdo
  doc.font(estilos.texto.font).fontSize(estilos.texto.size).fillColor("black");

  if (tipo === "paragrafo") {
    doc.text(conteudo, {
      align: "justify",
      lineGap: 4,
      y: yPosition,
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      indent: 0,
    });
    yPosition = doc.y + estilos.espacamento.entreSecoes + 10;
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
  // Verificar se precisa de nova página
  yPosition = verificarNovaPagina(doc, yPosition, 80);

  // Título da seção
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("black")
    .text("Áreas de Atuação", doc.page.margins.left, yPosition);

  // Linha sublinhada
  const tituloWidth = doc.widthOfString("Áreas de Atuação");
  doc
    .strokeColor("black")
    .lineWidth(0.8)
    .moveTo(doc.page.margins.left, yPosition + 14)
    .lineTo(doc.page.margins.left + tituloWidth, yPosition + 14)
    .stroke();

  yPosition += 25;

  // Listar especializações
  doc.font("Helvetica").fontSize(11).fillColor("black");

  especializacoes.forEach((esp, index) => {
    // Verificar se precisa de nova página
    yPosition = verificarNovaPagina(doc, yPosition, 30);

    doc.text(`• ${esp}`, doc.page.margins.left, yPosition);
    yPosition += 16;
  });

  return yPosition + estilos.espacamento.entreSecoes;
};

/**
 * Adiciona seção de habilidades técnicas
 */
const adicionarHabilidades = (
  doc,
  skills,
  matchingSkills,
  estilos,
  yPosition,
) => {
  // Verificar se precisa de nova página
  yPosition = verificarNovaPagina(doc, yPosition, 150);

  // Título da seção
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("black")
    .text("Habilidades Técnicas", doc.page.margins.left, yPosition);

  // Linha sublinhada
  const tituloWidth = doc.widthOfString("Habilidades Técnicas");
  doc
    .strokeColor("black")
    .lineWidth(0.8)
    .moveTo(doc.page.margins.left, yPosition + 14)
    .lineTo(doc.page.margins.left + tituloWidth, yPosition + 14)
    .stroke();

  yPosition += 25;

  // Organizar habilidades por categoria
  const categorias = {
    "Stack Principal": skills.stackPrincipal || [],
    "Front-end": skills.frontEnd || skills.frameworks || [],
    "Back-end": skills.backEnd || [],
    "Banco de Dados": skills.databases || [],
    "Cloud e DevOps": skills.cloudDevOps || skills.cloud || [],
    "Testes e Qualidade": skills.testing || [],
    Integrações: skills.integrations || [],
    "Arquitetura e Boas Práticas":
      skills.architecture || skills.methodologies || [],
    "Gerenciamento de Estado": skills.stateManagement || [],
    "Conhecimentos Adicionais": skills.additionalKnowledge || [],
  };

  Object.entries(categorias).forEach(([categoria, habilidades]) => {
    if (habilidades.length > 0) {
      // Verificar se precisa de nova página
      yPosition = verificarNovaPagina(doc, yPosition, 80);

      // Nome da categoria com formatação melhorada
      doc
        .font(estilos.texto.font)
        .fontSize(estilos.texto.size)
        .fillColor("#333333")
        .text(`${categoria}:`, doc.x, yPosition);

      yPosition += estilos.espacamento.entreLinhas + 4;

      // Habilidades (destacar as relevantes)
      const habilidadesTexto = habilidades
        .map((skill) => {
          const isRelevant = matchingSkills && matchingSkills.includes(skill);
          return isRelevant ? `${skill} ★` : skill;
        })
        .join(" • ");

      doc
        .font(estilos.textoSmall.font)
        .fontSize(estilos.textoSmall.size)
        .fillColor("black")
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

      yPosition = doc.y + estilos.espacamento.entreLinhas + 4;
    }
  });

  return yPosition + estilos.espacamento.entreSecoes;
};

/**
 * Adiciona experiências profissionais
 */
const adicionarExperiencias = (doc, experiences, estilos, yPosition) => {
  // Verificar se precisa de nova página
  yPosition = verificarNovaPagina(doc, yPosition, 150);

  // Título da seção
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("black")
    .text("Experiência Profissional", doc.page.margins.left, yPosition);

  // Linha sublinhada
  const tituloWidth = doc.widthOfString("Experiência Profissional");
  doc
    .strokeColor("black")
    .lineWidth(0.8)
    .moveTo(doc.page.margins.left, yPosition + 14)
    .lineTo(doc.page.margins.left + tituloWidth, yPosition + 14)
    .stroke();

  yPosition += 25;

  experiences.forEach((exp, index) => {
    // Verificar se precisa de nova página para cada experiência
    yPosition = verificarNovaPagina(doc, yPosition, 120);

    // Cargo e empresa com formatação melhorada
    doc
      .font(estilos.texto.font)
      .fontSize(estilos.texto.size)
      .fillColor("black")
      .text(`${exp.position} - ${exp.company}`, doc.x, yPosition);

    yPosition += estilos.espacamento.entreLinhas + 3;

    // Período e localização
    const periodo = `${formatarData(exp.startDate)} - ${exp.endDate === "present" ? "Atual" : formatarData(exp.endDate)}`;
    doc
      .font(estilos.textoSmall.font)
      .fontSize(estilos.textoSmall.size)
      .fillColor("#666666")
      .text(`${periodo} | ${exp.location}`, doc.x, yPosition);

    yPosition += estilos.espacamento.entreLinhas + 4;

    // Descrição
    if (exp.description) {
      doc
        .font(estilos.textoSmall.font)
        .fontSize(estilos.textoSmall.size)
        .fillColor("black")
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

    // Principais realizações
    if (exp.achievements && exp.achievements.length > 0) {
      exp.achievements.slice(0, 4).forEach((achievement) => {
        doc
          .font(estilos.textoSmall.font)
          .fontSize(estilos.textoSmall.size)
          .fillColor("black")
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

    // Tecnologias utilizadas
    if (exp.technologies && exp.technologies.length > 0) {
      yPosition += 4;
      doc
        .font(estilos.textoSmall.font)
        .fontSize(9)
        .fillColor("gray")
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
  // Verificar se precisa de nova página
  yPosition = verificarNovaPagina(doc, yPosition, 120);

  // Título da seção
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("black")
    .text("Formação Acadêmica", doc.page.margins.left, yPosition);

  // Linha sublinhada
  const tituloWidth = doc.widthOfString("Formação Acadêmica");
  doc
    .strokeColor("black")
    .lineWidth(0.8)
    .moveTo(doc.page.margins.left, yPosition + 14)
    .lineTo(doc.page.margins.left + tituloWidth, yPosition + 14)
    .stroke();

  yPosition += 25;

  education.forEach((edu, index) => {
    // Verificar espaço para cada formação
    yPosition = verificarNovaPagina(doc, yPosition, 60);

    // Curso
    doc
      .font(estilos.texto.font)
      .fontSize(estilos.texto.size)
      .fillColor("black")
      .text(edu.degree, doc.x, yPosition);

    yPosition += estilos.espacamento.entreLinhas + 2;

    // Instituição e período
    const periodo = `${formatarData(edu.startDate)} - ${formatarData(edu.endDate)}`;
    doc
      .font(estilos.textoSmall.font)
      .fontSize(estilos.textoSmall.size)
      .fillColor("gray")
      .text(`${edu.institution} | ${periodo}`, doc.x, yPosition);

    yPosition += estilos.espacamento.entreLinhas + 2;

    // Espaçamento entre formações
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
  // Verificar se precisa de nova página
  yPosition = verificarNovaPagina(doc, yPosition, 100);

  // Título da seção
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("black")
    .text("Certificações", doc.page.margins.left, yPosition);

  // Linha sublinhada
  const tituloWidth = doc.widthOfString("Certificações");
  doc
    .strokeColor("black")
    .lineWidth(0.8)
    .moveTo(doc.page.margins.left, yPosition + 14)
    .lineTo(doc.page.margins.left + tituloWidth, yPosition + 14)
    .stroke();

  yPosition += 25;

  certifications.forEach((cert) => {
    // Verificar espaço para cada certificação
    yPosition = verificarNovaPagina(doc, yPosition, 30);

    doc
      .font(estilos.textoSmall.font)
      .fontSize(estilos.textoSmall.size)
      .fillColor("black")
      .text(`• ${cert.name} - ${cert.issuer} (${cert.date})`, {
        indent: 10,
        y: yPosition,
      });
    yPosition = doc.y + 4;
  });

  return yPosition + estilos.espacamento.entreSecoes;
};

/**
 * Adiciona idiomas
 */
const adicionarIdiomas = (doc, languages, estilos, yPosition) => {
  // Verificar se precisa de nova página
  yPosition = verificarNovaPagina(doc, yPosition, 80);

  // Título da seção
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("black")
    .text("Idiomas", doc.page.margins.left, yPosition);

  // Linha sublinhada
  const tituloWidth = doc.widthOfString("Idiomas");
  doc
    .strokeColor("black")
    .lineWidth(0.8)
    .moveTo(doc.page.margins.left, yPosition + 14)
    .lineTo(doc.page.margins.left + tituloWidth, yPosition + 14)
    .stroke();

  yPosition += 25;

  languages.forEach((lang) => {
    // Verificar espaço para cada idioma
    yPosition = verificarNovaPagina(doc, yPosition, 25);

    doc
      .font(estilos.textoSmall.font)
      .fontSize(estilos.textoSmall.size)
      .fillColor("black")
      .text(`• ${lang.language}: ${lang.level}`, {
        indent: 10,
        y: yPosition,
      });
    yPosition = doc.y + 4;
  });

  return yPosition + estilos.espacamento.entreSecoes;
};
