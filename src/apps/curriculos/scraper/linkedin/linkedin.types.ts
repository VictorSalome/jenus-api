/**
 * Tipos para o Pipeline de Scraping do LinkedIn
 * Somente Leitura -> Extração -> Classificação -> Normalização
 */

export interface RawLinkedInPost {
  id?: string;
  url?: string;
  authorName?: string;
  authorHeadline?: string;
  companyName?: string;
  publishedAtText?: string;
  publishedAt?: string; // ISO 8601 string
  text: string;
}

export interface ConfidenceCalculation {
  score: number;
  reasons: string[];
}

export interface ParsedScrapedJob {
  id: string;
  title: string;
  company: string;
  contactEmail: string;
  description: string;
  requirements: string[];
  skills: string[];
  sourceUrl: string;
  location?: string;
  salary?: string;
  postedAt?: string;
  // Campos de depuração e calibragem (Fase 1)
  confidenceScore: number;
  confidenceReasons: string[];
  rawText?: string;
}

export interface JobParserResult {
  isJob: boolean;
  job: ParsedScrapedJob | null;
  discardReason?: string;
  confidenceScore: number;
  confidenceReasons: string[];
}

export type QueryType = "role" | "technology" | "combined";

export interface QueryExecutionRecord {
  query: string;
  type: QueryType;
  terms: string[];
  executedAt: string; // ISO 8601 string
  postsFound: number;
  qualifiedJobs: number;
}

export interface ScraperHistory {
  records: QueryExecutionRecord[];
  lastRunAt?: string;
}

export interface SelectedQuery {
  query: string;
  type: QueryType;
  terms: string[];
  priorityScore: number;
  reason: string;
}

