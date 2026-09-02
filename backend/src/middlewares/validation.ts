import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { AppError } from '../utils/errorHandler';

export const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Dados inválidos: ' + errors.array().map(e => e.msg).join(', '), 400, 'VALIDATION_ERROR');
  }
  next();
};
