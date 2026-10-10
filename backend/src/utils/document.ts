/**
 * Utilitários de CPF/CNPJ.
 *
 * Regra do sistema: o documento é SEMPRE armazenado e comparado apenas com dígitos
 * (sem pontos, barras ou traços). A formatação é só visual.
 */

export const onlyDigits = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value).replace(/\D/g, '');

const allEqual = (d: string) => /^(\d)\1+$/.test(d);

export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || allEqual(digits)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}

export function isValidCnpj(digits: string): boolean {
  if (!/^\d{14}$/.test(digits) || allEqual(digits)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}

/**
 * Planilhas costumam perder zeros à esquerda (número armazenado como número).
 * Só recupera os zeros quando o valor completado passa na validação dos dígitos
 * verificadores, para nunca "inventar" um documento.
 */
export function recoverLeadingZeros(digits: string): string {
  if (!digits) return digits;
  if (digits.length === 14 || digits.length === 11) return digits;
  if (digits.length >= 11 && digits.length < 14) {
    const padded = digits.padStart(14, '0');
    if (isValidCnpj(padded)) return padded;
  }
  if (digits.length >= 8 && digits.length < 11) {
    const padded = digits.padStart(11, '0');
    if (isValidCpf(padded)) return padded;
  }
  return digits;
}

export type DocumentKind = 'CPF' | 'CNPJ';

export type ParsedDocument =
  | { ok: true; value: string | null; kind: DocumentKind | null }
  | { ok: false; message: string };

/** Normaliza e valida um CPF/CNPJ vindo de formulário, API ou planilha. Vazio => null (válido). */
export function parseDocument(raw: unknown): ParsedDocument {
  const digits = recoverLeadingZeros(onlyDigits(raw));
  if (!digits) return { ok: true, value: null, kind: null };
  if (digits.length === 14) {
    return isValidCnpj(digits)
      ? { ok: true, value: digits, kind: 'CNPJ' }
      : { ok: false, message: 'CNPJ inválido (os dígitos verificadores não conferem)' };
  }
  if (digits.length === 11) {
    return isValidCpf(digits)
      ? { ok: true, value: digits, kind: 'CPF' }
      : { ok: false, message: 'CPF inválido (os dígitos verificadores não conferem)' };
  }
  return { ok: false, message: 'CPF/CNPJ deve ter 11 (CPF) ou 14 (CNPJ) dígitos' };
}

/** Máscara apenas para exibição. */
export function formatDocument(digits: string | null | undefined): string {
  const d = onlyDigits(digits);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return digits ?? '';
}
