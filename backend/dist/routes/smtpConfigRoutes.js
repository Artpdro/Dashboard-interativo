"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const smtpConfigController_1 = require("../controllers/smtpConfigController");
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../middlewares/validation");
const router = (0, express_1.Router)();
router.get('/', auth_1.authenticate, smtpConfigController_1.SmtpConfigController.list);
router.get('/:id', auth_1.authenticate, smtpConfigController_1.SmtpConfigController.getById);
router.post('/', auth_1.authenticate, auth_1.requireAdmin, [
    (0, express_validator_1.body)('name').trim().isLength({ min: 1 }),
    (0, express_validator_1.body)('host').trim().isLength({ min: 1 }),
    (0, express_validator_1.body)('port').isInt({ min: 1, max: 65535 }),
    (0, express_validator_1.body)('user').trim().isLength({ min: 1 }),
    (0, express_validator_1.body)('password').trim().isLength({ min: 1 }),
    (0, express_validator_1.body)('from').isEmail(),
    validation_1.validate,
], smtpConfigController_1.SmtpConfigController.create);
router.put('/:id', auth_1.authenticate, auth_1.requireAdmin, smtpConfigController_1.SmtpConfigController.update);
router.delete('/:id', auth_1.authenticate, auth_1.requireAdmin, smtpConfigController_1.SmtpConfigController.delete);
router.post('/:id/test', auth_1.authenticate, smtpConfigController_1.SmtpConfigController.test);
exports.default = router;
//# sourceMappingURL=smtpConfigRoutes.js.map