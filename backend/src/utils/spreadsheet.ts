/**
 * Leitura de planilhas .csv, .xls e .xlsx para a importação de empresas.
 *
 *  - O formato é decidido pelo CONTEÚDO do arquivo (assinatura dos bytes), não só pela extensão.
 *  - CSV: detecta separador (vírgula, ponto e vírgula, tab, barra vertical) e codificação
 *    (UTF-8 com/sem BOM, UTF-16 ou Windows-1252/Latin-1 — comum em arquivos exportados do Excel).
 *  - Excel: células numéricas são convertidas sem notação científica (CNPJ/CEP/telefone como número).
 *  - Mantém o número original da linha de cada registro para relatar erros com precisão.
 */
import { TextDecoder } from 'util';
import Papa from 'papaparse';
import * as XLSX from '@e965/xlsx';
import { AppError } from './errorHandler';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMPORT_ROWS = 20000;
export const MAX_IMPORT_COLUMNS = 100;
export const ALLOWED_IMPORT_EXTENSIONS = ['.csv', '.xls', '.xlsx'];

export type SheetType = 'csv' | 'xls' | 'xlsx';

export interface ParsedSheet {
  type: SheetType;
  fileName: string;
  sheetName?: string;
  delimiter?: string;
  encoding?: string;
  headers: string[];
  /** Linhas de dados, já alinhadas ao número de colunas do cabeçalho. */
  rows: string[][];
  /** Número da linha original (1 = linha do cabeçalho) de cada item de `rows`. */
  rowNumbers: number[];
}

type Sniffed = 'xlsx' | 'xls' | 'html' | 'text' | 'binary';

function sniff(buf: Buffer): Sniffed {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'xlsx';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return 'xls';
  const head = buf.subarray(0, 8000);
  // UTF-16 tem bytes nulos legítimos: reconhecido pelo BOM.
  if (head.length >= 2 && ((head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff))) return 'text';
  if (head.includes(0)) return 'binary';
  const start = head.toString('latin1').trimStart().slice(0, 200).toLowerCase();
  if (start.startsWith('<') && (start.includes('<table') || start.includes('<html') || start.includes('<?xml'))) return 'html';
  return 'text';
}

function decodeText(buf: Buffer): { text: string; encoding: string } {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(buf.subarray(2)), encoding: 'UTF-16' };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(buf.subarray(2)), encoding: 'UTF-16' };
  }
  const body = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf;
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'UTF-8' };
  } catch {
    // Arquivos do Excel em português costumam estar em Windows-1252.
    return { text: new TextDecoder('windows-1252').decode(body), encoding: 'Windows-1252' };
  }
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return Number.isInteger(value) ? value.toFixed(0) : String(value); // evita 1,23457E+13
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value).replace(/ /g, ' ').trim();
}

/** Cabeçalho -> lista única de nomes (vazios viram "Coluna N"; repetidos ganham sufixo). */
function buildHeaders(first: string[]): string[] {
  const used = new Map<string, number>();
  return first.map((raw, i) => {
    let name = raw.trim() || `Coluna ${i + 1}`;
    const count = (used.get(name.toLowerCase()) || 0) + 1;
    used.set(name.toLowerCase(), count);
    if (count > 1) name = `${name} (${count})`;
    return name;
  });
}

function finalize(
  base: Omit<ParsedSheet, 'headers' | 'rows' | 'rowNumbers'>,
  matrix: string[][],
  rowOffset = 0
): ParsedSheet {
  // Descarta linhas totalmente vazias mantendo a numeração original.
  const kept: Array<{ cells: string[]; n: number }> = [];
  matrix.forEach((cells, i) => {
    if (cells.some((c) => c.trim() !== '')) kept.push({ cells, n: i + 1 + rowOffset });
  });

  if (kept.length === 0) throw new AppError('O arquivo está vazio.', 400, 'EMPTY_FILE');
  if (kept.length < 2) throw new AppError('O arquivo tem cabeçalho, mas nenhuma linha de dados.', 400, 'NO_DATA_ROWS');

  const [headerRow, ...dataRows] = kept;
  const width = Math.max(headerRow.cells.length, ...dataRows.map((r) => r.cells.length));
  if (width > MAX_IMPORT_COLUMNS) {
    throw new AppError(`O arquivo tem colunas demais (máximo ${MAX_IMPORT_COLUMNS}).`, 400, 'TOO_MANY_COLUMNS');
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new AppError(
      `O arquivo tem ${dataRows.length} linhas; o máximo por importação é ${MAX_IMPORT_ROWS}. Divida o arquivo em partes.`,
      400,
      'TOO_MANY_ROWS'
    );
  }

  const padded = (cells: string[]) => Array.from({ length: width }, (_, i) => (cells[i] ?? '').trim());
  return {
    ...base,
    headers: buildHeaders(padded(headerRow.cells)),
    rows: dataRows.map((r) => padded(r.cells)),
    rowNumbers: dataRows.map((r) => r.n),
  };
}

function parseCsv(buf: Buffer, fileName: string): ParsedSheet {
  const { text, encoding } = decodeText(buf);
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: false,
    delimitersToGuess: [',', ';', '\t', '|'],
  });

  const quoteError = result.errors.find((e) => e.type === 'Quotes');
  if (quoteError) {
    throw new AppError(
      `O CSV está malformado (aspas não fechadas perto do registro ${(quoteError.row ?? 0) + 1}).`,
      400,
      'CSV_MALFORMED'
    );
  }

  const matrix = (result.data as unknown[]).map((row) => (Array.isArray(row) ? row.map((c) => cellToString(c)) : []));
  return finalize({ type: 'csv', fileName, encoding, delimiter: result.meta.delimiter }, matrix);
}

function parseExcel(buf: Buffer, fileName: string, kind: 'xls' | 'xlsx', fromText = false): ParsedSheet {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fromText ? buf.toString('utf8') : buf, {
      type: fromText ? 'string' : 'buffer',
      cellDates: true,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      sheetStubs: false,
      sheetRows: MAX_IMPORT_ROWS + 2,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (/password|encrypt/i.test(message)) {
      throw new AppError('A planilha está protegida por senha. Remova a senha e tente novamente.', 400, 'FILE_PROTECTED');
    }
    throw new AppError('Não foi possível ler a planilha: o arquivo está corrompido ou não é um Excel válido.', 400, 'FILE_INVALID');
  }

  // Usa a primeira aba que tenha conteúdo.
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    if (range.e.c + 1 > MAX_IMPORT_COLUMNS * 2) {
      throw new AppError(`A planilha tem colunas demais (máximo ${MAX_IMPORT_COLUMNS}).`, 400, 'TOO_MANY_COLUMNS');
    }
    const matrix = XLSX.utils
      .sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '', blankrows: true })
      .map((row) => (Array.isArray(row) ? row.map((c) => cellToString(c)) : []));
    if (matrix.some((r) => r.some((c) => c !== ''))) {
      // sheet_to_json começa na primeira linha usada da aba (range.s.r), não na linha 1.
      return finalize({ type: kind, fileName, sheetName }, matrix, range.s.r);
    }
  }
  throw new AppError('A planilha está vazia.', 400, 'EMPTY_FILE');
}

export function getExtension(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i >= 0 ? fileName.slice(i).toLowerCase() : '';
}

export function parseSpreadsheet(buffer: Buffer, fileName: string): ParsedSheet {
  const ext = getExtension(fileName);
  if (!ALLOWED_IMPORT_EXTENSIONS.includes(ext)) {
    throw new AppError('Formato não suportado. Envie um arquivo .xls, .xlsx ou .csv.', 400, 'INVALID_FILE_TYPE');
  }
  if (!buffer || buffer.length === 0) throw new AppError('O arquivo está vazio.', 400, 'EMPTY_FILE');
  if (buffer.length > MAX_IMPORT_BYTES) {
    throw new AppError(`O arquivo excede o tamanho máximo de ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`, 400, 'FILE_TOO_LARGE');
  }

  switch (sniff(buffer)) {
    case 'xlsx':
      return parseExcel(buffer, fileName, 'xlsx');
    case 'xls':
      return parseExcel(buffer, fileName, 'xls');
    case 'html':
      // Sistemas costumam exportar uma tabela HTML com extensão .xls.
      return parseExcel(buffer, fileName, 'xls', true);
    case 'text':
      return parseCsv(buffer, fileName);
    default:
      throw new AppError(
        'O conteúdo do arquivo não é reconhecido como planilha (.xls, .xlsx) nem como CSV.',
        400,
        'INVALID_FILE_CONTENT'
      );
  }
}
