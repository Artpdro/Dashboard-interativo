"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auditLogController_1 = require("../controllers/auditLogController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
router.get('/', auth_1.authenticate, auth_1.requireAdmin, auditLogController_1.AuditLogController.list);
router.get('/export', auth_1.authenticate, auth_1.requireAdmin, auditLogController_1.AuditLogController.export);
exports.default = router;
//# sourceMappingURL=auditLogRoutes.js.map