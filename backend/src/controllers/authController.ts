import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/db';
import { AppError, asyncHandler } from '../utils/errorHandler';
import { logAudit } from '../utils/audit';

export const AuthController = {
  login: asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new AppError('Credenciais inválidas', 401, 'INVALID_CREDENTIALS');
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw new AppError('Credenciais inválidas', 401, 'INVALID_CREDENTIALS');
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET!, { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any });
    await logAudit({ action: 'LOGIN', entity: 'USER', entityId: user.id, userId: user.id, req });
    res.json({ success: true, data: { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } } });
  }),

  register: asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password, role = 'OPERATOR' } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError('E-mail já cadastrado', 400, 'EMAIL_EXISTS');
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { name, email, password: hashedPassword, role: role as any }, select: { id: true, name: true, email: true, role: true, createdAt: true } });
    await logAudit({ action: 'CREATE', entity: 'USER', entityId: user.id, userId: user.id, details: { name, email, role }, req });
    res.status(201).json({ success: true, data: user, message: 'Usuário criado com sucesso' });
  }),

  me: asyncHandler(async (req: any, res: Response) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, name: true, email: true, role: true, isActive: true } });
    res.json({ success: true, data: user });
  }),

  listUsers: asyncHandler(async (req: any, res: Response) => {
    const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: users });
  }),

  updateUser: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    const { name, email, role, isActive } = req.body;
    const user = await prisma.user.update({ where: { id }, data: { name, email, role, isActive }, select: { id: true, name: true, email: true, role: true, isActive: true } });
    await logAudit({ action: 'UPDATE', entity: 'USER', entityId: id, userId: req.user.id, details: { name, email, role, isActive }, req });
    res.json({ success: true, data: user });
  }),

  deleteUser: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    if (id === req.user.id) throw new AppError('Não pode excluir seu próprio usuário', 400, 'SELF_DELETE');
    await prisma.user.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entity: 'USER', entityId: id, userId: req.user.id, req });
    res.json({ success: true, message: 'Usuário excluído com sucesso' });
  }),
};
