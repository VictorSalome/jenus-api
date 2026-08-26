import { Router } from "express";
import { getDb } from "../../core/database.js";
import { asyncHandler, ValidationError } from "../middleware/errorHandler.js";
import { logInfo, logError, logWarn } from "../utils/logger.js";
import fs from "fs/promises";
import path from "path";
import config from "../config/index.js";

const router = Router();

const PROFILE_JSON_PATH = config.paths.candidateProfile;

// ── Helpers ──

const readProfile = async (): Promise<Record<string, any>> => {
  try {
    const data = await fs.readFile(PROFILE_JSON_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
};

const writeProfile = async (data: Record<string, any>): Promise<void> => {
  await fs.writeFile(PROFILE_JSON_PATH, JSON.stringify(data, null, 2), "utf-8");
};

const genId = (): string => `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

// ── Per-section CRUD ──

const SECTIONS = ["experiences", "education", "certifications", "languages", "specializations"] as const;
type SectionName = (typeof SECTIONS)[number];

const buildSectionRoutes = (section: SectionName) => {
  // GET /profile/:section
  router.get(
    `/profile/${section}`,
    asyncHandler(async (_req, res) => {
      const profile = await readProfile();
      res.json({ success: true, [section]: profile[section] || [] });
    })
  );

  // POST /profile/:section - add item
  router.post(
    `/profile/${section}`,
    asyncHandler(async (req, res) => {
      const profile = await readProfile();
      if (!Array.isArray(profile[section])) profile[section] = [];

      const item = { id: genId(), ...req.body };
      profile[section].push(item);
      await writeProfile(profile);

      logInfo(`Item adicionado em ${section}`, { id: item.id });
      res.json({ success: true, item, [section]: profile[section] });
    })
  );

  // PATCH /profile/:section/:id - update item
  router.patch(
    `/profile/${section}/:id`,
    asyncHandler(async (req, res) => {
      const profile = await readProfile();
      const arr = profile[section];
      if (!Array.isArray(arr)) {
        throw new ValidationError(`Seção ${section} não encontrada`);
      }

      const idx = arr.findIndex((i: any) => i.id === req.params.id);
      if (idx === -1) {
        throw new ValidationError(`Item ${req.params.id} não encontrado em ${section}`);
      }

      arr[idx] = { ...arr[idx], ...req.body, id: req.params.id };
      await writeProfile(profile);

      logInfo(`Item atualizado em ${section}`, { id: req.params.id });
      res.json({ success: true, item: arr[idx], [section]: arr });
    })
  );

  // DELETE /profile/:section/:id - remove item
  router.delete(
    `/profile/${section}/:id`,
    asyncHandler(async (req, res) => {
      const profile = await readProfile();
      const arr = profile[section];
      if (!Array.isArray(arr)) {
        throw new ValidationError(`Seção ${section} não encontrada`);
      }

      const idx = arr.findIndex((i: any) => i.id === req.params.id);
      if (idx === -1) {
        throw new ValidationError(`Item ${req.params.id} não encontrado em ${section}`);
      }

      arr.splice(idx, 1);
      await writeProfile(profile);

      logInfo(`Item removido de ${section}`, { id: req.params.id });
      res.json({ success: true, [section]: arr });
    })
  );
};

SECTIONS.forEach(buildSectionRoutes);

// ── Personal Info (singleton) ──

router.get(
  "/profile/personal",
  asyncHandler(async (_req, res) => {
    const profile = await readProfile();
    res.json({ success: true, personalInfo: profile.personalInfo || {} });
  })
);

router.patch(
  "/profile/personal",
  asyncHandler(async (req, res) => {
    const profile = await readProfile();
    profile.personalInfo = { ...(profile.personalInfo || {}), ...req.body };
    await writeProfile(profile);

    logInfo("Personal info atualizado");
    res.json({ success: true, personalInfo: profile.personalInfo });
  })
);

// ── Specializations (array de strings) ──

router.post(
  "/profile/specializations",
  asyncHandler(async (req, res) => {
    const profile = await readProfile();
    if (!Array.isArray(profile.specializations)) profile.specializations = [];

    const text = req.body.text || req.body.specialization;
    if (!text || typeof text !== "string") {
      throw new ValidationError("Envie { text: string }");
    }

    profile.specializations.push(text);
    await writeProfile(profile);

    res.json({ success: true, specializations: profile.specializations });
  })
);

router.delete(
  "/profile/specializations/:index",
  asyncHandler(async (req, res) => {
    const profile = await readProfile();
    const arr = profile.specializations || [];
    const idx = parseInt(req.params.index, 10);

    if (isNaN(idx) || idx < 0 || idx >= arr.length) {
      throw new ValidationError("Índice inválido");
    }

    arr.splice(idx, 1);
    await writeProfile(profile);

    res.json({ success: true, specializations: arr });
  })
);

// ── GET /profile (full) ──

router.get(
  "/profile",
  asyncHandler(async (_req, res) => {
    const profileData = await readProfile();

    const db = await getDb();
    const skillsRows = await db.all(
      "SELECT category, tech FROM profile_skills ORDER BY category, tech"
    );

    const grouped: Record<string, string[]> = {};
    for (const row of skillsRows) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push(row.tech);
    }

    profileData.skills = grouped;

    res.json({ success: true, profile: profileData });
  })
);

// ── PATCH /profile (full overwrite) ──

router.patch(
  "/profile",
  asyncHandler(async (req, res) => {
    const newProfile = req.body;
    if (!newProfile || typeof newProfile !== "object") {
      throw new ValidationError("Dados de perfil inválidos");
    }

    const currentData = await readProfile();
    const merged = { ...currentData, ...newProfile };
    await writeProfile(merged);

    logInfo("candidate-profile.json atualizado com sucesso");
    res.json({ success: true, message: "Perfil atualizado com sucesso", profile: merged });
  })
);

// ── Skills (DB) ──

router.patch(
  "/profile/skills",
  asyncHandler(async (req, res) => {
    const { category, tech, action, skills } = req.body;
    const db = await getDb();

    if (skills && Array.isArray(skills)) {
      await db.exec("BEGIN TRANSACTION");
      for (const item of skills) {
        if (!item.category || !item.tech || !item.action) {
          throw new ValidationError("Cada skill deve ter category, tech e action");
        }
        if (item.action === "add") {
          await db.run("INSERT OR REPLACE INTO profile_skills (category, tech) VALUES (?, ?)", item.category, item.tech);
        } else if (item.action === "remove") {
          await db.run("DELETE FROM profile_skills WHERE category = ? AND tech = ?", item.category, item.tech);
        }
      }
      await db.exec("COMMIT");
    } else if (category && tech && action) {
      if (action === "add") {
        await db.run("INSERT OR REPLACE INTO profile_skills (category, tech) VALUES (?, ?)", category, tech);
      } else if (action === "remove") {
        await db.run("DELETE FROM profile_skills WHERE category = ? AND tech = ?", category, tech);
      } else {
        throw new ValidationError("Action deve ser 'add' ou 'remove'");
      }
    } else {
      throw new ValidationError("Envie {category, tech, action} ou {skills: [...]}");
    }

    const updatedSkills = await db.all("SELECT category, tech FROM profile_skills ORDER BY category, tech");
    logInfo("Perfil de skills atualizado", { count: updatedSkills.length });
    res.json({ success: true, message: "Perfil atualizado com sucesso", skills: updatedSkills });
  })
);

router.get(
  "/profile/skills",
  asyncHandler(async (_req, res) => {
    const db = await getDb();
    const skills = await db.all("SELECT category, tech FROM profile_skills ORDER BY category, tech");

    const grouped: Record<string, string[]> = {};
    for (const row of skills) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push(row.tech);
    }

    res.json({ success: true, skills: grouped, flat: skills });
  })
);

export default router;