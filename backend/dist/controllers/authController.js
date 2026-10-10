"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../utils/db");
const errorHandler_1 = require("../utils/errorHandler");
const audit_1 = require("../utils/audit");
exports.AuthController = {
    login: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { email, password } = req.body;
        const user = await db_1.prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive)
            throw new errorHandler_1.AppError('Credenciais inválidas', 401, 'INVALID_CREDENTIALS');
        const isValid = await bcryptjs_1.default.compare(password, user.password);
        if (!isValid)
            throw new errorHandler_1.AppError('Credenciais inválidas', 401, 'INVALID_CREDENTIALS');
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') });
        await (0, audit_1.logAudit)({ action: 'LOGIN', entity: 'USER', entityId: user.id, userId: user.id, req });
        res.json({ success: true, data: { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } } });
    }),
    register: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { name, email, password, role = 'OPERATOR' } = req.body;
        const existing = await db_1.prisma.user.findUnique({ where: { email } });
        if (existing)
            throw new errorHandler_1.AppError('E-mail já cadastrado', 400, 'EMAIL_EXISTS');
        const hashedPassword = await bcryptjs_1.default.hash(password, 12);
        const user = await db_1.prisma.user.create({ data: { name, email, password: hashedPassword, role: role }, select: { id: true, name: true, email: true, role: true, createdAt: true } });
        await (0, audit_1.logAudit)({ action: 'CREATE', entity: 'USER', entityId: user.id, userId: user.id, details: { name, email, role }, req });
        res.status(201).json({ success: true, data: user, message: 'Usuário criado com sucesso' });
    }),
    me: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const user = await db_1.prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, name: true, email: true, role: true, isActive: true } });
        res.json({ success: true, data: user });
    }),
    listUsers: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const users = await db_1.prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
        res.json({ success: true, data: users });
    }),
    updateUser: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const { name, email, role, isActive } = req.body;
        const user = await db_1.prisma.user.update({ where: { id }, data: { name, email, role, isActive }, select: { id: true, name: true, email: true, role: true, isActive: true } });
        await (0, audit_1.logAudit)({ action: 'UPDATE', entity: 'USER', entityId: id, userId: req.user.id, details: { name, email, role, isActive }, req });
        res.json({ success: true, data: user });
    }),
    deleteUser: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        if (id === req.user.id)
            throw new errorHandler_1.AppError('Não pode excluir seu próprio usuário', 400, 'SELF_DELETE');
        await db_1.prisma.user.delete({ where: { id } });
        await (0, audit_1.logAudit)({ action: 'DELETE', entity: 'USER', entityId: id, userId: req.user.id, req });
        res.json({ success: true, message: 'Usuário excluído com sucesso' });
    }),
};
//# sourceMappingURL=authController.js.map