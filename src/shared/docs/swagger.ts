import { type Application, type Request, type Response } from "express";
import path from "path";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Jenus API",
      version: "1.0.0",
      description: "API modular do Jenus Hub — promoções, currículos, finanças, Gmail e push notifications.",
      contact: {
        name: "Jenus Hub",
        url: "https://136.248.109.21.sslip.io",
      },
    },
    servers: [
      {
        url: "http://192.168.1.16:3001",
        description: "Rede Local (Wi-Fi / Simulador / Celular)",
      },
      {
        url: "http://localhost:3001",
        description: "Desenvolvimento Local (localhost)",
      },
      {
        url: "https://136.248.109.21.sslip.io",
        description: "Servidor em Nuvem (Oracle Cloud)",
      },
    ],
    components: {
      securitySchemes: {
        oauth2Password: {
          type: "oauth2",
          description: "Faça login diretamente pelo cadeado com seu usuário e senha. O token será obtido e aplicado automaticamente!",
          flows: {
            password: {
              tokenUrl: "/api/auth/token",
              scopes: {},
            },
          },
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Ou insira o token Bearer JWT manualmente aqui.",
        },
      },
      schemas: {
        PushNotificationInput: {
          type: "object",
          properties: {
            title: { type: "string", example: "💳 Compra Aprovada - Nubank" },
            body: { type: "string", example: "Compra de R$ 120,00 no Supermercado Pão de Açúcar aprovada" },
            screen: { type: "string", example: "detected" },
            token: { type: "string", description: "Opcional: se omitido, envia para o token mais recente cadastrado no banco." },
          },
        },
        DeviceRegisterInput: {
          type: "object",
          required: ["token", "platform"],
          properties: {
            token: { type: "string", example: "fcm_or_expo_device_token_here" },
            platform: { type: "string", enum: ["ios", "android"], example: "ios" },
          },
        },
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string", example: "Validation error" },
          },
        },
        LoginInput: {
          type: "object",
          required: ["username", "password"],
          properties: {
            username: { type: "string", example: "admin" },
            password: { type: "string", example: "sua-senha" },
          },
        },
        TokenPair: {
          type: "object",
          properties: {
            accessToken: { type: "string" },
            refreshToken: { type: "string" },
            user: {
              type: "object",
              properties: {
                username: { type: "string" },
              },
            },
          },
        },
      },
    },
    security: [
      {
        oauth2Password: [],
      },
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    path.resolve(process.cwd(), "src/**/*.routes.ts"),
    path.resolve(process.cwd(), "dist/**/*.routes.js"),
  ],
};

export const spec = swaggerJsdoc(options);

export const mountSwagger = (app: Application): void => {
  app.get("/api/openapi.json", (_req: Request, res: Response) => {
    res.json(spec);
  });

  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: "Jenus API — Documentação",
      customCss: ".swagger-ui .topbar { background-color: #0f172a; }",
    }),
  );
};
