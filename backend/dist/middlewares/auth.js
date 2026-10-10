"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../utils/db");
const errorHandler_1 = require("../utils/errorHandler");
const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token)
            throw new errorHandler_1.AppError('Token não fornecido', 401, 'UNAUTHORIZED');
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const user = await db_1.prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, email: true, name: true, role: true, isActive: true },
        });
        if (!user || !user.isActive)
            throw new errorHandler_1.AppError('Usuário não encontrado ou inativo', 401, 'UNAUTHORIZED');
        req.user = user;
        next();
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError)
            return next(error);
        next(new errorHandler_1.AppError('Token inválido', 401, 'UNAUTHORIZED'));
    }
};
exports.authenticate = authenticate;
const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'ADMIN') {
        return next(new errorHandler_1.AppError('Acesso restrito a administradores', 403, 'FORBIDDEN'));
    }
    next();
};
exports.requireAdmin = requireAdmin;
//# sourceMappingURL=auth.js.map