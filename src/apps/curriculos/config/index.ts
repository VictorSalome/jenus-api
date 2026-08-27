import dotenv from "dotenv";
import path from "path";

dotenv.config();

const runtimeEnv = process.env.NODE_ENV || "development";
const requestedHost = (process.env.HOST || "").trim();
const isRenderRuntime =
  process.env.RENDER === "true" ||
  Boolean(process.env.RENDER_EXTERNAL_HOSTNAME);
const shouldForcePublicHost =
  runtimeEnv === "production" ||
  isRenderRuntime ||
  requestedHost === "localhost" ||
  requestedHost === "127.0.0.1";
const resolvedHost =
  shouldForcePublicHost &&
  (!requestedHost ||
    requestedHost === "localhost" ||
    requestedHost === "127.0.0.1")
    ? "0.0.0.0"
    : requestedHost || "0.0.0.0";

export interface ServerConfig {
  port: number;
  host: string;
  env: string;
  corsOrigins: string[];
  trustProxy: boolean;
}

export const serverConfig: ServerConfig = {
  port: parseInt(process.env.PORT || "3000", 10),
  host: resolvedHost,
  env: runtimeEnv,
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : [
        "http://localhost:3000",
        "https://www.linkedin.com",
        "http://localhost:3001",
        "null",
      ],
  trustProxy: process.env.TRUST_PROXY === "true",
};

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message: { error: string; status: number };
  standardHeaders: boolean;
  legacyHeaders: boolean;
}

export const rateLimitConfig: RateLimitConfig = {
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
  message: {
    error: "Muitas requisições deste IP, tente novamente mais tarde.",
    status: 429,
  },
  standardHeaders: true,
  legacyHeaders: false,
};

export interface LogConfig {
  level: string;
  logDir: string;
  maxFileSize: number;
  maxFiles: number;
  enableConsole: boolean;
  enableFile: boolean;
}

export const logConfig: LogConfig = {
  level: process.env.LOG_LEVEL || "info",
  logDir: process.env.LOG_DIR || "logs",
  maxFileSize: parseInt(process.env.LOG_MAX_FILE_SIZE || "10485760", 10),
  maxFiles: parseInt(process.env.LOG_MAX_FILES || "5", 10),
  enableConsole: process.env.LOG_CONSOLE !== "false",
  enableFile: process.env.LOG_FILE !== "false",
};

export interface EmailConfig {
  smtp: {
    host: string | undefined;
    port: number;
    secure: boolean;
    auth: { user: string | undefined; pass: string | undefined };
    tls: { rejectUnauthorized: boolean };
  };
  from: { name: string; address: string | undefined };
  templates: { subject: string; replyTo: string | undefined };
}

export const emailConfig: EmailConfig = {
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false",
    },
  },
  from: {
    name: process.env.EMAIL_FROM_NAME || "Sistema de Currículo",
    address: process.env.SMTP_USER,
  },
  templates: {
    subject:
      process.env.EMAIL_SUBJECT_TEMPLATE || "Candidatura: {candidato} - {vaga}",
    replyTo: process.env.EMAIL_REPLY_TO,
  },
};

export interface PathConfig {
  root: string;
  temp: string;
  logs: string;
  data: string;
  uploads: string;
}

export const pathConfig: PathConfig = {
  root: process.cwd(),
  temp: path.join(process.cwd(), process.env.TEMP_DIR || "temp"),
  logs: path.join(process.cwd(), process.env.LOG_DIR || "logs"),
  data: path.join(process.cwd(), process.env.DATA_DIR || "data"),
  uploads: path.join(process.cwd(), process.env.UPLOADS_DIR || "uploads"),
};

export interface ValidationConfig {
  vagaText: { minLength: number; maxLength: number };
  email: { maxLength: number };
  name: { minLength: number; maxLength: number };
  phone: { minLength: number; maxLength: number };
}

export const validationConfig: ValidationConfig = {
  vagaText: {
    minLength: parseInt(process.env.VAGA_TEXT_MIN_LENGTH || "50", 10),
    maxLength: parseInt(process.env.VAGA_TEXT_MAX_LENGTH || "10000", 10),
  },
  email: {
    maxLength: parseInt(process.env.EMAIL_MAX_LENGTH || "254", 10),
  },
  name: {
    minLength: parseInt(process.env.NAME_MIN_LENGTH || "2", 10),
    maxLength: parseInt(process.env.NAME_MAX_LENGTH || "100", 10),
  },
  phone: {
    minLength: parseInt(process.env.PHONE_MIN_LENGTH || "8", 10),
    maxLength: parseInt(process.env.PHONE_MAX_LENGTH || "15", 10),
  },
};

export interface ExtractionConfig {
  email: { regex: RegExp; corporateDomains: string[] };
  stack: { technologies: string[] };
  areas: { common: string[] };
  keywords: {
    titulo: string[];
    requisitos: string[];
    diferenciais: string[];
    responsabilidades: string[];
    beneficios: string[];
  };
}

export const extractionConfig: ExtractionConfig = {
  email: {
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    corporateDomains: ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com"],
  },
  stack: {
    technologies: [
      "React", "Vue", "Angular", "JavaScript", "TypeScript", "HTML", "CSS",
      "SASS", "SCSS", "jQuery", "Bootstrap", "Tailwind", "Material-UI",
      "Styled Components",
      "Node.js", "Express", "NestJS", "Python", "Django", "Flask", "Java",
      "Spring", "PHP", "Laravel", "C#", ".NET", "Ruby", "Rails", "Go", "Rust",
      "MySQL", "PostgreSQL", "MongoDB", "Redis", "SQLite", "Oracle", "SQL Server",
      "AWS", "Azure", "Google Cloud", "Docker", "Kubernetes", "Jenkins",
      "GitLab CI", "GitHub Actions", "Terraform", "Ansible",
      "React Native", "Flutter", "Swift", "Kotlin", "Ionic",
      "Git", "GitHub", "GitLab", "Jira", "Confluence", "Slack", "Teams",
    ],
  },
  areas: {
    common: [
      "Desenvolvimento", "Frontend", "Backend", "Full Stack", "Mobile",
      "DevOps", "Data Science", "Machine Learning", "QA", "Tester",
      "UI/UX", "Design", "Product Manager", "Scrum Master", "Arquitetura",
      "Segurança", "Infraestrutura",
    ],
  },
  keywords: {
    titulo: ["vaga", "posição", "cargo", "oportunidade", "desenvolvedor", "analista", "especialista"],
    requisitos: ["requisitos", "exigências", "necessário", "obrigatório", "experiência"],
    diferenciais: ["diferenciais", "desejável", "plus", "seria um plus", "diferencial"],
    responsabilidades: ["responsabilidades", "atribuições", "atividades", "funções"],
    beneficios: ["benefícios", "oferecemos", "vantagens", "vale", "plano"],
  },
};

export interface SecurityConfig {
  helmet: {
    contentSecurityPolicy: { directives: Record<string, string[]> };
    crossOriginEmbedderPolicy: boolean;
  };
  cors: { origin: string[]; credentials: boolean; optionsSuccessStatus: number };
  rateLimit: RateLimitConfig;
}

export const securityConfig: SecurityConfig = {
  helmet: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  },
  cors: {
    origin: serverConfig.corsOrigins,
    credentials: true,
    optionsSuccessStatus: 200,
  },
  rateLimit: rateLimitConfig,
};

export interface MonitoringConfig {
  healthCheck: { enabled: boolean; endpoint: string; interval: number };
  metrics: { enabled: boolean; endpoint: string };
}

export const monitoringConfig: MonitoringConfig = {
  healthCheck: {
    enabled: process.env.HEALTH_CHECK_ENABLED !== "false",
    endpoint: process.env.HEALTH_CHECK_ENDPOINT || "/health",
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || "30000", 10),
  },
  metrics: {
    enabled: process.env.METRICS_ENABLED === "true",
    endpoint: process.env.METRICS_ENDPOINT || "/metrics",
  },
};

export interface DevConfig {
  hotReload: boolean;
  debugMode: boolean;
  mockEmail: boolean;
  logRequests: boolean;
}

export const devConfig: DevConfig = {
  hotReload: process.env.HOT_RELOAD === "true",
  debugMode: process.env.DEBUG_MODE === "true",
  mockEmail: process.env.MOCK_EMAIL === "true",
  logRequests: process.env.LOG_REQUESTS !== "false",
};

const validateConfig = () => {
  const errors: string[] = [];

  if (serverConfig.env === "production") {
    if (!emailConfig.smtp.host) errors.push("SMTP_HOST é obrigatório em produção");
    if (!emailConfig.smtp.auth.user) errors.push("SMTP_USER é obrigatório em produção");
    if (!emailConfig.smtp.auth.pass) errors.push("SMTP_PASS é obrigatório em produção");
  }

  if (isNaN(serverConfig.port) || serverConfig.port < 1 || serverConfig.port > 65535) {
    errors.push("PORT deve ser um número válido entre 1 e 65535");
  }

  const requiredDirs = [pathConfig.temp, pathConfig.logs];

  if (errors.length > 0) {
    console.error("Erros de configuração:", errors);
    process.exit(1);
  }
};

validateConfig();

export default {
  server: serverConfig,
  rateLimit: rateLimitConfig,
  log: logConfig,
  email: emailConfig,
  paths: pathConfig,
  validation: validationConfig,
  extraction: extractionConfig,
  security: securityConfig,
  monitoring: monitoringConfig,
  dev: devConfig,
};
