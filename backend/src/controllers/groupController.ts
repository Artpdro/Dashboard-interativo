import { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../utils/db';
import { AppError, asyncHandler } from '../utils/errorHandler';
import { logAudit } from '../utils/audit';
import { findAllCompanyIds, hasAnyFilter, searchCompanyIds, CompanySearchFilters } from '../utils/companySearch';

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
} as const;

const MAX_COMPANIES_PER_REQUEST = 20000;
const QUERY_CHUNK = 5000;

const chunk = <T>(items: T[], size = QUERY_CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Lista de IDs vinda do cliente: só strings não vazias, sem repetição. */
function cleanIds(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new AppError(`"${field}" deve ser uma lista de IDs`, 400, 'VALIDATION_ERROR');
  const ids = Array.from(new Set(value.filter((v) => typeof v === 'string' && v.trim() !== '').map((v: string) => v.trim())));
  if (ids.length > MAX_COMPANIES_PER_REQUEST) {
    throw new AppError(`Limite de ${MAX_COMPANIES_PER_REQUEST} empresas por operação excedido`, 400, 'VALIDATION_ERROR');
  }
  return ids;
}

type Tx = Prisma.TransactionClient;

/** IDs que realmente existem (ignora IDs inválidos em vez de quebrar a operação inteira). */
async function existingCompanyIds(tx: Tx, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunk(ids)) {
    const rows = await tx.company.findMany({ where: { id: { in: part } }, select: { id: true } });
    rows.forEach((r: { id: string }) => found.add(r.id));
  }
  return found;
}

/**
 * Aplica adições/remoções em um grupo SEM tocar nas demais associações e sem duplicar vínculos.
 * Retorna quantas empresas foram realmente adicionadas e removidas.
 */
async function applyMembershipChanges(tx: Tx, groupId: string, addIds: string[], removeIds: string[]) {
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

const GROUP_SUMMARY_INCLUDE = { _count: { select: { companies: true } } } as const;

export const GroupController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const groups = await prisma.group.findMany({ include: GROUP_SUMMARY_INCLUDE, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: groups });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        companies: { include: { company: { select: COMPANY_SLIM } }, orderBy: { company: { name: 'asc' } } },
        ...GROUP_SUMMARY_INCLUDE,
      },
    });
    if (!group) throw new AppError('Grupo não encontrado', 404, 'NOT_FOUND');
    res.json({ success: true, data: group });
  }),

  create: asyncHandler(async (req: any, res: Response) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) throw new AppError('Nome do grupo é obrigatório', 400, 'VALIDATION_ERROR');
    const description = typeof req.body.description === 'string' ? req.body.description.trim() || null : null;
    const color = typeof req.body.color === 'string' && req.body.color ? req.body.color : '#3B82F6';
    const companyIds = cleanIds(req.body.companyIds, 'companyIds');

    const { group, added } = await prisma.$transaction(
      async (tx) => {
        const created = await tx.group.create({ data: { name, description, color } });
        const changes = await applyMembershipChanges(tx, created.id, companyIds, []);
        return { group: created, added: changes.added };
      },
      { timeout: 120000, maxWait: 10000 }
    );

    await logAudit({ action: 'CREATE', entity: 'GROUP', entityId: group.id, userId: req.user.id, details: { name, description, color, companyCount: added }, req });
    res.status(201).json({ success: true, data: { ...group, _count: { companies: added } }, message: 'Grupo criado com sucesso' });
  }),

  /**
   * Edita dados do grupo e, opcionalmente, as empresas associadas:
   *  - addCompanyIds / removeCompanyIds: alterações incrementais (preserva todo o resto);
   *  - companyIds: lista completa desejada (sincroniza adicionando/removendo só a diferença).
   * Campos não enviados não são alterados.
   */
  update: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    const existing = await prisma.group.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new AppError('Grupo não encontrado', 404, 'NOT_FOUND');

    const data: { name?: string; description?: string | null; color?: string } = {};
    if (req.body.name !== undefined) {
      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name) throw new AppError('Nome do grupo é obrigatório', 400, 'VALIDATION_ERROR');
      data.name = name;
    }
    if (req.body.description !== undefined) {
      data.description = typeof req.body.description === 'string' ? req.body.description.trim() || null : null;
    }
    if (req.body.color !== undefined && typeof req.body.color === 'string' && req.body.color) data.color = req.body.color;

    const addIds = cleanIds(req.body.addCompanyIds, 'addCompanyIds');
    const removeIds = cleanIds(req.body.removeCompanyIds, 'removeCompanyIds');
    const fullList = req.body.companyIds !== undefined ? cleanIds(req.body.companyIds, 'companyIds') : null;

    const changes = await prisma.$transaction(
      async (tx) => {
        if (Object.keys(data).length) await tx.group.update({ where: { id }, data });

        let toAdd = addIds;
        let toRemove = removeIds.filter((r) => !addIds.includes(r));

        if (fullList) {
          const current = (await tx.companyGroup.findMany({ where: { groupId: id }, select: { companyId: true } })).map(
            (l: { companyId: string }) => l.companyId
          );
          const desired = new Set(fullList);
          const have = new Set(current);
          toAdd = fullList.filter((c) => !have.has(c));
          toRemove = current.filter((c: string) => !desired.has(c));
        }
        return applyMembershipChanges(tx, id, toAdd, toRemove);
      },
      { timeout: 120000, maxWait: 10000 }
    );

    const group = await prisma.group.findUnique({ where: { id }, include: GROUP_SUMMARY_INCLUDE });
    await logAudit({
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

  delete: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    await prisma.group.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entity: 'GROUP', entityId: id, userId: req.user.id, req });
    res.json({ success: true, message: 'Grupo excluído com sucesso' });
  }),

  addCompanies: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    const companyIds = cleanIds(req.body.companyIds, 'companyIds');
    if (companyIds.length === 0) throw new AppError('Informe ao menos uma empresa', 400, 'VALIDATION_ERROR');
    const group = await prisma.group.findUnique({ where: { id }, select: { id: true } });
    if (!group) throw new AppError('Grupo não encontrado', 404, 'NOT_FOUND');

    const { added } = await prisma.$transaction((tx) => applyMembershipChanges(tx, id, companyIds, []), { timeout: 120000 });
    await logAudit({ action: 'ADD_COMPANIES_TO_GROUP', entity: 'GROUP', entityId: id, userId: req.user.id, details: { requested: companyIds.length, added }, req });
    res.json({ success: true, message: `${added} empresas adicionadas ao grupo`, data: { added, alreadyInGroup: companyIds.length - added } });
  }),

  removeCompany: asyncHandler(async (req: any, res: Response) => {
    const { id, companyId } = req.params;
    await prisma.companyGroup.deleteMany({ where: { groupId: id, companyId } });
    await logAudit({ action: 'REMOVE_COMPANY_FROM_GROUP', entity: 'GROUP', entityId: id, userId: req.user.id, details: { companyId }, req });
    res.json({ success: true, message: 'Empresa removida do grupo' });
  }),

  addByFilter: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    const filters = (req.body || {}) as CompanySearchFilters;
    if (!hasAnyFilter(filters)) throw new AppError('Informe ao menos um filtro', 400, 'VALIDATION_ERROR');
    const group = await prisma.group.findUnique({ where: { id }, select: { id: true } });
    if (!group) throw new AppError('Grupo não encontrado', 404, 'NOT_FOUND');

    const ids = await findAllCompanyIds(filters, MAX_COMPANIES_PER_REQUEST);
    const { added } = await prisma.$transaction((tx) => applyMembershipChanges(tx, id, ids, []), { timeout: 120000 });
    await logAudit({ action: 'ADD_COMPANIES_BY_FILTER', entity: 'GROUP', entityId: id, userId: req.user.id, details: { matched: ids.length, added }, req });
    res.json({ success: true, message: `${added} empresas adicionadas ao grupo por filtro` });
  }),

  /**
   * Pesquisa de empresas para montar/editar grupos.
   * Filtros combináveis: name, document (CNPJ com ou sem pontuação), city, neighborhood.
   * Sem nenhum filtro devolve lista vazia (não carrega todas as empresas à toa).
   */
  searchCompanies: asyncHandler(async (req: any, res: Response) => {
    const { name, document, city, neighborhood, q, page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.min(100, Math.max(1, Number(limit) || 20));

    const filters: CompanySearchFilters = { name, document, city, neighborhood };
    if (typeof q === 'string' && q.trim().length >= 2) filters.search = q; // compatibilidade com a busca antiga

    if (!hasAnyFilter(filters)) {
      return res.json({ success: true, data: [], pagination: { page: 1, limit: limitNumber, total: 0, totalPages: 1 } });
    }

    const { ids, total } = await searchCompanyIds(filters, { page: pageNumber, limit: limitNumber, sortBy: 'name', sortOrder: 'asc' });
    const found = ids.length ? await prisma.company.findMany({ where: { id: { in: ids } }, select: COMPANY_SLIM }) : [];
    const byId = new Map(found.map((c: any) => [c.id, c]));

    res.json({
      success: true,
      data: ids.map((id) => byId.get(id)).filter(Boolean),
      pagination: { page: pageNumber, limit: limitNumber, total, totalPages: Math.max(1, Math.ceil(total / limitNumber)) },
    });
  }),
};
