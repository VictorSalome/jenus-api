import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { logInfo, logError, logWarn } from "../utils/logger.js";
import { personalizarCurriculo } from "../analisar/curriculoPersonalizador.service.js";
import { gerarPdfCurriculo } from "../pdf/pdfGenerator.service.js";
import {
  enviarCurriculo,
  validarConfiguracaoEmail,
} from "../email/email.service.js";
import { gerarResumo } from "../analisar/resumoProfissional.service.js";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import config from "../config/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Carrega os dados do candidato do arquivo JSON
 * @returns {Object} Dados do candidato
 */
const carregarDadosCandidato = async () => {
  try {
    const candidateProfilePath = config.paths.candidateProfile;
    const data = await fs.readFile(candidateProfilePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    logError("Erro ao carregar dados do candidato", error);
    throw new Error("Falha ao carregar dados do candidato");
  }
};

/**
 * Formata data para exibição
 * @param {string} dateString - Data em formato ISO
 * @returns {string} Data formatada
 */
const formatarData = (dateString) => {
  if (dateString === "present") return "Atual";

  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR", {
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
};

/**
 * Gera HTML do currículo formatado segundo normas ABNT
 * @param {Object} candidato - Dados do candidato
 * @returns {string} HTML formatado
 */
const gerarCurriculoHTML = (candidato) => {
  const {
    personalInfo,
    experiences,
    education,
    certifications,
    skills,
    languages,
  } = candidato;

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Currículo - ${personalInfo.name}</title>
    <style>
        /* Estilos baseados nas normas ABNT para documentos acadêmicos */
        body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 12pt;
            line-height: 1.5;
            color: #000;
            max-width: 210mm;
            margin: 0 auto;
            padding: 30mm 20mm 20mm 30mm; /* Margens ABNT: superior 3cm, esquerda 3cm, direita 2cm, inferior 2cm */
            background-color: #fff;
        }
        
        .cabecalho {
            text-align: center;
            margin-bottom: 30pt;
            border-bottom: 1pt solid #000;
            padding-bottom: 15pt;
        }
        
        .nome-principal {
            font-size: 16pt;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 10pt;
            letter-spacing: 1pt;
        }
        
        .titulo-profissional {
            font-size: 12pt;
            font-style: italic;
            margin-bottom: 15pt;
            color: #333;
        }
        
        .dados-contato {
            font-size: 11pt;
            line-height: 1.3;
        }
        
        .secao {
            margin-bottom: 25pt;
            page-break-inside: avoid;
        }
        
        .titulo-secao {
            font-size: 14pt;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 12pt;
            border-bottom: 0.5pt solid #333;
            padding-bottom: 3pt;
            letter-spacing: 0.5pt;
        }
        
        .resumo-profissional {
            text-align: justify;
            text-indent: 1.25cm; /* Parágrafo com recuo de 1,25cm conforme ABNT */
            margin-bottom: 12pt;
        }
        
        .experiencia-item {
            margin-bottom: 20pt;
            border-left: 2pt solid #e0e0e0;
            padding-left: 15pt;
        }
        
        .cargo-empresa {
            font-weight: bold;
            font-size: 12pt;
            margin-bottom: 3pt;
        }
        
        .periodo-local {
            font-size: 11pt;
            color: #666;
            margin-bottom: 8pt;
            font-style: italic;
        }
        
        .descricao-cargo {
            text-align: justify;
            margin-bottom: 8pt;
        }
        
        .realizacoes {
            margin-left: 15pt;
        }
        
        .realizacoes li {
            margin-bottom: 5pt;
            text-align: justify;
        }
        
        .tecnologias {
            font-size: 10pt;
            color: #555;
            font-style: italic;
            margin-top: 8pt;
        }
        
        .educacao-item {
            margin-bottom: 15pt;
        }
        
        .curso-instituicao {
            font-weight: bold;
            margin-bottom: 3pt;
        }
        
        .certificacao-item {
            margin-bottom: 10pt;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .habilidades-categoria {
            margin-bottom: 12pt;
        }
        
        .categoria-titulo {
            font-weight: bold;
            margin-bottom: 5pt;
            color: #333;
        }
        
        .habilidades-lista {
            margin-left: 15pt;
            color: #555;
        }
        
        .idiomas-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8pt;
            padding: 5pt;
            background-color: #f9f9f9;
        }
        
        /* Quebras de página para impressão */
        @media print {
            body {
                margin: 0;
                padding: 30mm 20mm 20mm 30mm;
            }
            .secao {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <!-- CABEÇALHO -->
    <div class="cabecalho">
        <div class="nome-principal">${personalInfo.name}</div>
        <div class="titulo-profissional">${personalInfo.title}</div>
        <div class="dados-contato">
            <strong>E-mail:</strong> ${personalInfo.email}<br>
            <strong>Telefone:</strong> ${personalInfo.phone}<br>
            <strong>Localização:</strong> ${personalInfo.location}<br>
            ${personalInfo.linkedin ? `<strong>LinkedIn:</strong> ${personalInfo.linkedin}<br>` : ""}
            ${personalInfo.github ? `<strong>GitHub:</strong> ${personalInfo.github}<br>` : ""}
            ${personalInfo.portfolio ? `<strong>Portfólio:</strong> ${personalInfo.portfolio}` : ""}
        </div>
    </div>

    <!-- RESUMO PROFISSIONAL -->
    <div class="secao">
        <div class="titulo-secao">Resumo Profissional</div>
        <div class="resumo-profissional">
            ${personalInfo.summary}
        </div>
    </div>

    <!-- EXPERIÊNCIA PROFISSIONAL -->
    <div class="secao">
        <div class="titulo-secao">Experiência Profissional</div>
        ${experiences
          .map(
            (exp) => `
            <div class="experiencia-item">
                <div class="cargo-empresa">${exp.position} - ${exp.company}</div>
                <div class="periodo-local">
                    ${formatarData(exp.startDate)} - ${formatarData(exp.endDate)} | ${exp.location}
                </div>
                <div class="descricao-cargo">${exp.description}</div>
                ${
                  exp.achievements && exp.achievements.length > 0
                    ? `
                    <ul class="realizacoes">
                        ${exp.achievements.map((achievement) => `<li>${achievement}</li>`).join("")}
                    </ul>
                `
                    : ""
                }
                ${
                  exp.technologies && exp.technologies.length > 0
                    ? `
                    <div class="tecnologias">
                        <strong>Tecnologias:</strong> ${exp.technologies.join(", ")}
                    </div>
                `
                    : ""
                }
            </div>
        `,
          )
          .join("")}
    </div>

    <!-- FORMAÇÃO ACADÊMICA -->
    <div class="secao">
        <div class="titulo-secao">Formação Acadêmica</div>
        ${education
          .map(
            (edu) => `
            <div class="educacao-item">
                <div class="curso-instituicao">${edu.degree}</div>
                <div class="periodo-local">
                    ${edu.institution} | ${formatarData(edu.startDate)} - ${formatarData(edu.endDate)}
                </div>
                ${edu.location ? `<div>${edu.location}</div>` : ""}
            </div>
        `,
          )
          .join("")}
    </div>

    <!-- CERTIFICAÇÕES -->
    ${
      certifications && certifications.length > 0
        ? `
        <div class="secao">
            <div class="titulo-secao">Certificações</div>
            ${certifications
              .map(
                (cert) => `
                <div class="certificacao-item">
                    <div>
                        <strong>${cert.name}</strong><br>
                        <span style="color: #666;">${cert.issuer}</span>
                    </div>
                    <div style="color: #666; font-style: italic;">${cert.date}</div>
                </div>
            `,
              )
              .join("")}
        </div>
    `
        : ""
    }

    <!-- HABILIDADES TÉCNICAS -->
    <div class="secao">
        <div class="titulo-secao">Habilidades Técnicas</div>
        
        <div class="habilidades-categoria">
            <div class="categoria-titulo">Linguagens de Programação:</div>
            <div class="habilidades-lista">${skills.programming.join(" • ")}</div>
        </div>
        
        <div class="habilidades-categoria">
            <div class="categoria-titulo">Frameworks e Bibliotecas:</div>
            <div class="habilidades-lista">${skills.frameworks.join(" • ")}</div>
        </div>
        
        <div class="habilidades-categoria">
            <div class="categoria-titulo">Bancos de Dados:</div>
            <div class="habilidades-lista">${skills.databases.join(" • ")}</div>
        </div>
        
        <div class="habilidades-categoria">
            <div class="categoria-titulo">Ferramentas e Tecnologias:</div>
            <div class="habilidades-lista">${skills.tools.join(" • ")}</div>
        </div>
        
        <div class="habilidades-categoria">
            <div class="categoria-titulo">Estilização:</div>
            <div class="habilidades-lista">${skills.styling.join(" • ")}</div>
        </div>
        
        <div class="habilidades-categoria">
            <div class="categoria-titulo">Cloud e DevOps:</div>
            <div class="habilidades-lista">${skills.cloud.join(" • ")}</div>
        </div>
        
        <div class="habilidades-categoria">
            <div class="categoria-titulo">Metodologias:</div>
            <div class="habilidades-lista">${skills.methodologies.join(" • ")}</div>
        </div>
        
        <div class="habilidades-categoria">
            <div class="categoria-titulo">Integrações:</div>
            <div class="habilidades-lista">${skills.integrations?.join(" • ") || ""}</div>
        </div>
        
        ${
          skills.aiAutomation && skills.aiAutomation.length > 0
            ? `
        <div class="habilidades-categoria">
            <div class="categoria-titulo">IA & Automação:</div>
            <div class="habilidades-lista">${skills.aiAutomation.join(" • ")}</div>
        </div>
        `
            : ""
        }
    </div>

    <!-- IDIOMAS -->
    ${
      languages && languages.length > 0
        ? `
        <div class="secao">
            <div class="titulo-secao">Idiomas</div>
            ${languages
              .map(
                (lang) => `
                <div class="idiomas-item">
                    <strong>${lang.language}</strong>
                    <span>${lang.level}</span>
                </div>
            `,
              )
              .join("")}
        </div>
    `
        : ""
    }

</body>
</html>
  `;
};

/**
 * Cria dados simulados de uma vaga para teste
 * @returns {Object} Dados simulados da vaga
 */
const criarVagaSimulada = () => {
  return {
    titulo: "Desenvolvedor Full Stack Sênior - TESTE",
    empresa: "TechCorp Inovação Ltda",
    emailContato: process.env.EMAIL_TESTE || "teste@techcorp.com.br",
    descricao: `Estamos buscando um Desenvolvedor Full Stack Sênior para integrar nossa equipe de tecnologia.
    
    Responsabilidades:
    - Desenvolver aplicações web modernas usando React.js e Node.js
    - Implementar APIs RESTful e integração com bancos de dados
    - Trabalhar com metodologias ágeis (Scrum/Kanban)
    - Colaborar com equipes multidisciplinares
    - Garantir qualidade do código através de testes automatizados
    
    Requisitos:
    - Experiência sólida com JavaScript, React, Node.js
    - Conhecimento em bancos de dados relacionais e NoSQL
    - Experiência com Git, Docker e ferramentas de CI/CD
    - Inglês intermediário
    - Experiência com metodologias ágeis
    
    Diferenciais:
    - Conhecimento em AWS ou outras plataformas de nuvem
    - Experiência com TypeScript
    - Conhecimento em testes automatizados (Jest, Cypress)
    - Experiência com arquitetura de microsserviços`,
    // Campos necessários para o curriculoPersonalizadorService.js
    stackTecnologica: [
      "JavaScript",
      "React",
      "Node.js",
      "Express",
      "MongoDB",
      "PostgreSQL",
      "Docker",
      "AWS",
      "TypeScript",
      "Jest",
      "Git",
    ],
    areaAtuacao: "desenvolvimento",
    nivel: "Sênior",
    responsabilidades: [
      "Desenvolver aplicações web modernas",
      "Implementar APIs RESTful",
      "Integração com bancos de dados",
      "Trabalhar com metodologias ágeis",
      "Colaborar com equipes multidisciplinares",
      "Garantir qualidade do código através de testes automatizados",
    ],
    requisitosObrigatorios: [
      "JavaScript avançado",
      "React.js",
      "Node.js",
      "Express.js",
      "MongoDB",
      "PostgreSQL",
      "Git",
      "Docker",
      "AWS",
      "TypeScript",
      "Jest",
      "Metodologias Ágeis",
    ],
    requisitos: [
      "JavaScript avançado",
      "React.js",
      "Node.js",
      "Express.js",
      "MongoDB",
      "PostgreSQL",
      "Git",
      "Docker",
      "AWS",
      "TypeScript",
      "Jest",
      "Metodologias Ágeis",
    ],
    beneficios: [
      "Salário competitivo",
      "Vale refeição",
      "Plano de saúde",
      "Home office flexível",
      "Horário flexível",
      "Programa de capacitação",
    ],
    localizacao: "São Paulo, SP (Híbrido)",
    tipoContrato: "CLT",
    salario: "R$ 8.000 - R$ 12.000",
  };
};

/**
 * Controller para enviar currículo usando o fluxo completo (igual à rota padrão)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const enviarCurriculoTesteHTML = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const requestId = `teste-${Date.now()}`;

  logInfo("Iniciando teste de envio de currículo completo", { requestId });

  // 1. Carregar dados do candidato
  const candidato = await carregarDadosCandidato();

  // 2. Criar dados simulados da vaga
  const dadosVaga = criarVagaSimulada();

  // 2.1. Gerar resumo profissional dinâmico para demonstração
  const descricaoVagaCompleta = `${dadosVaga.titulo} ${dadosVaga.descricao} ${dadosVaga.stackTecnologica.join(" ")} ${dadosVaga.requisitos.join(" ")}`;
  const resumosDinamicos = gerarResumo(descricaoVagaCompleta);

  logInfo("Dados da vaga simulada criados", {
    vaga: dadosVaga.titulo,
    email: dadosVaga.emailContato,
    resumosGerados: Object.keys(resumosDinamicos),
    requestId,
  });

  // 3. Personalizar currículo usando o serviço real
  logInfo("Personalizando currículo para vaga teste", { requestId });
  const curriculoPersonalizado = await personalizarCurriculo(dadosVaga);

  // 4. Gerar PDF usando o serviço real
  logInfo("Gerando PDF do currículo personalizado", { requestId });
  const caminhoArquivoPdf = await gerarPdfCurriculo(
    curriculoPersonalizado,
    dadosVaga,
  );

  // 5. Verificar configuração de e-mail
  if (!validarConfiguracaoEmail()) {
    logWarn("Configuração de e-mail não disponível, simulando envio", {
      requestId,
    });

    if (config.server.env === "production") {
      throw new AppError("Serviço de e-mail não configurado", 503);
    }
  }

  // 6. Enviar por e-mail usando o serviço real
  const emailDestino = req.body.email || candidato.personalInfo.email;

  logInfo("Enviando currículo teste por e-mail", {
    destino: emailDestino,
    requestId,
  });

  let resultadoEmail;
  try {
    resultadoEmail = await enviarCurriculo(
      emailDestino,
      caminhoArquivoPdf,
      dadosVaga,
      curriculoPersonalizado.personalInfo,
    );
  } catch (emailError) {
    logError("Erro no envio de e-mail teste", emailError);

    // Em desenvolvimento, continuar mesmo com erro de e-mail
    if (config.server.env === "development") {
      logWarn("Continuando sem envio de e-mail (modo desenvolvimento)", {
        requestId,
      });
      resultadoEmail = {
        sucesso: false,
        messageId: "dev-mode-no-email",
        erro: emailError.message,
      };
    } else {
      throw new AppError(
        `Falha no envio do e-mail: ${emailError.message}`,
        503,
      );
    }
  }

  // 7. Limpar arquivo temporário
  try {
    await fs.unlink(caminhoArquivoPdf);
    logInfo("Arquivo temporário removido", {
      arquivo: path.basename(caminhoArquivoPdf),
      requestId,
    });
  } catch (error) {
    logWarn("Erro ao remover arquivo temporário", {
      error: error.message,
      requestId,
    });
  }

  // 8. Calcular tempo de processamento
  const processingTime = Date.now() - startTime;

  // 9. Resposta de sucesso
  const nomeArquivo = path.basename(caminhoArquivoPdf);

  const response = {
    status: "success",
    tipo: "TESTE DE CANDIDATURA",
    vaga: dadosVaga.titulo,
    emailDestino: emailDestino,
    curriculoGerado: nomeArquivo,
    mensagem: "Teste de currículo personalizado gerado e enviado com sucesso.",
    detalhes: {
      relevancia: `${curriculoPersonalizado.relevanceScore}%`,
      tecnologiasEncontradas:
        curriculoPersonalizado.matchingSkills?.length || 0,
      experienciasRelevantes: curriculoPersonalizado.experiences?.length || 0,
      tempoProcessamento: `${processingTime}ms`,
      timestamp: new Date().toISOString(),
    },
    dadosVagaSimulada: {
      titulo: dadosVaga.titulo,
      empresa: dadosVaga.empresa,
      localizacao: dadosVaga.localizacao,
      requisitosEncontrados: curriculoPersonalizado.matchingSkills || [],
    },
    resumosProfissionais: {
      curto: resumosDinamicos.curto,
      medio: resumosDinamicos.medio,
      longo: resumosDinamicos.longo,
      resumoUsado: "medio",
    },
    requestId,
  };

  // Adicionar informações do e-mail se disponível
  if (resultadoEmail) {
    response.email = {
      enviado: resultadoEmail.sucesso,
      messageId: resultadoEmail.messageId,
    };

    if (resultadoEmail.previewUrl && config.server.env === "development") {
      response.email.previewUrl = resultadoEmail.previewUrl;
    }

    if (resultadoEmail.erro) {
      response.email.erro = resultadoEmail.erro;
    }
  }

  logInfo("Teste de candidatura concluído com sucesso", {
    vaga: dadosVaga.titulo,
    relevancia: curriculoPersonalizado.relevanceScore,
    tempoProcessamento: processingTime,
    requestId,
  });

  res.json(response);
});

/**
 * Controller para visualizar o HTML do currículo (para debug)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const visualizarCurriculoHTML = async (req, res) => {
  try {
    logInfo("Gerando visualização do currículo HTML");

    // Carregar dados do candidato
    const candidato = await carregarDadosCandidato();

    // Gerar HTML do currículo
    const curriculoHTML = gerarCurriculoHTML(candidato);

    // Retornar HTML diretamente para visualização no navegador
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(curriculoHTML);
  } catch (error) {
    logError("Erro na geração do currículo HTML", error);

    res.status(500).json({
      status: "erro",
      mensagem: "Falha na geração do currículo HTML",
      erro: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};
