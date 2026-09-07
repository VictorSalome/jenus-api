import { Router } from 'express';
import * as authController from './auth.controller.js';
import { requireAuth } from './auth.middleware.js';

const router = Router();

/**
 * @swagger
 * /api/auth/token:
 *   post:
 *     summary: Obter Token JWT via OAuth2 Password Flow (Usado automaticamente pelo cadeado do Swagger).
 *     description: Permite autenticar diretamente na caixa de diálogo "Authorize" (cadeado) do Swagger UI com usuário e senha.
 *     tags:
 *       - Autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required: ["username", "password"]
 *             properties:
 *               username: { type: string, example: "vssousa" }
 *               password: { type: string, format: password, example: "sua-senha" }
 *         application/json:
 *           schema:
 *             type: object
 *             required: ["username", "password"]
 *             properties:
 *               username: { type: string, example: "vssousa" }
 *               password: { type: string, format: password, example: "sua-senha" }
 *     responses:
 *       200:
 *         description: Token gerado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token: { type: string }
 *                 token_type: { type: string, example: "bearer" }
 *                 expires_in: { type: number, example: 900 }
 *       401:
 *         description: Credenciais inválidas.
 */
router.post('/token', authController.swaggerTokenLogin);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login de usuário com username e password.
 *     description: Autentica o usuário e retorna o Access Token JWT (15min) e Refresh Token (7 dias).
 *     tags:
 *       - Autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginInput'
 *     responses:
 *       200:
 *         description: Login realizado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Login realizado com sucesso" }
 *                 accessToken: { type: string }
 *                 refreshToken: { type: string }
 *                 user: { type: object, properties: { username: { type: string, example: "vssousa" } } }
 *       401:
 *         description: Usuário ou senha incorretos.
 */
router.post('/login', authController.login);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Retorna os dados do usuário atualmente autenticado.
 *     security:
 *       - oauth2Password: []
 *       - bearerAuth: []
 *     tags:
 *       - Autenticação
 *     responses:
 *       200:
 *         description: Dados do usuário autenticado.
 *       401:
 *         description: Não autenticado.
 */
router.get('/me', requireAuth, authController.me);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Encerra a sessão ativa.
 *     tags:
 *       - Autenticação
 *     responses:
 *       200:
 *         description: Logout realizado.
 */
router.post('/logout', authController.logout);

export default router;
