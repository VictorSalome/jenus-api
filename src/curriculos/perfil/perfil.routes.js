import { Router } from "express";
import { getDb } from "../../core/database.js";
import { asyncHandler, ValidationError } from "../middleware/errorHandler.js";
import { logInfo, logError, logWarn } from "../utils/logger.js";
import fs from "fs/promises";
import path from "path";
import config from "../config/index.js";

const router = Router();

const PROFILE_JSON_PATH = config.paths.candidateProfile;

/**
 * GET /api/curriculo/profile
 * Retorna o perfil completo (candidate-profile.json + skills do banco)
 */
router.get(
  "/profile",
  asyncHandler(async (req, res) => {
    let profileData = {};
    try {
      const data = await fs.readFile(PROFILE_JSON_PATH, "utf-8");
      profileData = JSON.parse(data);
    } catch (e) {
      logWarn("candidate-profile.json não encontrado ou inválido", e);
    }

    const db = await getDb();
    const skillsRows = await db.all(
      "SELECT category, tech FROM profile_skills ORDER BY category, tech"
    );

    const grouped = {};
    for (const row of skillsRows) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push(row.tech);
    }

    profileData.skills = grouped;

    res.json({
      success: true,
      profile: profileData,
    });
  })
);

/**
 * PATCH /api/curriculo/profile
 * Atualiza o perfil completo salvando no candidate-profile.json
 */
router.patch(
  "/profile",
  asyncHandler(async (req, res) => {
    const newProfile = req.body;
    if (!newProfile || typeof newProfile !== "object") {
      throw new ValidationError("Dados de perfil inválidos");
    }

    try {
      // Ler arquivo existente para fazer merge seguro se necessário
      let currentData = {};
      try {
        const data = await fs.readFile(PROFILE_JSON_PATH, "utf-8");
        currentData = JSON.parse(data);
      } catch (e) {}

      const merged = { ...currentData, ...newProfile };
      await fs.writeFile(PROFILE_JSON_PATH, JSON.stringify(merged, null, 2), "utf-8");

      logInfo("candidate-profile.json atualizado com sucesso");

      res.json({
        success: true,
        message: "Perfil atualizado com sucesso",
        profile: merged,
      });
    } catch (error) {
      logError("Erro ao salvar perfil", error);
      throw error;
    }
  })
);

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