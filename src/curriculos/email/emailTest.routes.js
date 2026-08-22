import { Router } from "express";
import { asyncHandler, ValidationError } from "../middleware/errorHandler.js";
import { criarTransporter, getSmtpRuntimeConfig } from "./email.service.js";

const router = Router();

/**
 * POST /api/curriculo/email-test
 * Envia e-mail de teste usando a mesma configuração SMTP do envio real
 * Body: { to: string, subject: string, body: string }
 * Feature flag: ENABLE_EMAIL_TEST=true
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

    // Validação
    if (!to || !subject || !body) {
      throw new ValidationError("Campos obrigatórios: to, subject, body", [
        "to: e-mail de destino (string, e-mail válido)",
        "subject: assunto do e-mail (string)",
        "body: corpo do e-mail em HTML (string)",
      ]);
    }

    // Validação básica de e-mail
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      throw new ValidationError("E-mail de destino inválido", [
        "Formato esperado: usuario@dominio.com",
      ]);
    }

    if (typeof subject !== "string" || subject.trim().length === 0) {
      throw new ValidationError("Assunto deve ser uma string não vazia");
    }

    if (typeof body !== "string" || body.trim().length === 0) {
      throw new ValidationError("Corpo do e-mail deve ser uma string não vazia");
    }

    logInfo("Enviando e-mail de teste", { to, subject: subject.slice(0, 50) });

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

      logInfo("E-mail de teste enviado com sucesso", {
        to,
        messageId: resultado.messageId,
      });

      // previewUrl só existe se estiver usando Ethereal (desenvolvimento sem SMTP real)
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
      logError("Erro ao enviar e-mail de teste", error);

      return res.status(503).json({
        success: false,
        status: "error",
        message: `Falha no envio do e-mail de teste: ${error.message}`,
        error: error.message,
      });
    }
  })
);

export default router;
