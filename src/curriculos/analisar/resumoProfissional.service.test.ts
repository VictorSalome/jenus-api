import {
  gerarResumo,
  obterSkillsDisponiveis,
  validarSkill,
} from "./resumoProfissional.service.js";

/**
 * Arquivo de teste para demonstrar o funcionamento do serviço de resumo profissional
 * Execute com: node src/services/resumoProfissionalService.test.js
 */

// Exemplo de uso conforme solicitado pelo usuário
const descricaoVaga = `
Buscamos Desenvolvedor Full Stack com experiência em React, Node.js, PostgreSQL,
AWS, Cypress e metodologias ágeis.
`;

console.log("=".repeat(80));
console.log("TESTE DO SERVIÇO DE RESUMO PROFISSIONAL DINÂMICO");
console.log("=".repeat(80));

try {
  const resumo = gerarResumo(descricaoVaga);

  console.log("\n📋 DESCRIÇÃO DA VAGA:");
  console.log(descricaoVaga.trim());

  console.log("\n🧠 SKILLS IDENTIFICADAS:");
  console.log(resumo.skills.join(", "));

  console.log("\n📄 RESUMO GERADO:");
  console.log(resumo.resumo);
} catch (error) {
  console.error("❌ Erro no teste:", error.message);
}

// Teste adicional com vaga sem skills conhecidas
console.log("\n" + "=".repeat(80));
console.log("TESTE COM VAGA SEM SKILLS CONHECIDAS");
console.log("=".repeat(80));

const vagaSemSkills = `
Buscamos desenvolvedor com experiência em Python, Django, Ruby on Rails,
Kubernetes e machine learning.
`;

try {
  const resumoSemSkills = gerarResumo(vagaSemSkills);

  console.log("\n📋 DESCRIÇÃO DA VAGA:");
  console.log(vagaSemSkills.trim());

  console.log("\n📄 RESUMO GERADO (sem skills conhecidas):");
  console.log(resumoSemSkills.resumo);
} catch (error) {
  console.error("❌ Erro no teste:", error.message);
}

// Teste das funções auxiliares
console.log("\n" + "=".repeat(80));
console.log("TESTE DAS FUNÇÕES AUXILIARES");
console.log("=".repeat(80));

console.log("\n🔧 Skills disponíveis (primeiras 10):");
const skills = obterSkillsDisponiveis();
console.log(skills.slice(0, 10).join(", "));
console.log(`... e mais ${skills.length - 10} skills`);

console.log("\n✅ Validação de skills:");
console.log("React está disponível:", validarSkill("React"));
console.log("Python está disponível:", validarSkill("Python"));
console.log("javascript está disponível:", validarSkill("javascript")); // teste case insensitive

console.log("\n" + "=".repeat(80));
console.log("TESTE CONCLUÍDO COM SUCESSO! 🎉");
console.log("=".repeat(80));
