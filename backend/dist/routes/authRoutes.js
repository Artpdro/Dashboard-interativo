"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../middlewares/validation");
const router = (0, express_1.Router)();
router.post('/login', [(0, express_validator_1.body)('email').isEmail().normalizeEmail(), (0, express_validator_1.body)('password').isLength({ min: 6 }), validation_1.validate], authController_1.AuthController.login);
router.post('/register', [(0, express_validator_1.body)('name').trim().isLength({ min: 2 }), (0, express_validator_1.body)('email').isEmail().normalizeEmail(), (0, express_validator_1.body)('password').isLength({ min: 6 }), validation_1.validate], authController_1.AuthController.register);
router.get('/me', auth_1.authenticate, authController_1.AuthController.me);
router.get('/users', auth_1.authenticate, auth_1.requireAdmin, authController_1.AuthController.listUsers);
router.put('/users/:id', auth_1.authenticate, auth_1.requireAdmin, authController_1.AuthController.updateUser);
router.delete('/users/:id', auth_1.authenticate, auth_1.requireAdmin, authController_1.AuthController.deleteUser);
exports.default = router;
//# sourceMappingURL=authRoutes.js.map