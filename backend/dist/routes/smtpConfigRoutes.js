"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const smtpConfigController_1 = require("../controllers/smtpConfigController");
const auth_1 = require("../middlewares/auth");
// A validação dos campos (com mensagens em português) é feita no controller.
const router = (0, express_1.Router)();
router.get('/', auth_1.authenticate, smtpConfigController_1.SmtpConfigController.list);
router.post('/test', auth_1.authenticate, auth_1.requireAdmin, smtpConfigController_1.SmtpConfigController.testDraft); // testa os dados do formulário antes de salvar
router.get('/:id', auth_1.authenticate, smtpConfigController_1.SmtpConfigController.getById);
router.post('/', auth_1.authenticate, auth_1.requireAdmin, smtpConfigController_1.SmtpConfigController.create);
router.put('/:id', auth_1.authenticate, auth_1.requireAdmin, smtpConfigController_1.SmtpConfigController.update);
router.delete('/:id', auth_1.authenticate, auth_1.requireAdmin, smtpConfigController_1.SmtpConfigController.delete);
router.post('/:id/test', auth_1.authenticate, auth_1.requireAdmin, smtpConfigController_1.SmtpConfigController.test);
exports.default = router;
//# sourceMappingURL=smtpConfigRoutes.js.map