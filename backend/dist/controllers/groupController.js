"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupController = void 0;
const db_1 = require("../utils/db");
const errorHandler_1 = require("../utils/errorHandler");
const audit_1 = require("../utils/audit");
const companySearch_1 = require("../utils/companySearch");
/** Campos enxutos de empresa usados na seleção de grupos (evita trafegar o cadastro completo). */
const COMPANY_SLIM = {
    id: true,
    name: true,
    companyName: true,
    document: true,
    email: true,
    city: true,
    neighborhood: true,
    state: true,
};
const MAX_COMPANIES_PER_REQUEST = 20000;
const QUERY_CHUNK = 5000;
const chunk = (items, size = QUERY_CHUNK) => {
    const out = [];
    for (let i = 0; i < items.length; i += size)
        out.push(items.slice(i, i + size));
    return out;
};
/** Lista de IDs vinda do cliente: só strings não vazias, sem repetição. */
function cleanIds(value, field) {
    if (value === undefined || value === null)
        return [];
    if (!Array.isArray(value))
        throw new errorHandler_1.AppError(`"${field}" deve ser uma lista de IDs`, 400, 'VALIDATION_ERROR');
    const ids = Array.from(new Set(value.filter((v) => typeof v === 'string' && v.trim() !== '').map((v) => v.trim())));
    if (ids.length > MAX_COMPANIES_PER_REQUEST) {
        throw new errorHandler_1.AppError(`Limite de ${MAX_COMPANIES_PER_REQUEST} empresas por operação excedido`, 400, 'VALIDATION_ERROR');
    }
    return ids;
}
/** IDs que realmente existem (ignora IDs inválidos em vez de quebrar a operação inteira). */
async function existingCompanyIds(tx, ids) {
    const found = new Set();
    for (const part of chunk(ids)) {
        const rows = await tx.company.findMany({ where: { id: { in: part } }, select: { id: true } });
        rows.forEach((r) => found.add(r.id));
    }
    return found;
}
/**
 * Aplica adições/remoções em um grupo SEM tocar nas demais associações e sem duplicar vínculos.
 * Retorna quantas empresas foram realmente adicionadas e removidas.
 */
async function applyMembershipChanges(tx, groupId, addIds, removeIds) {
    let removed = 0;
    let added = 0;
    if (removeIds.length) {
        for (const part of chunk(removeIds)) {
            const res = await tx.companyGroup.deleteMany({ where: { groupId, companyId: { in: part } } });
            removed += res.count;
        }
    }
    if (addIds.length) {
        const valid = Array.from(await existingCompanyIds(tx, addIds));
        for (const part of chunk(valid)) {
            const res = await tx.companyGroup.createMany({
                data: part.map((companyId) => ({ groupId, companyId })),
                skipDuplicates: true, // @@unique([companyId, groupId]) também protege contra duplicidade
            });
            added += res.count;
        }
    }
    return { added, removed };
}
const GROUP_SUMMARY_INCLUDE = { _count: { select: { companies: true } } };
exports.GroupController = {
    list: (0, errorHandler_1.asyncHandler)(async (_req, res) => {
        const groups = await db_1.prisma.group.findMany({ include: GROUP_SUMMARY_INCLUDE, orderBy: { createdAt: 'desc' } });
        res.json({ success: true, data: groups });
    }),
    getById: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const group = await db_1.prisma.group.findUnique({
            where: { id },
            include: {
                companies: { include: { company: { select: COMPANY_SLIM } }, orderBy: { company: { name: 'asc' } } },
                ...GROUP_SUMMARY_INCLUDE,
            },
        });
        if (!group)
            throw new errorHandler_1.AppError('Grupo não encontrado', 404, 'NOT_FOUND');
        res.json({ success: true, data: group });
    }),
    create: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        if (!name)
            throw new errorHandler_1.AppError('Nome do grupo é obrigatório', 400, 'VALIDATION_ERROR');
        const description = typeof req.body.description === 'string' ? req.body.description.trim() || null : null;
        const color = typeof req.body.color === 'string' && req.body.color ? req.body.color : '#3B82F6';
        const companyIds = cleanIds(req.body.companyIds, 'companyIds');
        const { group, added } = await db_1.prisma.$transaction(async (tx) => {
            const created = await tx.group.create({ data: { name, description, color } });
            const changes = await applyMembershipChanges(tx, created.id, companyIds, []);
            return { group: created, added: changes.added };
        }, { timeout: 120000, maxWait: 10000 });
        await (0, audit_1.logAudit)({ action: 'CREATE', entity: 'GROUP', entityId: group.id, userId: req.user.id, details: { name, description, color, companyCount: added }, req });
        res.status(201).json({ success: true, data: { ...group, _count: { companies: added } }, message: 'Grupo criado com sucesso' });
    }),
    /**
     * Edita dados do grupo e, opcionalmente, as empresas associadas:
     *  - addCompanyIds / removeCompanyIds: alterações incrementais (preserva todo o resto);
     *  - companyIds: lista completa desejada (sincroniza adicionando/removendo só a diferença).
     * Campos não enviados não são alterados.
     */
    update: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const existing = await db_1.prisma.group.findUnique({ where: { id }, select: { id: true } });
        if (!existing)
            throw new errorHandler_1.AppError('Grupo não encontrado', 404, 'NOT_FOUND');
        const data = {};
        if (req.body.name !== undefined) {
            const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
            if (!name)
                throw new errorHandler_1.AppError('Nome do grupo é obrigatório', 400, 'VALIDATION_ERROR');
            data.name = name;
        }
        if (req.body.description !== undefined) {
            data.description = typeof req.body.description === 'string' ? req.body.description.trim() || null : null;
        }
        if (req.body.color !== undefined && typeof req.body.color === 'string' && req.body.color)
            data.color = req.body.color;
        const addIds = cleanIds(req.body.addCompanyIds, 'addCompanyIds');
        const removeIds = cleanIds(req.body.removeCompanyIds, 'removeCompanyIds');
        const fullList = req.body.companyIds !== undefined ? cleanIds(req.body.companyIds, 'companyIds') : null;
        const changes = await db_1.prisma.$transaction(async (tx) => {
            if (Object.keys(data).length)
                await tx.group.update({ where: { id }, data });
            let toAdd = addIds;
            let toRemove = removeIds.filter((r) => !addIds.includes(r));
            if (fullList) {
                const current = (await tx.companyGroup.findMany({ where: { groupId: id }, select: { companyId: true } })).map((l) => l.companyId);
                const desired = new Set(fullList);
                const have = new Set(current);
                toAdd = fullList.filter((c) => !have.has(c));
                toRemove = current.filter((c) => !desired.has(c));
            }
            return applyMembershipChanges(tx, id, toAdd, toRemove);
        }, { timeout: 120000, maxWait: 10000 });
        const group = await db_1.prisma.group.findUnique({ where: { id }, include: GROUP_SUMMARY_INCLUDE });
        await (0, audit_1.logAudit)({
            action: 'UPDATE',
            entity: 'GROUP',
            entityId: id,
            userId: req.user.id,
            details: { ...data, companiesAdded: changes.added, companiesRemoved: changes.removed },
            req,
        });
        res.json({
            success: true,
            data: group,
            changes,
            message: 'Grupo atualizado com sucesso',
        });
    }),
    delete: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        await db_1.prisma.group.delete({ where: { id } });
        await (0, audit_1.logAudit)({ action: 'DELETE', entity: 'GROUP', entityId: id, userId: req.user.id, req });
        res.json({ success: true, message: 'Grupo excluído com sucesso' });
    }),
    addCompanies: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const companyIds = cleanIds(req.body.companyIds, 'companyIds');
        if (companyIds.length === 0)
            throw new errorHandler_1.AppError('Informe ao menos uma empresa', 400, 'VALIDATION_ERROR');
        const group = await db_1.prisma.group.findUnique({ where: { id }, select: { id: true } });
        if (!group)
            throw new errorHandler_1.AppError('Grupo não encontrado', 404, 'NOT_FOUND');
        const { added } = await db_1.prisma.$transaction((tx) => applyMembershipChanges(tx, id, companyIds, []), { timeout: 120000 });
        await (0, audit_1.logAudit)({ action: 'ADD_COMPANIES_TO_GROUP', entity: 'GROUP', entityId: id, userId: req.user.id, details: { requested: companyIds.length, added }, req });
        res.json({ success: true, message: `${added} empresas adicionadas ao grupo`, data: { added, alreadyInGroup: companyIds.length - added } });
    }),
    removeCompany: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id, companyId } = req.params;
        await db_1.prisma.companyGroup.deleteMany({ where: { groupId: id, companyId } });
        await (0, audit_1.logAudit)({ action: 'REMOVE_COMPANY_FROM_GROUP', entity: 'GROUP', entityId: id, userId: req.user.id, details: { companyId }, req });
        res.json({ success: true, message: 'Empresa removida do grupo' });
    }),
    addByFilter: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const filters = (req.body || {});
        if (!(0, companySearch_1.hasAnyFilter)(filters))
            throw new errorHandler_1.AppError('Informe ao menos um filtro', 400, 'VALIDATION_ERROR');
        const group = await db_1.prisma.group.findUnique({ where: { id }, select: { id: true } });
        if (!group)
            throw new errorHandler_1.AppError('Grupo não encontrado', 404, 'NOT_FOUND');
        const ids = await (0, companySearch_1.findAllCompanyIds)(filters, MAX_COMPANIES_PER_REQUEST);
        const { added } = await db_1.prisma.$transaction((tx) => applyMembershipChanges(tx, id, ids, []), { timeout: 120000 });
        await (0, audit_1.logAudit)({ action: 'ADD_COMPANIES_BY_FILTER', entity: 'GROUP', entityId: id, userId: req.user.id, details: { matched: ids.length, added }, req });
        res.json({ success: true, message: `${added} empresas adicionadas ao grupo por filtro` });
    }),
    /**
     * Pesquisa de empresas para montar/editar grupos.
     * Filtros combináveis: name, document (CNPJ com ou sem pontuação), city, neighborhood.
     * Sem nenhum filtro devolve lista vazia (não carrega todas as empresas à toa).
     */
    searchCompanies: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { name, document, city, neighborhood, q, page = 1, limit = 20 } = req.query;
        const pageNumber = Math.max(1, Number(page) || 1);
        const limitNumber = Math.min(100, Math.max(1, Number(limit) || 20));
        const filters = { name, document, city, neighborhood };
        if (typeof q === 'string' && q.trim().length >= 2)
            filters.search = q; // compatibilidade com a busca antiga
        if (!(0, companySearch_1.hasAnyFilter)(filters)) {
            return res.json({ success: true, data: [], pagination: { page: 1, limit: limitNumber, total: 0, totalPages: 1 } });
        }
        const { ids, total } = await (0, companySearch_1.searchCompanyIds)(filters, { page: pageNumber, limit: limitNumber, sortBy: 'name', sortOrder: 'asc' });
        const found = ids.length ? await db_1.prisma.company.findMany({ where: { id: { in: ids } }, select: COMPANY_SLIM }) : [];
        const byId = new Map(found.map((c) => [c.id, c]));
        res.json({
            success: true,
            data: ids.map((id) => byId.get(id)).filter(Boolean),
            pagination: { page: pageNumber, limit: limitNumber, total, totalPages: Math.max(1, Math.ceil(total / limitNumber)) },
        });
    }),
};
//# sourceMappingURL=groupController.js.map