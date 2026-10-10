"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyController = void 0;
const papaparse_1 = __importDefault(require("papaparse"));
const library_1 = require("@prisma/client/runtime/library");
const db_1 = require("../utils/db");
const errorHandler_1 = require("../utils/errorHandler");
const audit_1 = require("../utils/audit");
const companyData_1 = require("../utils/companyData");
const companySearch_1 = require("../utils/companySearch");
const document_1 = require("../utils/document");
const spreadsheet_1 = require("../utils/spreadsheet");
const companyImport_1 = require("../utils/companyImport");
const COMPANY_INCLUDE = { groups: { include: { group: true } } };
/** O multer entrega o nome do arquivo em latin1; recupera os acentos originais (UTF-8). */
const uploadedFileName = (file) => Buffer.from(file.originalname, 'latin1').toString('utf8');
const requireFile = (req) => {
    if (!req.file)
        throw new errorHandler_1.AppError('Nenhum arquivo enviado. Selecione um arquivo .xls, .xlsx ou .csv.', 400, 'NO_FILE');
    return req.file;
};
/** Evita que o Excel interprete texto como fórmula ao abrir o CSV exportado. */
const safeCell = (value) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
exports.CompanyController = {
    list: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', ...filters } = req.query;
        const pageNumber = Math.max(1, Number(page) || 1);
        const limitNumber = Math.min(200, Math.max(1, Number(limit) || 20));
        const { ids, total } = await (0, companySearch_1.searchCompanyIds)(filters, {
            page: pageNumber,
            limit: limitNumber,
            sortBy: String(sortBy),
            sortOrder: String(sortOrder),
        });
        const found = ids.length
            ? await db_1.prisma.company.findMany({
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
    getById: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const company = await db_1.prisma.company.findUnique({
            where: { id },
            include: {
                ...COMPANY_INCLUDE,
                emailLogs: { include: { campaign: true }, orderBy: { createdAt: 'desc' }, take: 50 },
                auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
            },
        });
        if (!company)
            throw new errorHandler_1.AppError('Empresa não encontrada', 404, 'NOT_FOUND');
        res.json({ success: true, data: company });
    }),
    create: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { data, errors } = (0, companyData_1.sanitizeCompanyInput)(req.body, { requireName: true });
        if (errors.length)
            throw new errorHandler_1.AppError(errors.join('; '), 400, 'VALIDATION_ERROR');
        if (data.document) {
            const duplicate = await (0, companySearch_1.findCompanyByDocument)(data.document);
            if (duplicate) {
                throw new errorHandler_1.AppError(`Já existe uma empresa com este CPF/CNPJ: ${duplicate.name}.`, 409, 'DUPLICATE_DOCUMENT');
            }
        }
        let company;
        try {
            company = await db_1.prisma.company.create({ data: data, include: COMPANY_INCLUDE });
        }
        catch (error) {
            if (error?.code === 'P2002') {
                throw new errorHandler_1.AppError('Este CPF/CNPJ já está cadastrado no sistema.', 409, 'DUPLICATE_DOCUMENT');
            }
            throw error;
        }
        await (0, audit_1.logAudit)({ action: 'CREATE', entity: 'COMPANY', entityId: company.id, userId: req.user.id, details: data, req });
        res.status(201).json({ success: true, data: company, message: 'Empresa criada com sucesso' });
    }),
    update: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const existing = await db_1.prisma.company.findUnique({ where: { id } });
        if (!existing)
            throw new errorHandler_1.AppError('Empresa não encontrada', 404, 'NOT_FOUND');
        // Só campos conhecidos são aceitos: o frontend pode reenviar o objeto inteiro (groups, emailLogs, id…).
        const { data, errors } = (0, companyData_1.sanitizeCompanyInput)(req.body, { requireName: false });
        if (errors.length)
            throw new errorHandler_1.AppError(errors.join('; '), 400, 'VALIDATION_ERROR');
        if (data.document && data.document !== (0, document_1.onlyDigits)(existing.document)) {
            const duplicate = await (0, companySearch_1.findCompanyByDocument)(data.document, id);
            if (duplicate) {
                throw new errorHandler_1.AppError(`Já existe outra empresa com este CPF/CNPJ: ${duplicate.name}.`, 409, 'DUPLICATE_DOCUMENT');
            }
        }
        let company;
        try {
            company = await db_1.prisma.company.update({ where: { id }, data: data, include: COMPANY_INCLUDE });
        }
        catch (error) {
            if (error?.code === 'P2002') {
                throw new errorHandler_1.AppError('Este CPF/CNPJ já está cadastrado em outra empresa.', 409, 'DUPLICATE_DOCUMENT');
            }
            throw error;
        }
        await (0, audit_1.logAudit)({ action: 'UPDATE', entity: 'COMPANY', entityId: id, userId: req.user.id, details: data, req });
        res.json({ success: true, data: company, message: 'Empresa atualizada com sucesso' });
    }),
    delete: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        await db_1.prisma.company.delete({ where: { id } });
        await (0, audit_1.logAudit)({ action: 'DELETE', entity: 'COMPANY', entityId: id, userId: req.user.id, req });
        res.json({ success: true, message: 'Empresa excluída com sucesso' });
    }),
    deleteMany: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0)
            throw new errorHandler_1.AppError('Informe as empresas a excluir', 400, 'VALIDATION_ERROR');
        const result = await db_1.prisma.company.deleteMany({ where: { id: { in: ids } } });
        await (0, audit_1.logAudit)({ action: 'DELETE_MANY', entity: 'COMPANY', userId: req.user.id, details: { count: result.count, ids }, req });
        res.json({ success: true, message: `${result.count} empresas excluídas com sucesso` });
    }),
    // ---------------------------------------------------------------- Importação (.xls / .xlsx / .csv)
    /** Etapa 1: lê o arquivo, devolve colunas, amostra e o mapeamento sugerido. Nada é gravado. */
    importPreview: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const file = requireFile(req);
        const sheet = (0, spreadsheet_1.parseSpreadsheet)(file.buffer, uploadedFileName(file));
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
                fields: companyImport_1.IMPORT_FIELDS.map(({ key, label, required }) => ({ key, label, required: !!required })),
                suggestedMapping: (0, companyImport_1.suggestMapping)(sheet.headers),
            },
        });
    }),
    /** Etapa 2: valida todas as linhas com o mapeamento escolhido e aponta duplicidades. Nada é gravado. */
    importAnalyze: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const file = requireFile(req);
        const sheet = (0, spreadsheet_1.parseSpreadsheet)(file.buffer, uploadedFileName(file));
        const mapping = (0, companyImport_1.resolveMapping)(req.body.mapping, sheet.headers);
        const analysis = await (0, companyImport_1.analyzeImport)(sheet, mapping);
        res.json({
            success: true,
            data: {
                summary: analysis.summary,
                previewRows: analysis.rows.slice(0, 15).map(companyImport_1.describeRow),
                issues: analysis.rows.filter((r) => r.status === 'invalid').slice(0, 200).map(companyImport_1.describeRow),
                duplicates: analysis.rows
                    .filter((r) => r.status === 'duplicate_in_database' || r.status === 'duplicate_in_file')
                    .slice(0, 200)
                    .map(companyImport_1.describeRow),
            },
        });
    }),
    /** Etapa 3: grava em uma única transação. Duplicados: 'skip' (padrão) ou 'update' (escolha explícita). */
    importExecute: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const file = requireFile(req);
        const sheet = (0, spreadsheet_1.parseSpreadsheet)(file.buffer, uploadedFileName(file));
        const mapping = (0, companyImport_1.resolveMapping)(req.body.mapping, sheet.headers);
        const requested = req.body.duplicateMode ?? (String(req.body.updateExisting) === 'true' ? 'update' : 'skip');
        if (requested !== 'skip' && requested !== 'update') {
            throw new errorHandler_1.AppError('Opção de duplicidade inválida (use "skip" ou "update").', 400, 'VALIDATION_ERROR');
        }
        const mode = requested;
        const analysis = await (0, companyImport_1.analyzeImport)(sheet, mapping);
        const result = await (0, companyImport_1.executeImport)(analysis, mode);
        await (0, audit_1.logAudit)({
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
    exportCsv: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { ids, groupId, ...filters } = req.body || {};
        let where = {};
        if (Array.isArray(ids) && ids.length > 0) {
            where = { id: { in: ids } };
        }
        else {
            const searchFilters = { ...filters, groupId };
            if ((0, companySearch_1.hasAnyFilter)(searchFilters))
                where = { id: { in: await (0, companySearch_1.findAllCompanyIds)(searchFilters, 30000) } };
        }
        const companies = await db_1.prisma.company.findMany({ where, include: COMPANY_INCLUDE, orderBy: { name: 'asc' } });
        const csvData = companies.map((c) => ({
            Nome: safeCell(c.name),
            Email: c.email || '',
            'Emails adicionais': c.additionalEmails || '',
            Celular: c.phone || '',
            Empresa: safeCell(c.companyName || ''),
            // Com máscara para o Excel não remover zeros à esquerda; a importação aceita os dois formatos.
            'CPF ou CNPJ': c.document ? (0, document_1.formatDocument)(c.document) : '',
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
            Grupos: c.groups.map((g) => g.group.name).join('; '),
            'Data de Cadastro': c.createdAt.toISOString(),
        }));
        const csv = papaparse_1.default.unparse(csvData, { delimiter: ';', newline: '\r\n' });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="empresas_${new Date().toISOString().split('T')[0]}.csv"`);
        res.send('﻿' + csv);
    }),
    getStats: (0, errorHandler_1.asyncHandler)(async (_req, res) => {
        const [totalCompanies, totalGroups, totalCampaigns, totalEmailsSent, totalEmailsPending, totalEmailsFailed, companiesWithOverdue, totalOverdue, totalPaid, totalDue] = await Promise.all([
            db_1.prisma.company.count(), db_1.prisma.group.count(), db_1.prisma.emailCampaign.count(), db_1.prisma.emailLog.count({ where: { status: 'SENT' } }), db_1.prisma.emailLog.count({ where: { status: 'PENDING' } }), db_1.prisma.emailLog.count({ where: { status: 'FAILED' } }), db_1.prisma.company.count({ where: { overdueAmount: { gt: new library_1.Decimal(0) } } }), db_1.prisma.company.aggregate({ _sum: { overdueAmount: true } }), db_1.prisma.company.aggregate({ _sum: { paidAmount: true } }), db_1.prisma.company.aggregate({ _sum: { dueAmount: true } }),
        ]);
        const byState = await db_1.prisma.company.groupBy({ by: ['state'], _count: { id: true }, where: { state: { not: null } } });
        const byCity = await db_1.prisma.company.groupBy({ by: ['city'], _count: { id: true }, where: { city: { not: null } }, orderBy: { _count: { id: 'desc' } }, take: 15 });
        const byGroup = await db_1.prisma.group.findMany({ include: { _count: { select: { companies: true } } } });
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
//# sourceMappingURL=companyController.js.map