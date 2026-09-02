import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errorHandler';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; name: string; role: string };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new AppError('Token não fornecido', 401, 'UNAUTHORIZED');
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) throw new AppError('Usuário não encontrado ou inativo', 401, 'UNAUTHORIZED');
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new AppError('Token inválido', 401, 'UNAUTHORIZED'));
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') {
    return next(new AppError('Acesso restrito a administradores', 403, 'FORBIDDEN'));
  }
  next();
};
