import { Request, Response } from 'express';
import Papa from 'papaparse';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../utils/db';
import { AppError, asyncHandler } from '../utils/errorHandler';
import { logAudit } from '../utils/audit';
import { sanitizeCompanyInput } from '../utils/companyData';
import { findAllCompanyIds, findCompanyByDocument, hasAnyFilter, searchCompanyIds, CompanySearchFilters } from '../utils/companySearch';
import { formatDocument, onlyDigits } from '../utils/document';
import { parseSpreadsheet } from '../utils/spreadsheet';
import {
  IMPORT_FIELDS,
  analyzeImport,
  describeRow,
  executeImport,
  resolveMapping,
  suggestMapping,
  DuplicateMode,
} from '../utils/companyImport';

const COMPANY_INCLUDE = { groups: { include: { group: true } } } as const;

/** O multer entrega o nome do arquivo em latin1; recupera os acentos originais (UTF-8). */
const uploadedFileName = (file: Express.Multer.File): string => Buffer.from(file.originalname, 'latin1').toString('utf8');

const requireFile = (req: any): Express.Multer.File => {
  if (!req.file) throw new AppError('Nenhum arquivo enviado. Selecione um arquivo .xls, .xlsx ou .csv.', 400, 'NO_FILE');
  return req.file;
};

/** Evita que o Excel interprete texto como fórmula ao abrir o CSV exportado. */
const safeCell = (value: string): string => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

export const CompanyController = {
  list: asyncHandler(async (req: any, res: Response) => {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', ...filters } = req.query;
    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.min(200, Math.max(1, Number(limit) || 20));

    const { ids, total } = await searchCompanyIds(filters as CompanySearchFilters, {
      page: pageNumber,
      limit: limitNumber,
      sortBy: String(sortBy),
      sortOrder: String(sortOrder),
    });

    const found = ids.length
      ? await prisma.company.findMany({
          where: { id: { in: ids } },
          include: { ...COMPANY_INCLUDE, _count: { select: { emailLogs: true } } },
        })
      : [];
    const byId = new Map(found.map((c) => [c.id, c]));
    const companies = ids.map((id) => byId.get(id)).filter(Boolean);

    res.json({
      success: true,
      data: companies,
      pagination: { page: pageNumber, limit: limitNumber, total, totalPages: Math.max(1, Math.ceil(total / limitNumber)) },
    });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        ...COMPANY_INCLUDE,
        emailLogs: { include: { campaign: true }, orderBy: { createdAt: 'desc' }, take: 50 },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!company) throw new AppError('Empresa não encontrada', 404, 'NOT_FOUND');
    res.json({ success: true, data: company });
  }),

  create: asyncHandler(async (req: any, res: Response) => {
    const { data, errors } = sanitizeCompanyInput(req.body, { requireName: true });
    if (errors.length) throw new AppError(errors.join('; '), 400, 'VALIDATION_ERROR');

    if (data.document) {
      const duplicate = await findCompanyByDocument(data.document as string);
      if (duplicate) {
        throw new AppError(`Já existe uma empresa com este CPF/CNPJ: ${duplicate.name}.`, 409, 'DUPLICATE_DOCUMENT');
      }
    }

    let company;
    try {
      company = await prisma.company.create({ data: data as any, include: COMPANY_INCLUDE });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new AppError('Este CPF/CNPJ já está cadastrado no sistema.', 409, 'DUPLICATE_DOCUMENT');
      }
      throw error;
    }

    await logAudit({ action: 'CREATE', entity: 'COMPANY', entityId: company.id, userId: req.user.id, details: data, req });
    res.status(201).json({ success: true, data: company, message: 'Empresa criada com sucesso' });
  }),

  update: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) throw new AppError('Empresa não encontrada', 404, 'NOT_FOUND');

    // Só campos conhecidos são aceitos: o frontend pode reenviar o objeto inteiro (groups, emailLogs, id…).
    const { data, errors } = sanitizeCompanyInput(req.body, { requireName: false });
    if (errors.length) throw new AppError(errors.join('; '), 400, 'VALIDATION_ERROR');

    if (data.document && data.document !== onlyDigits(existing.document)) {
      const duplicate = await findCompanyByDocument(data.document as string, id);
      if (duplicate) {
        throw new AppError(`Já existe outra empresa com este CPF/CNPJ: ${duplicate.name}.`, 409, 'DUPLICATE_DOCUMENT');
      }
    }

    let company;
    try {
      company = await prisma.company.update({ where: { id }, data: data as any, include: COMPANY_INCLUDE });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new AppError('Este CPF/CNPJ já está cadastrado em outra empresa.', 409, 'DUPLICATE_DOCUMENT');
      }
      throw error;
    }

    await logAudit({ action: 'UPDATE', entity: 'COMPANY', entityId: id, userId: req.user.id, details: data, req });
    res.json({ success: true, data: company, message: 'Empresa atualizada com sucesso' });
  }),

  delete: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    await prisma.company.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entity: 'COMPANY', entityId: id, userId: req.user.id, req });
    res.json({ success: true, message: 'Empresa excluída com sucesso' });
  }),

  deleteMany: asyncHandler(async (req: any, res: Response) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) throw new AppError('Informe as empresas a excluir', 400, 'VALIDATION_ERROR');
    const result = await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await logAudit({ action: 'DELETE_MANY', entity: 'COMPANY', userId: req.user.id, details: { count: result.count, ids }, req });
    res.json({ success: true, message: `${result.count} empresas excluídas com sucesso` });
  }),

  // ---------------------------------------------------------------- Importação (.xls / .xlsx / .csv)

  /** Etapa 1: lê o arquivo, devolve colunas, amostra e o mapeamento sugerido. Nada é gravado. */
  importPreview: asyncHandler(async (req: any, res: Response) => {
    const file = requireFile(req);
    const sheet = parseSpreadsheet(file.buffer, uploadedFileName(file));
    res.json({
      success: true,
      data: {
        fileName: sheet.fileName,
        fileType: sheet.type,
        sheetName: sheet.sheetName,
        delimiter: sheet.delimiter,
        encoding: sheet.encoding,
        totalRows: sheet.rows.length,
        headers: sheet.headers,
        sampleRows: sheet.rows.slice(0, 10),
        fields: IMPORT_FIELDS.map(({ key, label, required }) => ({ key, label, required: !!required })),
        suggestedMapping: suggestMapping(sheet.headers),
      },
    });
  }),

  /** Etapa 2: valida todas as linhas com o mapeamento escolhido e aponta duplicidades. Nada é gravado. */
  importAnalyze: asyncHandler(async (req: any, res: Response) => {
    const file = requireFile(req);
    const sheet = parseSpreadsheet(file.buffer, uploadedFileName(file));
    const mapping = resolveMapping(req.body.mapping, sheet.headers);
    const analysis = await analyzeImport(sheet, mapping);

    res.json({
      success: true,
      data: {
        summary: analysis.summary,
        previewRows: analysis.rows.slice(0, 15).map(describeRow),
        issues: analysis.rows.filter((r) => r.status === 'invalid').slice(0, 200).map(describeRow),
        duplicates: analysis.rows
          .filter((r) => r.status === 'duplicate_in_database' || r.status === 'duplicate_in_file')
          .slice(0, 200)
          .map(describeRow),
      },
    });
  }),

  /** Etapa 3: grava em uma única transação. Duplicados: 'skip' (padrão) ou 'update' (escolha explícita). */
  importExecute: asyncHandler(async (req: any, res: Response) => {
    const file = requireFile(req);
    const sheet = parseSpreadsheet(file.buffer, uploadedFileName(file));
    const mapping = resolveMapping(req.body.mapping, sheet.headers);

    const requested = req.body.duplicateMode ?? (String(req.body.updateExisting) === 'true' ? 'update' : 'skip');
    if (requested !== 'skip' && requested !== 'update') {
      throw new AppError('Opção de duplicidade inválida (use "skip" ou "update").', 400, 'VALIDATION_ERROR');
    }
    const mode: DuplicateMode = requested;

    const analysis = await analyzeImport(sheet, mapping);
    const result = await executeImport(analysis, mode);

    await logAudit({
      action: 'IMPORT_COMPANIES',
      entity: 'COMPANY',
      userId: req.user.id,
      details: { ...result, file: sheet.fileName, type: sheet.type, errors: result.errors.length, ignoredRows: result.ignoredRows.length },
      req,
    });

    res.json({
      success: true,
      data: result,
      message: `Importação concluída: ${result.added} adicionadas, ${result.updated} atualizadas, ${result.ignored} ignoradas, ${result.rejected} rejeitadas`,
    });
  }),

  // ---------------------------------------------------------------- Exportação

  exportCsv: asyncHandler(async (req: any, res: Response) => {
    const { ids, groupId, ...filters } = req.body || {};

    let where: any = {};
    if (Array.isArray(ids) && ids.length > 0) {
      where = { id: { in: ids } };
    } else {
      const searchFilters: CompanySearchFilters = { ...filters, groupId };
      if (hasAnyFilter(searchFilters)) where = { id: { in: await findAllCompanyIds(searchFilters, 30000) } };
    }

    const companies = await prisma.company.findMany({ where, include: COMPANY_INCLUDE, orderBy: { name: 'asc' } });
    const csvData = companies.map((c) => ({
      Nome: safeCell(c.name),
      Email: c.email || '',
      'Emails adicionais': c.additionalEmails || '',
      Celular: c.phone || '',
      Empresa: safeCell(c.companyName || ''),
      // Com máscara para o Excel não remover zeros à esquerda; a importação aceita os dois formatos.
      'CPF ou CNPJ': c.document ? formatDocument(c.document) : '',
      Fone: c.landline || '',
      Rua: safeCell(c.street || ''),
      Número: c.number || '',
      Complemento: safeCell(c.complement || ''),
      Bairro: safeCell(c.neighborhood || ''),
      Cidade: safeCell(c.city || ''),
      CEP: c.zipCode || '',
      Estado: c.state || '',
      'Valor Vencido': c.overdueAmount?.toString() || '0',
      'Valor Pago': c.paidAmount?.toString() || '0',
      'Valor a Vencer': c.dueAmount?.toString() || '0',
      Grupos: c.groups.map((g: any) => g.group.name).join('; '),
      'Data de Cadastro': c.createdAt.toISOString(),
    }));
    const csv = Papa.unparse(csvData, { delimiter: ';', newline: '\r\n' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="empresas_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send('﻿' + csv);
  }),

  getStats: asyncHandler(async (_req: Request, res: Response) => {
    const [totalCompanies, totalGroups, totalCampaigns, totalEmailsSent, totalEmailsPending, totalEmailsFailed, companiesWithOverdue, totalOverdue, totalPaid, totalDue] = await Promise.all([
      prisma.company.count(), prisma.group.count(), prisma.emailCampaign.count(), prisma.emailLog.count({ where: { status: 'SENT' } }), prisma.emailLog.count({ where: { status: 'PENDING' } }), prisma.emailLog.count({ where: { status: 'FAILED' } }), prisma.company.count({ where: { overdueAmount: { gt: new Decimal(0) } } }), prisma.company.aggregate({ _sum: { overdueAmount: true } }), prisma.company.aggregate({ _sum: { paidAmount: true } }), prisma.company.aggregate({ _sum: { dueAmount: true } }),
    ]);
    const byState = await prisma.company.groupBy({ by: ['state'], _count: { id: true }, where: { state: { not: null } } });
    const byCity = await prisma.company.groupBy({ by: ['city'], _count: { id: true }, where: { city: { not: null } }, orderBy: { _count: { id: 'desc' } }, take: 15 });
    const byGroup = await prisma.group.findMany({ include: { _count: { select: { companies: true } } } });
    res.json({
      success: true,
      data: {
        totalCompanies, totalGroups, totalCampaigns, totalEmailsSent, totalEmailsPending, totalEmailsFailed, companiesWithOverdue,
        totalOverdue: totalOverdue._sum.overdueAmount || 0, totalPaid: totalPaid._sum.paidAmount || 0, totalDue: totalDue._sum.dueAmount || 0,
        byState: byState.map((s: any) => ({ state: s.state, count: s._count.id })),
        byCity: byCity.map((c: any) => ({ city: c.city, count: c._count.id })),
        byGroup: byGroup.map((g: any) => ({ name: g.name, count: g._count.companies, color: g.color })),
      },
    });
  }),
};
