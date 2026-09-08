import "dotenv/config";

const parseTermos = (val?: string): string[] => {
  if (!val) {
    return [
      "barbearia osasco",
      "pet shop alphaville",
      "clinica estetica pinheiros",
      "oficina mecanica barueri",
    ];
  }
  return val
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
};

export const prospeccaoConfig = {
  PROSPECCAO_CRON: process.env.PROSPECCAO_CRON || "0 10,14 * * 1-5",
  PROSPECCAO_AUTO_START: process.env.PROSPECCAO_AUTO_START === "true",
  PROSPECCAO_TERMOS_DEFAULT: parseTermos(process.env.PROSPECCAO_TERMOS_DEFAULT),
  LANDING_PAGE_BASE_URL: process.env.LANDING_PAGE_BASE_URL || "http://localhost:3000",
};

export default prospeccaoConfig;
