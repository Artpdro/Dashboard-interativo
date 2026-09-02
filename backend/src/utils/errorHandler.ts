import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

export class AppError extends Error {
  constructor(public message: string, public statusCode: number = 500, public code?: string) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (err: Error | AppError, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ error: err.message, stack: err.stack, path: req.path, method: req.method, ip: req.ip });
  
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ success: false, message: err.message, code: err.code });
  }
  
  if (err.name === 'PrismaClientKnownRequestError' || err.name === 'PrismaClientValidationError') {
    const isDev = process.env.NODE_ENV === 'development';
    return res.status(400).json({ 
      success: false, 
      message: isDev ? `Erro de banco de dados: ${err.message}` : 'Erro de banco de dados',
      code: 'DATABASE_ERROR',
      ...(isDev && { detail: (err as any).meta })
    });
  }
  
  return res.status(500).json({ 
    success: false, 
    message: process.env.NODE_ENV === 'development' ? err.message : 'Erro interno do servidor', 
    code: 'INTERNAL_ERROR' 
  });
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};