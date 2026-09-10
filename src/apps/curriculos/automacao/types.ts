export interface VagaEmailRaw {
  id: string;
  title: string;
  company: string;
  location?: string;
  sourceUrl?: string;
  description?: string;
  requirements?: string[];
  benefits?: string[];
  salary?: string;
  postedAt?: string;
  skills?: string[];
  suggestedPost?: string;
  contactEmail: string;
}

export type AutomacaoState =
  | 'IDLE'
  | 'RUNNING'
  | 'PAUSED'
  | 'STOPPING'
  | 'COMPLETED'
  | 'FAILED';

export type CandidaturaStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'SKIPPED';

export type SkipReason =
  | 'LOW_SCORE'
  | 'DUPLICATE_JOB_ID'
  | 'DUPLICATE_COMPANY_EMAIL_72H'
  | 'DUPLICATE_COMPANY_LOWER_SCORE'
  | 'DAILY_LIMIT_REACHED'
  | 'INVALID_DATA'
  | 'ALREADY_SENT';

export interface AutomacaoConfig {
  minScore: number;
  dailyLimit: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  windowHours: number;
  feedUrl: string;
}

export interface VagaNormalizada {
  jobId: string;
  title: string;
  company: string;
  contactEmail: string;
  location: string;
  salary: string;
  sourceUrl: string;
  description: string;
  requirements: string[];
  skills: string[];
  postedAt: string;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  eligible: boolean;
  status: CandidaturaStatus;
  skipReason?: SkipReason;
  dadosVagaFormatados: Record<string, any>;
  resumoGerado?: string;
}

export interface AutomacaoStatus {
  state: AutomacaoState;
  totalVagas: number;
  processadas: number;
  enviadas: number;
  aguardando: number;
  puladas: number;
  falhas: number;
  vagaAtual: {
    jobId: string;
    title: string;
    company: string;
    email: string;
    score: number;
  } | null;
  proximoEnvioEmSegundos: number | null;
  delayAtualSegundos: number | null;
  iniciadoEm: string | null;
  ultimoDisparoEm: string | null;
  config: AutomacaoConfig;
  mensagem: string;
}

export interface AutomacaoLog {
  id: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  job_id: string | null;
  details_json: string | null;
  created_at: string;
}

export interface CandidaturaAutomacaoRow {
  id: number;
  job_id: string;
  contact_email: string;
  company: string;
  vaga_title: string;
  vaga_url: string | null;
  location: string | null;
  salary: string | null;
  score: number;
  dados_vaga_json: string;
  status: CandidaturaStatus;
  skip_reason: string | null;
  error_message: string | null;
  delay_applied_seconds: number | null;
  envio_id: number | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}
