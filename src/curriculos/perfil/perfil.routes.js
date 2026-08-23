import { Router } from "express";
import { getDb } from "../../core/database.js";
import { asyncHandler, ValidationError } from "../middleware/errorHandler.js";
import { logInfo, logError } from "../utils/logger.js";

const router = Router();

/**
 * PATCH /api/curriculo/profile/skills
 * Atualiza skills do perfil do candidato
 * Body: { category: string, tech: string, action: 'add' | 'remove' }
 * Ou: { skills: Array<{category, tech, action}> } para bulk
 */
router.patch(
  "/profile/skills",
  asyncHandler(async (req, res) => {
    const { category, tech, action, skills } = req.body;
    const db = await getDb();

    try {
      if (skills && Array.isArray(skills)) {
        // Bulk update
        await db.exec("BEGIN TRANSACTION");
        for (const item of skills) {
          if (!item.category || !item.tech || !item.action) {
            throw new ValidationError("Cada skill deve ter category, tech e action");
          }
          if (item.action === "add") {
            await db.run(
              "INSERT OR REPLACE INTO profile_skills (category, tech) VALUES (?, ?)",
              item.category,
              item.tech
            );
          } else if (item.action === "remove") {
            await db.run(
              "DELETE FROM profile_skills WHERE category = ? AND tech = ?",
              item.category,
              item.tech
            );
          }
        }
        await db.exec("COMMIT");
      } else if (category && tech && action) {
        // Single update
        if (action === "add") {
          await db.run(
            "INSERT OR REPLACE INTO profile_skills (category, tech) VALUES (?, ?)",
            category,
            tech
          );
        } else if (action === "remove") {
          await db.run(
            "DELETE FROM profile_skills WHERE category = ? AND tech = ?",
            category,
            tech
          );
        } else {
          throw new ValidationError("Action deve ser 'add' ou 'remove'");
        }
      } else {
        throw new ValidationError("Envie {category, tech, action} ou {skills: [...]}");
      }

      // Retornar perfil atualizado
      const updatedSkills = await db.all(
        "SELECT category, tech FROM profile_skills ORDER BY category, tech"
      );

      logInfo("Perfil de skills atualizado", { count: updatedSkills.length });

      res.json({
        success: true,
        message: "Perfil atualizado com sucesso",
        skills: updatedSkills,
      });
    } catch (error) {
      await db.exec("ROLLBACK");
      logError("Erro ao atualizar perfil", error);
      throw error;
    }
  })
);

/**
 * GET /api/curriculo/profile/skills
 * Retorna skills atuais do perfil
 */
router.get(
  "/profile/skills",
  asyncHandler(async (req, res) => {
    const db = await getDb();
    const skills = await db.all(
      "SELECT category, tech FROM profile_skills ORDER BY category, tech"
    );

    // Agrupar por categoria
    const grouped = {};
    for (const row of skills) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push(row.tech);
    }

    res.json({
      success: true,
      skills: grouped,
      flat: skills,
    });
  })
);

export default router;