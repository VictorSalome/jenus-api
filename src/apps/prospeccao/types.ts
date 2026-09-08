export const StatusLead = {
  PENDENTE: "PENDENTE",
  APROVADA: "APROVADA",
  REJEITADA: "REJEITADA",
  ENVIADA: "ENVIADA",
  CONVERTIDA: "CONVERTIDA",
} as const;

export type StatusLead = (typeof StatusLead)[keyof typeof StatusLead];

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
  fotos?: string[] | string | null;
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
