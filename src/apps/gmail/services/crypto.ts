import crypto from "crypto";

/**
 * Criptografia dos tokens OAuth em repouso (AES-256-GCM, nativo do Node).
 * Formato persistido: base64(iv):base64(tag):base64(ciphertext)
 * Nenhum token em texto plano toca o banco.
 */

const getKey = (): Buffer => {
  const raw = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY não configurada");
  }
  // Aceita chave em hex (32 bytes = 64 chars) ou texto de 32 bytes.
  const normalized = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(normalized)) {
    return Buffer.from(normalized, "hex");
  }
  const buf = Buffer.from(normalized, "utf8");
  if (buf.length < 32) {
    throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY deve ter 32 bytes (hex)");
  }
  return buf.subarray(0, 32);
};

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptToken(encoded: string): string {
  const [ivB64, tagB64, dataB64] = encoded.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Token armazenado em formato inválido");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
