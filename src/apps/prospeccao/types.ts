export const StatusLead = {
  PENDENTE: "PENDENTE",
  APROVADA: "APROVADA",
  REJEITADA: "REJEITADA",
  ENVIADA: "ENVIADA",
  CONVERTIDA: "CONVERTIDA",
} as const;

export type StatusLead = (typeof StatusLead)[keyof typeof StatusLead];

export interface FotoMeta {
  url: string;
  width?: number;
  height?: number;
  source: "capa" | "galeria" | "streetview" | "painel";
  confianca: "alta" | "media";
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
  status: StatusLead;
  motivo_rejeicao: string | null;
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
  status: StatusLead;
  motivo_rejeicao?: string | null;
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
  status?: StatusLead;
  motivo_rejeicao?: string | null;
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
  status?: StatusLead;
  motivo_rejeicao?: string | null;
}

export type EstatisticasStatus = Record<StatusLead, number>;

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
