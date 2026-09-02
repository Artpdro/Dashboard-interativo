import { Request, Response } from 'express';
import { prisma } from '../utils/db';
import { AppError, asyncHandler } from '../utils/errorHandler';
import { logAudit } from '../utils/audit';

export const GroupController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const groups = await prisma.group.findMany({ include: { _count: { select: { companies: true } } }, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: groups });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const group = await prisma.group.findUnique({ where: { id }, include: { companies: { include: { company: true } }, _count: { select: { companies: true } } } });
    if (!group) throw new AppError('Grupo não encontrado', 404, 'NOT_FOUND');
    res.json({ success: true, data: group });
  }),

  create: asyncHandler(async (req: any, res: Response) => {
    const { name, description, color = '#3B82F6', companyIds = [] } = req.body;
    const group = await prisma.group.create({ data: { name, description, color } });
    if (companyIds.length > 0) {
      await prisma.companyGroup.createMany({ data: companyIds.map((id: string) => ({ groupId: group.id, companyId: id })), skipDuplicates: true });
    }
    await logAudit({ action: 'CREATE', entity: 'GROUP', entityId: group.id, userId: req.user.id, details: { name, description, color, companyCount: companyIds.length }, req });
    res.status(201).json({ success: true, data: group, message: 'Grupo criado com sucesso' });
  }),

  update: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    const { name, description, color } = req.body;
    const group = await prisma.group.update({ where: { id }, data: { name, description, color } });
    await logAudit({ action: 'UPDATE', entity: 'GROUP', entityId: id, userId: req.user.id, details: { name, description, color }, req });
    res.json({ success: true, data: group, message: 'Grupo atualizado com sucesso' });
  }),

  delete: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    await prisma.group.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entity: 'GROUP', entityId: id, userId: req.user.id, req });
    res.json({ success: true, message: 'Grupo excluído com sucesso' });
  }),

  addCompanies: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    const { companyIds } = req.body;
    await prisma.companyGroup.createMany({ data: companyIds.map((companyId: string) => ({ groupId: id, companyId })), skipDuplicates: true });
    await logAudit({ action: 'ADD_COMPANIES_TO_GROUP', entity: 'GROUP', entityId: id, userId: req.user.id, details: { companyIds }, req });
    res.json({ success: true, message: `${companyIds.length} empresas adicionadas ao grupo` });
  }),

  removeCompany: asyncHandler(async (req: any, res: Response) => {
    const { id, companyId } = req.params;
    await prisma.companyGroup.deleteMany({ where: { groupId: id, companyId } });
    await logAudit({ action: 'REMOVE_COMPANY_FROM_GROUP', entity: 'GROUP', entityId: id, userId: req.user.id, details: { companyId }, req });
    res.json({ success: true, message: 'Empresa removida do grupo' });
  }),

  addByFilter: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    const filters = req.body;
    const where: any = {};
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { companyName: { contains: filters.search, mode: 'insensitive' } },
        { document: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.city) where.city = { contains: filters.city, mode: 'insensitive' };
    if (filters.state) where.state = { contains: filters.state, mode: 'insensitive' };
    if (filters.document) where.document = { contains: filters.document, mode: 'insensitive' };
    const companies = await prisma.company.findMany({ where, select: { id: true } });
    const data = companies.map((c) => ({ groupId: id, companyId: c.id }));
    const result = await prisma.companyGroup.createMany({ data, skipDuplicates: true });
    await logAudit({ action: 'ADD_COMPANIES_BY_FILTER', entity: 'GROUP', entityId: id, userId: req.user.id, details: { filterCount: result.count }, req });
    res.json({ success: true, message: `${result.count} empresas adicionadas ao grupo por filtro` });
  }),

  searchCompanies: asyncHandler(async (req: any, res: Response) => {
    const { q } = req.query;
    if (!q || String(q).length < 2) return res.json({ success: true, data: [] });
    const companies = await prisma.company.findMany({
      where: { OR: [{ name: { contains: String(q), mode: 'insensitive' } }, { companyName: { contains: String(q), mode: 'insensitive' } }, { document: { contains: String(q), mode: 'insensitive' } }] },
      select: { id: true, name: true, companyName: true, document: true, city: true, state: true },
      take: 20, orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: companies });
  }),
};
