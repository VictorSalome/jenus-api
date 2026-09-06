import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = Router();

/**
 * POST /api/curriculo/email-test
 * Envia e-mail de teste usando a mesma configuração SMTP do envio real
 */
router.post(
  "/email-test",
  asyncHandler(async (req, res) => {
    // Feature flag check (habilitado por padrão, a menos que definido como false)
    if (process.env.ENABLE_EMAIL_TEST === "false") {
      return res.status(403).json({
        success: false,
        status: "error",
        message: "Endpoint de teste de e-mail desabilitado explicitamente.",
      });
    }

    let { to, subject, body } = req.body;
    const errorLogger = (await import("../utils/logger.js")).logError;

    // Se 'to' não foi fornecido, usa test_email do perfil com fallback para victorsalome41@hotmail.com
    if (!to) {
      try {
        const { getDb } = await import("../../../../core/database.js");
        const db = await getDb();
        const personal = await db.get("SELECT test_email FROM curriculo_profile_personal WHERE id = 1");
        to = personal?.test_email || "victorsalome41@hotmail.com";
      } catch {
        to = "victorsalome41@hotmail.com";
      }
    }

    subject = subject || "Teste de envio de e-mail - Jenus";
    body = body || "<h1>Teste de e-mail</h1><p>Se você recebeu este e-mail, a configuração de envio está funcionando perfeitamente.</p>";

    // Validação básica de e-mail
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      throw new Error("E-mail de destino inválido");
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
        replyTo: "victorsalome41@hotmail.com",
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