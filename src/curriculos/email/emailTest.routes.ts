import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { getSmtpRuntimeConfig } from "../smtp/smtpConfig.service.js";

const router = Router();

/**
 * POST /api/curriculo/email-test
 * Envia e-mail de teste usando a mesma configuração SMTP do envio real
 */
router.post(
  "/email-test",
  asyncHandler(async (req, res) => {
    // Feature flag check
    if (process.env.ENABLE_EMAIL_TEST !== "true") {
      return res.status(403).json({
        success: false,
        status: "error",
        message: "Endpoint de teste de e-mail desabilitado. Configure ENABLE_EMAIL_TEST=true para habilitar.",
      });
    }

    const { to, subject, body } = req.body;
    const errorLogger = (await import("../utils/logger.js")).logError;

    // Validação
    if (!to || !subject || !body) {
      throw new Error("Campos obrigatórios: to, subject, body");
    }

    // Validação básica de e-mail
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      throw new Error("E-mail de destino inválido");
    }

    if (typeof subject !== "string" || subject.trim().length === 0) {
      throw new Error("Assunto deve ser uma string não vazia");
    }

    if (typeof body !== "string" || body.trim().length === 0) {
      throw new Error("Corpo do e-mail deve ser uma string não vazia");
    }

    const { criarTransporter } = await import("../email/email.service.js");

    try {
      const transporter = criarTransporter();

      const mailOptions = {
        from: {
          name: process.env.SENDER_NAME || "Sistema de Currículo (Teste)",
          address: process.env.EMAIL_FROM || process.env.SMTP_USER,
        },
        to,
        subject: `[TESTE] ${subject}`,
        html: body,
      };

      const resultado = await transporter.sendMail(mailOptions);

      errorLogger("E-mail de teste enviado com sucesso", { to, messageId: resultado.messageId });

      const previewUrl = resultado.previewUrl || null;

      return res.json({
        success: true,
        status: "success",
        message: "E-mail de teste enviado com sucesso",
        messageId: resultado.messageId,
        previewUrl,
        to,
        subject,
      });
    } catch (error) {
      errorLogger("Erro ao enviar e-mail de teste", error);
      return res.status(503).json({
        success: false,
        status: "error",
        message: `Falha no envio do e-mail de teste: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  })
);

export default router;