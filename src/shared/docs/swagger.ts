import { type Application, type Request, type Response } from "express";
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
        url: "http://localhost:3001",
        description: "Desenvolvimento",
      },
      {
        url: "https://136.248.109.21.sslip.io",
        description: "Produção (HTTPS via sslip.io)",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
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
  },
  apis: ["./src/apps/*/routes/*.ts", "./dist/apps/*/routes/*.js"],
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
