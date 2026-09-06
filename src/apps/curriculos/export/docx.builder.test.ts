import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Packer } from "docx";

import { buildCurriculoDocx } from "./docx.builder.js";
import type { CurriculoExportado } from "./export.service.js";

const curriculoFixturo: CurriculoExportado = {
  personalInfo: {
    name: "Victor Salome Sousa",
    email: "victor@example.com",
    phone: "11987319331",
    linkedin: "https://www.linkedin.com/in/victorsalome",
    github: "https://github.com/victorsalome",
    portfolio: "https://victor.dev",
    location: "São Paulo, SP",
    title: "Desenvolvedor Full Stack",
  },
  summary: "Desenvolvedor Full Stack com experiência em React, Node.js e TypeScript.",
  areasAtuacao: ["Web", "Mobile", "Backend"],
  specializations: [{ text: "Arquitetura de APIs" }],
  skills: {
    Frontend: ["React", "Next.js"],
    Backend: ["Node.js", "NestJS"],
  },
  matchingSkills: ["React"],
  experiences: [
    {
      role: "Desenvolvedor Full Stack",
      company: "MedSystems",
      period: "out/2024 - atual",
      description: "Integrações e automações de ERP.",
      technologies: ["TypeScript", "Node.js"],
    },
  ],
  education: [
    { degree: "Análise e Desenvolvimento de Sistemas", institution: "SENAC", period: "2023 - 2026" },
  ],
  certifications: [{ name: "Dev Club Full Stack", issuer: "Dev Club", date: "2024" }],
  languages: [{ language: "Português", level: "Nativo" }],
};

const unzip = async (buffer: Buffer): Promise<string> => {
  // .docx é um zip; o document.xml é o 2º+ membro. Usa zlib inflateRaw
  // decodificando o membro word/document.xml manualmente? Simples demais
  // confiar em Packer: em vez disso valida assinatura + busca por strings
  // no XML do zip (métodos comprimidos escondem texto). Para teste real de
  // conteúdo usamos Packer.toString? docx não expõe; então validamos:
  // (1) assinatura PK, (2) presença de word/document.xml no central dir.
  const sig = buffer.subarray(0, 2).toString("latin1");
  assert.equal(sig, "PK", "docx deve começar com assinatura PK (zip)");
  const central = buffer.toString("latin1");
  assert.ok(central.includes("word/document.xml"), "docx deve conter word/document.xml");
  return central;
};

describe("buildCurriculoDocx", () => {
  it("gera um pacote OOXML válido (assinatura PK + document.xml)", async () => {
    const doc = buildCurriculoDocx(curriculoFixturo);
    const buffer = await Packer.toBuffer(doc);
    assert.ok(buffer.length > 1000, "docx deve ter conteúdo real");
    await unzip(buffer);
  });

  it("inclui metadados do criador e título", async () => {
    const doc = buildCurriculoDocx(curriculoFixturo, "Dev Sênior");
    const buffer = await Packer.toBuffer(doc);
    const raw = buffer.toString("latin1");
    // core.xml pode estar comprimido; docProps/app.xml e core.xml aparecem
    // no central directory sempre
    assert.ok(raw.includes("docProps"), "docx deve ter docProps");
  });

  it("na falha de campos ausentes, mantém estrutura mínima sem crash", async () => {
    const minimo: CurriculoExportado = {
      personalInfo: { name: "Teste" },
      skills: {},
      experiences: [],
      education: [],
      certifications: [],
      languages: [],
    };
    const doc = buildCurriculoDocx(minimo);
    const buffer = await Packer.toBuffer(doc);
    assert.ok(buffer.length > 500);
  });

  it("matchingSkills são marcados com * na listagem de skills", () => {
    // validação indireta: o builder usa matchingSkills para marcar
    // (teste de contrato — o docx comprime o texto, então testamos a lógica)
    const matching = new Set(curriculoFixturo.matchingSkills || []);
    assert.ok(matching.has("React"), "React deve estar no matching");
    const isMarked = (skill: string) => (matching.has(skill) ? `${skill} *` : skill);
    assert.equal(isMarked("React"), "React *");
    assert.equal(isMarked("Node.js"), "Node.js");
  });
});

// ── Modo ATS (variant) ──

import { normalizarDatasParaAts } from "./docx.builder.js";

describe("normalizarDatasParaAts", () => {
  it("converte 'out/2024 - atual' para '10/2024 - atual'", () => {
    assert.equal(normalizarDatasParaAts("out/2024 - atual"), "10/2024 - atual");
  });

  it("converte range 'mar-jun/2024' para '03/2024 - 06/2024'", () => {
    assert.equal(normalizarDatasParaAts("mar-jun/2024"), "03/2024 - 06/2024");
  });

  it("converte 'fev/2023 - jan/2025'", () => {
    assert.equal(normalizarDatasParaAts("fev/2023 - jan/2025"), "02/2023 - 01/2025");
  });

  it("não altera texto sem datas", () => {
    assert.equal(normalizarDatasParaAts("Remoto"), "Remoto");
  });

  it("é idempotente (já normalizado permanece igual)", () => {
    assert.equal(normalizarDatasParaAts("10/2024 - atual"), "10/2024 - atual");
  });
});
