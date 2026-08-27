import { Router } from "express";
import { getDb } from "../../core/database.js";
import { asyncHandler, ValidationError } from "../shared/middleware/errorHandler.js";
import { logInfo, logError } from "../shared/utils/logger.js";

const router = Router();

const genId = (): string => `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

// ── GET /profile (full) ──

router.get(
  "/profile",
  asyncHandler(async (_req, res) => {
    const db = await getDb();

    const personal = await db.get("SELECT * FROM curriculo_profile_personal WHERE id = 1");
    const experiences = await db.all("SELECT * FROM curriculo_profile_experiences ORDER BY sort_order");
    const education = await db.all("SELECT * FROM curriculo_profile_education ORDER BY sort_order");
    const certifications = await db.all("SELECT * FROM curriculo_profile_certifications ORDER BY sort_order");
    const languages = await db.all("SELECT * FROM curriculo_profile_languages ORDER BY sort_order");
    const specializations = await db.all("SELECT * FROM curriculo_profile_specializations ORDER BY sort_order");
    const skillsRows = await db.all("SELECT category, tech FROM curriculo_profile_skills ORDER BY category, tech");

    const skills: Record<string, string[]> = {};
    for (const row of skillsRows) {
      if (!skills[row.category]) skills[row.category] = [];
      skills[row.category].push(row.tech);
    }

    const profile = {
      personalInfo: personal || {},
      experiences: experiences.map((e) => ({
        id: e.id,
        company: e.company,
        position: e.position,
        startDate: e.start_date,
        endDate: e.end_date,
        location: e.location,
        description: e.description,
        keywords: JSON.parse(e.keywords_json || "[]"),
        achievements: JSON.parse(e.achievements_json || "[]"),
        technologies: JSON.parse(e.technologies_json || "[]"),
      })),
      education: education.map((e) => ({
        id: e.id,
        institution: e.institution,
        degree: e.degree,
        startDate: e.start_date,
        endDate: e.end_date,
        location: e.location,
        gpa: e.gpa,
        description: e.description,
      })),
      certifications: certifications.map((c) => ({
        id: c.id,
        name: c.name,
        issuer: c.issuer,
        date: c.date,
        credentialId: c.credential_id,
        url: c.url,
      })),
      languages: languages.map((l) => ({ language: l.language, level: l.level })),
      specializations: specializations.map((s) => s.text),
      skills,
    };

    res.json({ success: true, profile });
  })
);

// ── GET /profile/personal ──

router.get(
  "/profile/personal",
  asyncHandler(async (_req, res) => {
    const db = await getDb();
    const personal = await db.get("SELECT * FROM curriculo_profile_personal WHERE id = 1");
    res.json({ success: true, personalInfo: { ...(personal || {}), hasWhatsApp: personal?.has_whatsapp === 1 } });
  })
);

// ── PATCH /profile/personal ──

router.patch(
  "/profile/personal",
  asyncHandler(async (req, res) => {
    const db = await getDb();
    const data = req.body;

    const existing = await db.get("SELECT * FROM curriculo_profile_personal WHERE id = 1");
    if (existing) {
      await db.run(`
        UPDATE curriculo_profile_personal SET name=?, email=?, phone=?, has_whatsapp=?, linkedin=?, github=?, portfolio=?, location=?, title=?, summary=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=1
      `, data.name ?? existing.name, data.email ?? existing.email, data.phone ?? existing.phone,
         data.hasWhatsApp !== undefined ? (data.hasWhatsApp ? 1 : 0) : (existing.has_whatsapp ?? 1),
         data.linkedin ?? existing.linkedin, data.github ?? existing.github, data.portfolio ?? existing.portfolio,
         data.location ?? existing.location, data.title ?? existing.title, data.summary ?? existing.summary);
    } else {
      await db.run(`
        INSERT INTO curriculo_profile_personal (id, name, email, phone, has_whatsapp, linkedin, github, portfolio, location, title, summary)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, data.name, data.email, data.phone, data.hasWhatsApp ? 1 : 0, data.linkedin, data.github, data.portfolio, data.location, data.title, data.summary);
    }

    const updated = await db.get("SELECT * FROM curriculo_profile_personal WHERE id = 1");
    logInfo("Dados pessoais atualizados");
    res.json({ success: true, personalInfo: updated });
  })
);

// ── Per-section CRUD ──

const SECTIONS = {
  experiences: {
    table: "curriculo_profile_experiences",
    mapRow: (e: any) => ({
      id: e.id, company: e.company, position: e.position,
      startDate: e.start_date, endDate: e.end_date, location: e.location,
      description: e.description, keywords: JSON.parse(e.keywords_json || "[]"),
      achievements: JSON.parse(e.achievements_json || "[]"),
      technologies: JSON.parse(e.technologies_json || "[]"),
    }),
    fields: ["id", "company", "position", "start_date", "end_date", "location", "description", "keywords_json", "achievements_json", "technologies_json", "sort_order"],
    insertFields: (data: any) => ({
      id: data.id || genId(), company: data.company, position: data.position,
      start_date: data.startDate, end_date: data.endDate, location: data.location,
      description: data.description, keywords_json: JSON.stringify(data.keywords || []),
      achievements_json: JSON.stringify(data.achievements || []),
      technologies_json: JSON.stringify(data.technologies || []),
    }),
  },
  education: {
    table: "curriculo_profile_education",
    mapRow: (e: any) => ({
      id: e.id, institution: e.institution, degree: e.degree,
      startDate: e.start_date, endDate: e.end_date, location: e.location,
      gpa: e.gpa, description: e.description,
    }),
    fields: ["id", "institution", "degree", "start_date", "end_date", "location", "gpa", "description", "sort_order"],
    insertFields: (data: any) => ({
      id: data.id || genId(), institution: data.institution, degree: data.degree,
      start_date: data.startDate, end_date: data.endDate, location: data.location,
      gpa: data.gpa, description: data.description,
    }),
  },
  certifications: {
    table: "curriculo_profile_certifications",
    mapRow: (c: any) => ({
      id: c.id, name: c.name, issuer: c.issuer, date: c.date,
      credentialId: c.credential_id, url: c.url,
    }),
    fields: ["id", "name", "issuer", "date", "credential_id", "url", "sort_order"],
    insertFields: (data: any) => ({
      id: data.id || genId(), name: data.name, issuer: data.issuer,
      date: data.date, credential_id: data.credentialId, url: data.url,
    }),
  },
  languages: {
    table: "curriculo_profile_languages",
    mapRow: (l: any) => ({ id: l.id, language: l.language, level: l.level }),
    fields: ["id", "language", "level", "sort_order"],
    insertFields: (data: any) => ({ id: data.id || genId(), language: data.language, level: data.level }),
  },
  specializations: {
    table: "curriculo_profile_specializations",
    mapRow: (s: any) => ({ id: s.id, text: s.text }),
    fields: ["id", "text", "sort_order"],
    insertFields: (data: any) => ({ id: data.id || genId(), text: data.text || data.specialization }),
  },
};

for (const [section, config] of Object.entries(SECTIONS)) {
  // GET
  router.get(`/profile/${section}`, asyncHandler(async (_req, res) => {
    const db = await getDb();
    const rows = await db.all(`SELECT * FROM ${config.table} ORDER BY sort_order`);
    res.json({ success: true, [section]: rows.map((row) => config.mapRow(row)) });
  }));

  // POST (add)
  router.post(`/profile/${section}`, asyncHandler(async (req, res) => {
    const db = await getDb();
    const fields = config.insertFields(req.body);
    const keys = Object.keys(fields);
    const placeholders = keys.map(() => "?").join(", ");

    await db.run(
      `INSERT INTO ${config.table} (${keys.join(", ")}) VALUES (${placeholders})`,
      ...Object.values(fields)
    );

    const maxOrder = await db.get(`SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM ${config.table}`);
    await db.run(`UPDATE ${config.table} SET sort_order = ? WHERE sort_order = 0 AND id = ?`, maxOrder.next, fields.id);

    logInfo(`Item adicionado em ${section}`, { id: fields.id });
    const rows = await db.all(`SELECT * FROM ${config.table} ORDER BY sort_order`);
    res.json({ success: true, [section]: rows.map((row) => config.mapRow(row)) });
  }));

  // PATCH (update)
  router.patch(`/profile/${section}/:id`, asyncHandler(async (req, res) => {
    const db = await getDb();
    const existing = await db.get(`SELECT * FROM ${config.table} WHERE id = ?`, req.params.id);
    if (!existing) throw new ValidationError(`Item não encontrado`);

    const fields = config.insertFields({ ...existing, ...req.body, id: req.params.id });
    const sets = Object.keys(fields).map((k) => `${k} = ?`).join(", ");

    await db.run(`UPDATE ${config.table} SET ${sets} WHERE id = ?`, ...Object.values(fields), req.params.id);

    logInfo(`Item atualizado em ${section}`, { id: req.params.id });
    const rows = await db.all(`SELECT * FROM ${config.table} ORDER BY sort_order`);
    res.json({ success: true, [section]: rows.map((row) => config.mapRow(row)) });
  }));

  // DELETE
  router.delete(`/profile/${section}/:id`, asyncHandler(async (req, res) => {
    const db = await getDb();
    await db.run(`DELETE FROM ${config.table} WHERE id = ?`, req.params.id);
    logInfo(`Item removido de ${section}`, { id: req.params.id });
    const rows = await db.all(`SELECT * FROM ${config.table} ORDER BY sort_order`);
    res.json({ success: true, [section]: rows.map((row) => config.mapRow(row)) });
  }));
}

// ── PATCH /profile (full overwrite) ──

router.patch(
  "/profile",
  asyncHandler(async (req, res) => {
    const db = await getDb();
    const data = req.body;

    if (data.personalInfo) {
      const existing = await db.get("SELECT * FROM curriculo_profile_personal WHERE id = 1");
      if (existing) {
        await db.run(`UPDATE curriculo_profile_personal SET name=?, email=?, phone=?, linkedin=?, github=?, portfolio=?, location=?, title=?, summary=?, updated_at=CURRENT_TIMESTAMP WHERE id=1`,
          data.personalInfo.name ?? existing.name, data.personalInfo.email ?? existing.email,
          data.personalInfo.phone ?? existing.phone, data.personalInfo.linkedin ?? existing.linkedin,
          data.personalInfo.github ?? existing.github, data.personalInfo.portfolio ?? existing.portfolio,
          data.personalInfo.location ?? existing.location, data.personalInfo.title ?? existing.title,
          data.personalInfo.summary ?? existing.summary);
      } else {
        await db.run(`INSERT INTO curriculo_profile_personal (id, name, email, phone, linkedin, github, portfolio, location, title, summary) VALUES (1,?,?,?,?,?,?,?,?,?)`,
          data.personalInfo.name, data.personalInfo.email, data.personalInfo.phone,
          data.personalInfo.linkedin, data.personalInfo.github, data.personalInfo.portfolio,
          data.personalInfo.location, data.personalInfo.title, data.personalInfo.summary);
      }
    }

    logInfo("Perfil atualizado via PATCH /profile");
    res.json({ success: true, message: "Perfil atualizado com sucesso" });
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
          await db.run("INSERT OR REPLACE INTO curriculo_profile_skills (category, tech) VALUES (?, ?)", item.category, item.tech);
        } else if (item.action === "remove") {
          await db.run("DELETE FROM curriculo_profile_skills WHERE category = ? AND tech = ?", item.category, item.tech);
        }
      }
      await db.exec("COMMIT");
    } else if (category && tech && action) {
      if (action === "add") {
        await db.run("INSERT OR REPLACE INTO curriculo_profile_skills (category, tech) VALUES (?, ?)", category, tech);
      } else if (action === "remove") {
        await db.run("DELETE FROM curriculo_profile_skills WHERE category = ? AND tech = ?", category, tech);
      } else {
        throw new ValidationError("Action deve ser 'add' ou 'remove'");
      }
    } else {
      throw new ValidationError("Envie {category, tech, action} ou {skills: [...]}");
    }

    const updatedSkills = await db.all("SELECT category, tech FROM curriculo_profile_skills ORDER BY category, tech");
    logInfo("Skills atualizadas", { count: updatedSkills.length });
    res.json({ success: true, message: "Skills atualizadas", skills: updatedSkills });
  })
);

router.get(
  "/profile/skills",
  asyncHandler(async (_req, res) => {
    const db = await getDb();
    const skills = await db.all("SELECT category, tech FROM curriculo_profile_skills ORDER BY category, tech");
    const grouped: Record<string, string[]> = {};
    for (const row of skills) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push(row.tech);
    }
    res.json({ success: true, skills: grouped, flat: skills });
  })
);

// ── POST /profile/reload (re-seed from candidate-profile.json) ──

router.post(
  "/profile/reload",
  asyncHandler(async (_req, res) => {
    const fs = await import("fs/promises");
    const pathMod = await import("path");
    const configPath = pathMod.default.join(process.cwd(), process.env.CANDIDATE_PROFILE_PATH || "candidate-profile.json");

    let raw: string;
    try {
      raw = await fs.default.readFile(configPath, "utf-8");
    } catch {
      throw new ValidationError("candidate-profile.json não encontrado no servidor");
    }

    const profileData = JSON.parse(raw);
    const db = await getDb();

    // Limpar tabelas
    await db.exec("BEGIN TRANSACTION");
    await db.run("DELETE FROM curriculo_profile_personal");
    await db.run("DELETE FROM curriculo_profile_experiences");
    await db.run("DELETE FROM curriculo_profile_education");
    await db.run("DELETE FROM curriculo_profile_certifications");
    await db.run("DELETE FROM curriculo_profile_languages");
    await db.run("DELETE FROM curriculo_profile_specializations");
    await db.run("DELETE FROM curriculo_profile_skills");

    // personalInfo
    const pi = profileData.personalInfo || {};
    await db.run(
      `INSERT INTO curriculo_profile_personal (id, name, email, phone, has_whatsapp, linkedin, github, portfolio, location, title, summary) VALUES (1,?,?,?,?,?,?,?,?,?,?)`,
      pi.name, pi.email, pi.phone, pi.hasWhatsApp !== false ? 1 : 0,
      pi.linkedin, pi.github, pi.portfolio, pi.location, pi.title, pi.summary
    );

    // experiences
    let expCount = 0;
    if (Array.isArray(profileData.experiences)) {
      for (let i = 0; i < profileData.experiences.length; i++) {
        const exp = profileData.experiences[i];
        await db.run(
          `INSERT INTO curriculo_profile_experiences (id, company, position, start_date, end_date, location, description, keywords_json, achievements_json, technologies_json, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          exp.id || `exp_${i}`, exp.company, exp.position, exp.startDate, exp.endDate,
          exp.location, exp.description, JSON.stringify(exp.keywords || []),
          JSON.stringify(exp.achievements || []), JSON.stringify(exp.technologies || []), i
        );
        expCount++;
      }
    }

    // education
    let eduCount = 0;
    if (Array.isArray(profileData.education)) {
      for (let i = 0; i < profileData.education.length; i++) {
        const edu = profileData.education[i];
        await db.run(
          `INSERT INTO curriculo_profile_education (id, institution, degree, start_date, end_date, location, gpa, description, sort_order) VALUES (?,?,?,?,?,?,?,?,?)`,
          edu.id || `edu_${i}`, edu.institution, edu.degree, edu.startDate, edu.endDate,
          edu.location, edu.gpa, edu.description, i
        );
        eduCount++;
      }
    }

    // certifications
    let certCount = 0;
    if (Array.isArray(profileData.certifications)) {
      for (let i = 0; i < profileData.certifications.length; i++) {
        const cert = profileData.certifications[i];
        await db.run(
          `INSERT INTO curriculo_profile_certifications (id, name, issuer, date, credential_id, url, sort_order) VALUES (?,?,?,?,?,?,?)`,
          cert.id || `cert_${i}`, cert.name, cert.issuer, cert.date,
          cert.credentialId || "", cert.url || "", i
        );
        certCount++;
      }
    }

    // languages
    let langCount = 0;
    if (Array.isArray(profileData.languages)) {
      for (let i = 0; i < profileData.languages.length; i++) {
        const lang = profileData.languages[i];
        await db.run(
          `INSERT INTO curriculo_profile_languages (language, level, sort_order) VALUES (?,?,?)`,
          lang.language, lang.level, i
        );
        langCount++;
      }
    }

    // specializations
    let specCount = 0;
    if (Array.isArray(profileData.specializations)) {
      for (let i = 0; i < profileData.specializations.length; i++) {
        await db.run(
          `INSERT INTO curriculo_profile_specializations (text, sort_order) VALUES (?,?)`,
          profileData.specializations[i], i
        );
        specCount++;
      }
    }

    // skills
    let skillCount = 0;
    if (profileData.skills) {
      for (const [category, techs] of Object.entries(profileData.skills)) {
        for (const tech of techs as string[]) {
          await db.run("INSERT OR IGNORE INTO curriculo_profile_skills (category, tech) VALUES (?,?)", category, tech);
          skillCount++;
        }
      }
    }

    await db.exec("COMMIT");

    logInfo("Perfil recarregado do candidate-profile.json", { expCount, eduCount, certCount, langCount, specCount, skillCount });
    res.json({
      success: true,
      message: "Perfil recarregado com sucesso",
      counts: { experiences: expCount, education: eduCount, certifications: certCount, languages: langCount, specializations: specCount, skills: skillCount },
    });
  })
);

export default router;
