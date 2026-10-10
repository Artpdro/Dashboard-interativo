import { Request, Response } from 'express';
import { prisma } from '../utils/db';
import { AppError, asyncHandler } from '../utils/errorHandler';
import { logAudit } from '../utils/audit';
import { CompanyFilters, PaginationParams, CsvImportResult } from '../types';
import Papa from 'papaparse';
import { Decimal } from '@prisma/client/runtime/library';

const buildWhereClause = (filters: CompanyFilters) => {
  const where: any = {};
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
      { companyName: { contains: filters.search, mode: 'insensitive' } },
      { document: { contains: filters.search, mode: 'insensitive' } },
      { city: { contains: filters.search, mode: 'insensitive' } },
      { state: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.name) where.name = { contains: filters.name, mode: 'insensitive' };
  if (filters.companyName) where.companyName = { contains: filters.companyName, mode: 'insensitive' };
  if (filters.document) where.document = { contains: filters.document, mode: 'insensitive' };
  if (filters.email) where.email = { contains: filters.email, mode: 'insensitive' };
  if (filters.phone) where.phone = { contains: filters.phone, mode: 'insensitive' };
  if (filters.city) where.city = { contains: filters.city, mode: 'insensitive' };
  if (filters.state) where.state = { contains: filters.state, mode: 'insensitive' };
  if (filters.groupId) where.groups = { some: { groupId: filters.groupId } };
  if (filters.minOverdueAmount !== undefined || filters.maxOverdueAmount !== undefined) {
    where.overdueAmount = {};
    if (filters.minOverdueAmount !== undefined) where.overdueAmount.gte = new Decimal(filters.minOverdueAmount);
    if (filters.maxOverdueAmount !== undefined) where.overdueAmount.lte = new Decimal(filters.maxOverdueAmount);
  }
  if (filters.minPaidAmount !== undefined || filters.maxPaidAmount !== undefined) {
    where.paidAmount = {};
    if (filters.minPaidAmount !== undefined) where.paidAmount.gte = new Decimal(filters.minPaidAmount);
    if (filters.maxPaidAmount !== undefined) where.paidAmount.lte = new Decimal(filters.maxPaidAmount);
  }
  if (filters.minDueAmount !== undefined || filters.maxDueAmount !== undefined) {
    where.dueAmount = {};
    if (filters.minDueAmount !== undefined) where.dueAmount.gte = new Decimal(filters.minDueAmount);
    if (filters.maxDueAmount !== undefined) where.dueAmount.lte = new Decimal(filters.maxDueAmount);
  }
  return where;
};

export const CompanyController = {
  list: asyncHandler(async (req: any, res: Response) => {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', ...filters } = req.query as PaginationParams & CompanyFilters;
    const where = buildWhereClause(filters);
    const skip = (Number(page) - 1) * Number(limit);
    const [companies, total] = await Promise.all([
      prisma.company.findMany({ where, include: { groups: { include: { group: true } }, _count: { select: { emailLogs: true } } }, orderBy: { [sortBy]: sortOrder }, skip, take: Number(limit) }),
      prisma.company.count({ where }),
    ]);
    res.json({ success: true, data: companies, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const company = await prisma.company.findUnique({ where: { id }, include: { groups: { include: { group: true } }, emailLogs: { include: { campaign: true }, orderBy: { createdAt: 'desc' }, take: 50 }, auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    if (!company) throw new AppError('Empresa não encontrada', 404, 'NOT_FOUND');
    res.json({ success: true, data: company });
  }),

  
  create: asyncHandler(async (req: any, res: Response) => {
    const data = req.body;

    // Converte documento vazio em null.
    // O banco aceita vários registros com documento null.
    const document =
      typeof data.document === 'string'
        ? data.document.trim() || null
        : data.document ?? null;

    // Verifica se o documento já pertence a outra empresa.
    if (document) {
      const existing = await prisma.company.findUnique({
        where: { document },
      });

      if (existing) {
        throw new AppError(
          'Este CPF/CNPJ já está cadastrado. Consulte a empresa existente.',
          400,
          'DUPLICATE_DOCUMENT'
        );
      }
    }

    let company;

    try {
      company = await prisma.company.create({
        data: {
          ...data,
          document,
          overdueAmount: data.overdueAmount
            ? new Decimal(data.overdueAmount)
            : new Decimal(0),
          paidAmount: data.paidAmount
            ? new Decimal(data.paidAmount)
            : new Decimal(0),
          dueAmount: data.dueAmount
            ? new Decimal(data.dueAmount)
            : new Decimal(0),
        },
        include: {
          groups: {
            include: { group: true },
          },
        },
      });
    } catch (error: any) {
      // Trata também possíveis conflitos de unicidade.
      if (
        error?.code === 'P2002' &&
        error?.meta?.target?.includes?.('document')
      ) {
        throw new AppError(
          'Este CPF/CNPJ já está cadastrado no sistema.',
          400,
          'DUPLICATE_DOCUMENT'
        );
      }

      throw error;
    }

    await logAudit({
      action: 'CREATE',
      entity: 'COMPANY',
      entityId: company.id,
      userId: req.user.id,
      details: { ...data, document },
      req,
    });

    res.status(201).json({
      success: true,
      data: company,
      message: 'Empresa criada com sucesso',
    });
  }),

  update: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    const data = req.body;
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) throw new AppError('Empresa não encontrada', 404, 'NOT_FOUND');
    if (data.document && data.document !== existing.document) {
      const duplicate = await prisma.company.findUnique({ where: { document: data.document } });
      if (duplicate) throw new AppError('CPF/CNPJ já cadastrado', 400, 'DUPLICATE_DOCUMENT');
    }
    const company = await prisma.company.update({ where: { id }, data: { ...data, overdueAmount: data.overdueAmount !== undefined ? new Decimal(data.overdueAmount) : undefined, paidAmount: data.paidAmount !== undefined ? new Decimal(data.paidAmount) : undefined, dueAmount: data.dueAmount !== undefined ? new Decimal(data.dueAmount) : undefined }, include: { groups: { include: { group: true } } } });
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
    const result = await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await logAudit({ action: 'DELETE_MANY', entity: 'COMPANY', userId: req.user.id, details: { count: result.count, ids }, req });
    res.json({ success: true, message: `${result.count} empresas excluídas com sucesso` });
  }),

  importCsv: asyncHandler(async (req: any, res: Response) => {
    if (!req.file) throw new AppError('Arquivo CSV não fornecido', 400, 'NO_FILE');
    const csvContent = req.file.buffer.toString('utf-8');
    const { updateExisting = true } = req.body;
    const result: CsvImportResult = { added: 0, updated: 0, ignored: 0, errors: [], total: 0 };
    Papa.parse(csvContent, {
      header: true, skipEmptyLines: true, encoding: 'UTF-8',
      complete: async (results) => {
        const rows = results.data as any[];
        result.total = rows.length;
        const columnMap: Record<string, string[]> = {
          name: ['Nome', 'nome', 'Name', 'name', 'RAZAO_SOCIAL', 'Razão Social'],
          email: ['Email', 'email', 'E-mail', 'E-mail', 'EMAIL'],
          additionalEmails: ['Emails adicionais', 'emails_adicionais', 'Additional Emails', 'EMAILS_ADICIONAIS'],
          phone: ['Celular', 'celular', 'Phone', 'phone', 'CELULAR', 'Telefone Celular'],
          companyName: ['Empresa', 'empresa', 'Company', 'company', 'EMPRESA', 'Nome Fantasia'],
          document: ['CPF ou CNPJ', 'cpf_cnpj', 'Document', 'document', 'CPF_CNPJ', 'CNPJ', 'CPF'],
          landline: ['Fone', 'fone', 'Landline', 'landline', 'FONE', 'Telefone Fixo'],
          street: ['Rua', 'rua', 'Street', 'street', 'RUA', 'Logradouro'],
          number: ['Número', 'numero', 'Number', 'number', 'NUMERO', 'Nº'],
          complement: ['Complemento', 'complemento', 'Complement', 'complement', 'COMPLEMENTO'],
          neighborhood: ['Bairro', 'bairro', 'Neighborhood', 'neighborhood', 'BAIRRO'],
          city: ['Cidade', 'cidade', 'City', 'city', 'CIDADE'],
          zipCode: ['CEP', 'cep', 'Zip', 'zip', 'ZIP_CODE', 'CEP'],
          state: ['Estado', 'estado', 'State', 'state', 'ESTADO', 'UF'],
          overdueAmount: ['Valor Vencido', 'valor_vencido', 'Overdue', 'overdue', 'VALOR_VENCIDO'],
          paidAmount: ['Valor Pago', 'valor_pago', 'Paid', 'paid', 'VALOR_PAGO'],
          dueAmount: ['Valor a Vencer', 'valor_a_vencer', 'Due', 'due', 'VALOR_A_VENCER'],
        };
        const findColumn = (row: any, keys: string[]) => { for (const key of keys) if (row[key] !== undefined && row[key] !== '') return row[key]; return undefined; };
        const parseDecimal = (value: any): Decimal | undefined => { if (!value || value === '') return undefined; const cleaned = String(value).replace(/[R$\s.]/g, '').replace(',', '.'); const num = parseFloat(cleaned); return isNaN(num) ? undefined : new Decimal(num); };
        for (let i = 0; i < rows.length; i++) {
          try {
            const row = rows[i];
            const document = findColumn(row, columnMap.document);
            const companyData = { name: findColumn(row, columnMap.name) || 'Sem Nome', email: findColumn(row, columnMap.email), additionalEmails: findColumn(row, columnMap.additionalEmails), phone: findColumn(row, columnMap.phone), companyName: findColumn(row, columnMap.companyName), document, landline: findColumn(row, columnMap.landline), street: findColumn(row, columnMap.street), number: findColumn(row, columnMap.number), complement: findColumn(row, columnMap.complement), neighborhood: findColumn(row, columnMap.neighborhood), city: findColumn(row, columnMap.city), zipCode: findColumn(row, columnMap.zipCode), state: findColumn(row, columnMap.state), overdueAmount: parseDecimal(findColumn(row, columnMap.overdueAmount)), paidAmount: parseDecimal(findColumn(row, columnMap.paidAmount)), dueAmount: parseDecimal(findColumn(row, columnMap.dueAmount)) };
            if (document) {
              const existing = await prisma.company.findUnique({ where: { document } });
              if (existing) { if (updateExisting) { await prisma.company.update({ where: { id: existing.id }, data: companyData }); result.updated++; } else result.ignored++; }
              else { await prisma.company.create({ data: companyData as any }); result.added++; }
            } else { await prisma.company.create({ data: companyData as any }); result.added++; }
          } catch (error: any) { result.errors.push({ row: i + 2, message: error.message || 'Erro desconhecido' }); }
        }
        await logAudit({ action: 'IMPORT_CSV', entity: 'COMPANY', userId: req.user.id, details: result, req });
        res.json({ success: true, data: result, message: `Importação: ${result.added} adicionadas, ${result.updated} atualizadas, ${result.ignored} ignoradas, ${result.errors.length} erros` });
      },
      error: (error: any) => { throw new AppError(`Erro CSV: ${error.message}`, 400, 'CSV_ERROR'); }
    });
  }),

  exportCsv: asyncHandler(async (req: any, res: Response) => {
    const { ids, groupId, ...filters } = req.body;
    let where: any = buildWhereClause(filters);
    if (ids && ids.length > 0) where = { id: { in: ids } };
    else if (groupId) where.groups = { some: { groupId } };
    const companies = await prisma.company.findMany({ where, include: { groups: { include: { group: true } } }, orderBy: { name: 'asc' } });
    const csvData = companies.map((c) => ({ Nome: c.name, Email: c.email || '', 'Emails adicionais': c.additionalEmails || '', Celular: c.phone || '', Empresa: c.companyName || '', 'CPF ou CNPJ': c.document || '', Fone: c.landline || '', Rua: c.street || '', Número: c.number || '', Complemento: c.complement || '', Bairro: c.neighborhood || '', Cidade: c.city || '', CEP: c.zipCode || '', Estado: c.state || '', 'Valor Vencido': c.overdueAmount?.toString() || '0', 'Valor Pago': c.paidAmount?.toString() || '0', 'Valor a Vencer': c.dueAmount?.toString() || '0', Grupos: c.groups.map((g) => g.group.name).join('; '), 'Data de Cadastro': c.createdAt.toISOString() }));
    const csv = Papa.unparse(csvData, { delimiter: ';', newline: '\r\n' });
    const bom = '\uFEFF';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="empresas_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(bom + csv);
  }),

  previewCsv: asyncHandler(async (req: any, res: Response) => {
    if (!req.file) throw new AppError('Arquivo CSV não fornecido', 400, 'NO_FILE');
    const csvContent = req.file.buffer.toString('utf-8');
    Papa.parse(csvContent, { header: true, skipEmptyLines: true, preview: 10, complete: (results) => { res.json({ success: true, data: { columns: results.meta.fields || [], rows: results.data, totalRows: results.data.length } }); } });
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
        byState: byState.map((s) => ({ state: s.state, count: s._count.id })),
        byCity: byCity.map((c) => ({ city: c.city, count: c._count.id })),
        byGroup: byGroup.map((g) => ({ name: g.name, count: g._count.companies, color: g.color })),
      },
    });
  }),
};
