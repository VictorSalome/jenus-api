import { Router } from "express";
import * as controller from "./discord-webhook-config.controller.js";
import { requireAuth } from "../../../shared/auth/auth.middleware.js";
import { asyncHandler } from "../../../shared/http/index.js";

const router = Router();

/**
 * @swagger
 * /api/discord-webhook-config:
 *   get:
 *     summary: Obtém o status do Webhook do Discord (URL mascarada por segurança).
 *     security:
 *       - oauth2Password: []
 *       - bearerAuth: []
 *     tags:
 *       - Promoções
 *     responses:
 *       200:
 *         description: Configuração retornada com sucesso (URL mascarada).
 *   post:
 *     summary: Salva ou atualiza a URL do Webhook do Discord.
 *     security:
 *       - oauth2Password: []
 *       - bearerAuth: []
 *     tags:
 *       - Promoções
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: ["webhookUrl"]
 *             properties:
 *               webhookUrl: { type: string, example: "https://discord.com/api/webhooks/123456789/abcdef-token" }
 *     responses:
 *       200:
 *         description: Webhook salvo com sucesso.
 *   delete:
 *     summary: Revoga o Webhook no Discord e limpa do banco de dados local.
 *     security:
 *       - oauth2Password: []
 *       - bearerAuth: []
 *     tags:
 *       - Promoções
 *     responses:
 *       200:
 *         description: Webhook revogado com sucesso no Discord.
 */
router.get("/", requireAuth, asyncHandler(controller.getConfig));
router.post("/", requireAuth, asyncHandler(controller.saveConfig));

/**
 * @swagger
 * /api/discord-webhook-config/test:
 *   post:
 *     summary: Valida a URL do Webhook do Discord chamando a API de metadados do Discord.
 *     security:
 *       - oauth2Password: []
 *       - bearerAuth: []
 *     tags:
 *       - Promoções
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               webhookUrl: { type: string, example: "https://discord.com/api/webhooks/123456789/abcdef-token" }
 *     responses:
 *       200:
 *         description: Webhook validado com sucesso.
 *       400:
 *         description: URL inválida ou webhook revogado.
 */
router.post("/test", requireAuth, asyncHandler(controller.testWebhook));
router.delete("/", requireAuth, asyncHandler(controller.revokeConfig));

export default router;
