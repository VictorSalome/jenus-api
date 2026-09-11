export const StatusLead = {
  // Novo ciclo padrão Human-in-the-Loop
  PENDING_REVIEW: "PENDING_REVIEW",
  APPROVED: "APPROVED",
  SENT: "SENT",
  REPLIED: "REPLIED",
  CONVERTED: "CONVERTED",
  REJECTED: "REJECTED",
  FAILED: "FAILED",

  // Aliases retrocompatíveis
  PENDENTE: "PENDING_REVIEW",
  APROVADA: "APPROVED",
  ENVIADA: "SENT",
  CONVERTIDA: "CONVERTED",
  REJEITADA: "REJECTED",
} as const;

export type StatusLead = (typeof StatusLead)[keyof typeof StatusLead];

export function normalizeStatusLead(status?: string | null): StatusLead {
  if (!status) return StatusLead.PENDING_REVIEW;
  const upper = status.toUpperCase().trim();
  if (upper === "PENDENTE" || upper === "PENDING_REVIEW") return StatusLead.PENDING_REVIEW;
  if (upper === "APROVADA" || upper === "APPROVED") return StatusLead.APPROVED;
  if (upper === "ENVIADA" || upper === "SENT") return StatusLead.SENT;
  if (upper === "REPLIED" || upper === "RESPONDIDA") return StatusLead.REPLIED;
  if (upper === "CONVERTIDA" || upper === "CONVERTED") return StatusLead.CONVERTED;
  if (upper === "REJEITADA" || upper === "REJECTED") return StatusLead.REJECTED;
  if (upper === "FAILED" || upper === "FALHA") return StatusLead.FAILED;
  return StatusLead.PENDING_REVIEW;
}

export interface FotoMeta {
  url: string;
  width?: number;
  height?: number;
  source: "capa" | "galeria" | "streetview" | "painel";
  confianca: "alta" | "media";
}

export interface LandingPageSnapshot {
  version: number;
  nome: string;
  slug: string;
  segmento?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  endereco?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  maps_url?: string | null;
  avaliacao?: number | null;
  total_avaliacoes?: number | null;
  fotos: string[];
  fotos_meta?: FotoMeta[];
  snapshot_at: string;
}

export interface DisparoRegistro {
  id: string;
  lead_id: string;
  canal: "EMAIL" | "WHATSAPP";
  tipo_disparo: string;
  recipient: string;
  reply_to?: string | null;
  landing_page_url: string;
  message_id?: string | null;
  status: "PROCESSING" | "SENT" | "FAILED";
  error?: string | null;
  sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmpresaLeadRaw {
  id: string;
  nome: string;
  slug: string;
  segmento: string | null;
  cidade: string | null;
  bairro: string | null;
  endereco: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  maps_url: string | null;
  avaliacao: number | null;
  total_avaliacoes: number | null;
  fotos: string;
  landing_page_url?: string | null;
  landing_page_snapshot?: string | null;
  snapshot_version?: number;
  status: string;
  motivo_rejeicao: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  rejection_reason?: string | null;
  sent_at?: string | null;
  message_id?: string | null;
  reply_to?: string | null;
  replied_at?: string | null;
  converted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmpresaLead {
  id: string;
  nome: string;
  slug: string;
  segmento?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  endereco?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  maps_url?: string | null;
  avaliacao?: number | null;
  total_avaliacoes?: number | null;
  fotos: string[];
  fotos_meta?: FotoMeta[];
  landing_page_url?: string | null;
  landing_page_snapshot?: LandingPageSnapshot | null;
  snapshot_version?: number;
  status: StatusLead;
  motivo_rejeicao?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  rejection_reason?: string | null;
  sent_at?: string | null;
  message_id?: string | null;
  reply_to?: string | null;
  replied_at?: string | null;
  converted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalvarEmpresaLeadDTO {
  id?: string;
  nome: string;
  slug: string;
  segmento?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  endereco?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  maps_url?: string | null;
  avaliacao?: number | null;
  total_avaliacoes?: number | null;
  fotos?: string[] | FotoMeta[] | string | null;
  landing_page_url?: string | null;
  landing_page_snapshot?: LandingPageSnapshot | string | null;
  snapshot_version?: number;
  status?: StatusLead;
  motivo_rejeicao?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  rejection_reason?: string | null;
  sent_at?: string | null;
  message_id?: string | null;
  reply_to?: string | null;
}

export interface AtualizarEmpresaLeadDTO {
  nome?: string;
  slug?: string;
  segmento?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  endereco?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  maps_url?: string | null;
  avaliacao?: number | null;
  total_avaliacoes?: number | null;
  fotos?: string[] | string | null;
  landing_page_url?: string | null;
  landing_page_snapshot?: LandingPageSnapshot | string | null;
  snapshot_version?: number;
  status?: StatusLead;
  motivo_rejeicao?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  rejection_reason?: string | null;
  sent_at?: string | null;
  message_id?: string | null;
  reply_to?: string | null;
  replied_at?: string | null;
  converted_at?: string | null;
}

export type EstatisticasStatus = Record<string, number>;

export interface ProgressoScraper {
  emExecucao: boolean;
  termo: string;
  etapa: string;
  atual: number;
  total: number;
  porcentagem: number;
  iniciadoEm?: string | null;
  finalizadoEm?: string | null;
  erro?: string | null;
  ultimoResultado?: {
    coletados: number;
    enviados: number;
  } | null;
}
