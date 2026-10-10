import { Decimal } from '@prisma/client/runtime/library';

export type MoneyResult = { ok: true; value: Decimal | null } | { ok: false };

const MAX_ABS = 9_999_999_999_999; // cabe em DECIMAL(15,2)

/**
 * Converte valores monetários digitados ou vindos de planilha:
 *  number | "1234.56" | "1.234,56" | "R$ 1.234,56" | "1,234.56" | "1234,5".
 * Vazio => null (válido). Texto que não é número => { ok: false }.
 */
export function parseMoney(value: unknown): MoneyResult {
  if (value === undefined || value === null) return { ok: true, value: null };

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > MAX_ABS) return { ok: false };
    return { ok: true, value: new Decimal(value) };
  }

  let s = String(value).replace(/R\$|\s| /gi, '');
  if (s === '') return { ok: true, value: null };
  if (!/^-?[\d.,]+$/.test(s)) return { ok: false };

  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);

  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let decimalSep: '.' | ',' | null = null;

  if (dots > 0 && commas > 0) {
    decimalSep = lastDot > lastComma ? '.' : ',';
  } else if (commas > 0) {
    decimalSep = commas === 1 ? ',' : null; // "1,234,567" => milhares
  } else if (dots > 0) {
    if (dots === 1 && !/^\d{1,3}\.\d{3}$/.test(s)) decimalSep = '.'; // "1234.56" decimal; "1.234" milhar (padrão BR)
  }

  let normalized: string;
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    const intPart = s.slice(0, idx).replace(/[.,]/g, '');
    const fracPart = s.slice(idx + 1).replace(/[.,]/g, '');
    normalized = `${intPart || '0'}.${fracPart || '0'}`;
  } else {
    normalized = s.replace(/[.,]/g, '');
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return { ok: false };
  const decimal = new Decimal(normalized);
  if (decimal.greaterThan(MAX_ABS)) return { ok: false };
  return { ok: true, value: negative ? decimal.negated() : decimal };
}
