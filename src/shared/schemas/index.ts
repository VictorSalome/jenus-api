import { z } from "zod";

export const LoginInputSchema = z.object({
  username: z.string().min(1, "Username é obrigatório"),
  password: z.string().min(1, "Password é obrigatório"),
});

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    username: z.string(),
  }),
});

export const PushRegisterInputSchema = z.object({
  token: z.string().min(1, "Token FCM é obrigatório"),
  platform: z.enum(["android", "ios"]),
});

export const TransactionSchema = z.object({
  id: z.number().optional(),
  amountCents: z.number().int(),
  description: z.string().min(1),
  merchantName: z.string().optional(),
  transactionDate: z.string(),
  categoryId: z.number().int().optional().nullable(),
  cardId: z.number().int().optional().nullable(),
  accountId: z.number().int().optional().nullable(),
  installmentsTotal: z.number().int().min(1).default(1),
});

export const PromoFilterSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, "Nome é obrigatório"),
  keywords: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export const AccountSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, "Nome é obrigatório"),
  type: z.enum(["checking", "savings", "cash", "investment", "other"]).default("checking"),
  balanceCents: z.number().int().default(0),
  color: z.string().default("#3B82F6"),
  icon: z.string().default("bank"),
});

export const CardSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, "Nome é obrigatório"),
  accountId: z.number().int().min(1),
  type: z.enum(["credit", "debit", "prepaid"]).default("credit"),
  closingDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
  limitCents: z.number().int().default(0),
  color: z.string().default("#3B82F6"),
});

export const CategorySchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, "Nome é obrigatório"),
  type: z.enum(["expense", "income"]).default("expense"),
  icon: z.string().default("tag"),
  color: z.string().default("#3B82F6"),
});

export const MerchantSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, "Nome é obrigatório"),
  normalizedName: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
});

export const InstallmentActionSchema = z.object({
  paidAt: z.string().optional(),
  amountCents: z.number().int().optional(),
});

export const NotificationEventImportSchema = z.object({
  amountCents: z.number().int().min(1),
  description: z.string().min(1),
  merchantName: z.string().optional(),
  transactionDate: z.string(),
  categoryId: z.number().int().optional().nullable(),
  cardId: z.number().int().optional().nullable(),
  accountId: z.number().int().min(1),
  installmentsTotal: z.number().int().min(1).default(1),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type PushRegisterInput = z.infer<typeof PushRegisterInputSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type PromoFilter = z.infer<typeof PromoFilterSchema>;
export type Account = z.infer<typeof AccountSchema>;
export type Card = z.infer<typeof CardSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Merchant = z.infer<typeof MerchantSchema>;
export type InstallmentAction = z.infer<typeof InstallmentActionSchema>;
export type NotificationEventImport = z.infer<typeof NotificationEventImportSchema>;

// ── Currículos (usados pelo frontend no compartilhamento) ──

export const ExperienceSchema = z.object({
  id: z.string().optional(),
  company: z.string().min(1),
  role: z.string().min(1),
  period: z.string(),
  description: z.string().default(""),
});

export const EducationSchema = z.object({
  id: z.string().optional(),
  institution: z.string().min(1),
  degree: z.string(),
  field: z.string().default(""),
  period: z.string(),
});

export const CertificationSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  issuer: z.string(),
  date: z.string().default(""),
  credentialId: z.string().default(""),
  url: z.string().default(""),
});

export const LanguageSchema = z.object({
  id: z.string().optional(),
  language: z.string().min(1),
  level: z.string(),
});

export const SpecializationSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1),
});

export type Experience = z.infer<typeof ExperienceSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type Certification = z.infer<typeof CertificationSchema>;
export type Language = z.infer<typeof LanguageSchema>;
export type Specialization = z.infer<typeof SpecializationSchema>;

// ── Promo (monitor de promoções) ──

export const ChannelCreateSchema = z.object({
  username: z
    .string()
    .min(1, "Username é obrigatório")
    .transform((v) => v.trim().replace(/^@/, "")),
  name: z.string().optional(),
});

export const ToggleSchema = z.object({
  isActive: z.boolean().optional(),
});

export const CategoryCreateSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  color: z.string().optional(),
  icon: z.string().optional(),
});

export const CategoryUpdateSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  color: z.string().optional(),
});

export const FilterCreateSchema = z.object({
  categoryId: z.number().int().min(1),
  name: z.string().min(1, "Nome é obrigatório"),
  // 'specific' = match exato da keyword; 'broad' = match parcial (comportamento do monitor)
  type: z.enum(["broad", "specific"]).default("broad"),
  keywords: z.array(z.string().min(1)).min(1, "Ao menos uma keyword"),
});

export const FilterUpdateSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  type: z.enum(["broad", "specific"]).default("broad"),
  keywords: z.array(z.string().min(1)).min(1, "Ao menos uma keyword"),
});

export const ToggleAllSchema = z.object({
  isActive: z.boolean(),
});

export const PriceAlertCreateSchema = z.object({
  productName: z.string().min(1, "Produto é obrigatório"),
  targetPrice: z.number().positive("Preço alvo deve ser > 0"),
});

export const PriceAlertUpdateSchema = z.object({
  productName: z.string().min(1, "Produto é obrigatório"),
  targetPrice: z.number().positive("Preço alvo deve ser > 0"),
});

const URL_RE = /^https?:\/\/[^\s]+$/i;
export const DiscordWebhookConfigSchema = z.object({
  webhookUrl: z.string().regex(URL_RE, "URL inválida (http/https)"),
});

export const TelegramBotConfigSchema = z.object({
  botToken: z.string().min(10, "Token do bot inválido"),
  groupId: z.string().min(1, "Group ID é obrigatório"),
});

export type ChannelCreate = z.infer<typeof ChannelCreateSchema>;
export type CategoryCreate = z.infer<typeof CategoryCreateSchema>;
export type FilterCreate = z.infer<typeof FilterCreateSchema>;
export type PriceAlertCreate = z.infer<typeof PriceAlertCreateSchema>;
export type DiscordWebhookConfig = z.infer<typeof DiscordWebhookConfigSchema>;
export type TelegramBotConfig = z.infer<typeof TelegramBotConfigSchema>;

// ── Currículos: fontes de vagas ──

export const SourceUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  credentials: z.record(z.string(), z.string()).optional(),
});

// ── Currículos: exportação ──

export const ExportFormatSchema = z.enum(["pdf", "docx"]);

export const ExportRequestSchema = z.object({
  format: ExportFormatSchema,
  vagaTitulo: z.string().max(120).optional(),
  /** 'ats' = variante otimizada para parsers de ATS (Gupy et al): datas MM/YYYY, sem decoração */
  variant: z.enum(["classic", "ats"]).default("classic").optional(),
});
