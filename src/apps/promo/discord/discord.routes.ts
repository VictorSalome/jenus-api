import { Router } from "express";
import * as discordController from "./discord.controller.js";
import { requireAuth } from "../../../shared/auth/auth.middleware.js";
import { asyncHandler } from "../../../shared/http/index.js";

const router = Router();

/**
 * @swagger
 * /api/discord/test:
 *   post:
 *     summary: Envia uma mensagem de teste real no canal do Discord configurado.
 *     description: Envia um Embed visual rico de teste no canal do Discord usando o Webhook ativo.
 *     security:
 *       - oauth2Password: []
 *       - bearerAuth: []
 *     tags:
 *       - Promoções
 *     responses:
 *       200:
 *         description: Mensagem de teste enviada com sucesso no canal do Discord.
 *       500:
 *         description: Falha no envio (webhook inválido ou não configurado).
 */
router.post("/test", requireAuth, asyncHandler(discordController.testDiscord));

export default router;
