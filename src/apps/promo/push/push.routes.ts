import { Router } from 'express';
import { requireAuth, optionalAuth } from '../../../shared/auth/auth.middleware.js';
import { pushController } from './push.controller.js';

const router = Router();

/**
 * @swagger
 * /api/push/tokens:
 *   get:
 *     summary: Lista todos os tokens de dispositivos registrados no banco de dados.
 *     description: Retorna a lista de tokens (FCM nativo ou Expo), plataforma (ios/android), usuário associado e status ativo.
 *     tags:
 *       - Push Notifications
 *     responses:
 *       200:
 *         description: Lista de tokens retornada com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 count: { type: number, example: 3 }
 *                 tokens:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: number, example: 1 }
 *                       token: { type: string, example: "c2M_...:APA91b..." }
 *                       platform: { type: string, example: "ios" }
 *                       user_id: { type: string, example: "vssousa" }
 *                       is_active: { type: number, example: 1 }
 *                       created_at: { type: string, example: "2026-09-07 14:00:00" }
 *                       last_used_at: { type: string, example: "2026-09-07 15:30:00" }
 */
router.get('/tokens', requireAuth, pushController.listTokens);

/**
 * @swagger
 * /api/push/send:
 *   post:
 *     summary: Dispara uma notificação Push de teste via Firebase / Expo.
 *     description: Dispara notificação push pelo backend. Se `token` não for fornecido, seleciona automaticamente o último dispositivo ativo cadastrado no banco de dados.
 *     tags:
 *       - Push Notifications
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PushNotificationInput'
 *     parameters:
 *       - in: query
 *         name: title
 *         schema:
 *           type: string
 *         description: Título da notificação (opcional)
 *         example: "💳 Compra Aprovada - Nubank"
 *       - in: query
 *         name: body
 *         schema:
 *           type: string
 *         description: Corpo da mensagem (opcional)
 *         example: "Compra de R$ 120,00 no Supermercado Pão de Açúcar aprovada"
 *       - in: query
 *         name: screen
 *         schema:
 *           type: string
 *         description: Rota de tela para deep link (opcional)
 *         example: "detected"
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         description: Token FCM ou Expo específico (se omitido, usa o mais recente)
 *     responses:
 *       200:
 *         description: Push disparado com sucesso.
 *       404:
 *         description: Nenhum token ativo encontrado no banco.
 *       500:
 *         description: Falha no disparo.
 *   get:
 *     summary: Dispara uma notificação Push via Query String (rápido via navegador / Postman / Swagger).
 *     description: Permite testar o disparo direto por URL. Se omitir o token, seleciona o último dispositivo cadastrado.
 *     tags:
 *       - Push Notifications
 *     parameters:
 *       - in: query
 *         name: title
 *         schema:
 *           type: string
 *         description: Título da notificação
 *         example: "🔔 Teste Swagger"
 *       - in: query
 *         name: body
 *         schema:
 *           type: string
 *         description: Mensagem da notificação
 *         example: "Notificação recebida com sucesso via Swagger!"
 *       - in: query
 *         name: screen
 *         schema:
 *           type: string
 *         description: Tela para abrir no app ao tocar
 *         example: "detected"
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         description: Token específico (opcional)
 *     responses:
 *       200:
 *         description: Push enviado com sucesso.
 */
router.all('/send', requireAuth, pushController.sendManualPush);

/**
 * @swagger
 * /api/push/register:
 *   post:
 *     summary: Registra ou reativa o Push Token de um dispositivo móvel.
 *     description: Registra o token FCM ou Expo no banco SQLite e associa ao usuário autenticado (se logado).
 *     tags:
 *       - Push Notifications
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeviceRegisterInput'
 *     responses:
 *       200:
 *         description: Token registrado com sucesso.
 *       400:
 *         description: Dados inválidos (token ou platform ausente).
 */
router.post('/register', optionalAuth, pushController.register);

/**
 * @swagger
 * /api/push/unregister:
 *   post:
 *     summary: Desativa o token de um dispositivo (Logout / desinstalação).
 *     tags:
 *       - Push Notifications
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: ["token"]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       200:
 *         description: Token removido com sucesso.
 */
router.post('/unregister', requireAuth, pushController.unregister);

/**
 * @swagger
 * /api/push/test:
 *   post:
 *     summary: Dispara notificação de teste para um token específico (Requer JWT).
 *     security:
 *       - oauth2Password: []
 *       - bearerAuth: []
 *     tags:
 *       - Push Notifications
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: ["token"]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       200:
 *         description: Push enviado com sucesso.
 */
router.post('/test', requireAuth, pushController.test);

/**
 * @swagger
 * /api/push/stats:
 *   get:
 *     summary: Estatísticas de tokens cadastrados (total e ativos).
 *     security:
 *       - oauth2Password: []
 *       - bearerAuth: []
 *     tags:
 *       - Push Notifications
 *     responses:
 *       200:
 *         description: Contagem retornada com sucesso.
 */
router.get('/stats', requireAuth, pushController.stats);

export default router;
