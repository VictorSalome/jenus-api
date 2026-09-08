export interface SanitizedPhone {
  raw: string;
  formatted: string;
  isWhatsapp: boolean;
  waLink: string | null;
}

export function sanitizePhone(phone?: string | null): SanitizedPhone {
  if (!phone || typeof phone !== "string") {
    return {
      raw: "",
      formatted: "",
      isWhatsapp: false,
      waLink: null,
    };
  }

  let digits = phone.replace(/\D/g, "");

  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }

  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    const isWhatsapp = num.length === 9 && num.startsWith("9");

    const formattedNum =
      num.length === 9
        ? `${num.slice(0, 5)}-${num.slice(5)}`
        : `${num.slice(0, 4)}-${num.slice(4)}`;

    const formatted = `+55 (${ddd}) ${formattedNum}`;

    return {
      raw: digits,
      formatted,
      isWhatsapp,
      waLink: isWhatsapp ? `https://wa.me/${digits}` : null,
    };
  }

  return {
    raw: digits,
    formatted: phone.trim(),
    isWhatsapp: false,
    waLink: null,
  };
}
