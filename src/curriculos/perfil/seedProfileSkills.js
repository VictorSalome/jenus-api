/**
 * Seed script para popular profile_skills a partir do candidate-profile.json
 * Executar com: node src/curriculos/perfil/seedProfileSkills.js
 */

import { getDb } from "../../core/database.ts";

const candidateProfile = {
  skills: {
    programming: ["JavaScript", "TypeScript", "C#", ".NET", "Python"],
    frameworks: ["React", "Node.js", "Express", ".NET Core", "ASP.NET"],
    databases: ["PostgreSQL", "MySQL", "MongoDB", "SQL Server", "SQLite"],
    methodologies: ["Agile", "Scrum", "TDD", "CI/CD"],
    testing: ["Jest", "React Testing Library", "xUnit", "Moq"],
    devops: ["Docker", "Git", "GitHub Actions", "Azure DevOps"],
  },
};

async function seedProfileSkills() {
  const db = await getDb();
  
  console.log("Iniciando seed de profile_skills...");
  
  // Limpar tabela existente (opcional - comentar se quiser preservar)
  // await db.run("DELETE FROM profile_skills");
  
  let inserted = 0;
  let skipped = 0;
  
  for (const [category, techs] of Object.entries(candidateProfile.skills)) {
    for (const tech of techs) {
      try {
        await db.run(
          "INSERT OR IGNORE INTO profile_skills (category, tech) VALUES (?, ?)",
          category,
          tech
        );
        inserted++;
      } catch (error) {
        console.warn(`Erro ao inserir ${category}/${tech}:`, error.message);
        skipped++;
      }
    }
  }
  
  const total = await db.get("SELECT COUNT(*) as count FROM profile_skills");
  
  console.log(`Seed concluído!`);
  console.log(`  Inseridos: ${inserted}`);
  console.log(`  Ignorados (duplicados): ${skipped}`);
  console.log(`  Total no banco: ${total.count}`);
  
  process.exit(0);
}

seedProfileSkills().catch((err) => {
  console.error("Erro no seed:", err);
  process.exit(1);
});