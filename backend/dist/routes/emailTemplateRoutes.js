"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const emailTemplateController_1 = require("../controllers/emailTemplateController");
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../middlewares/validation");
const router = (0, express_1.Router)();
router.get('/', auth_1.authenticate, emailTemplateController_1.EmailTemplateController.list);
router.get('/:id', auth_1.authenticate, emailTemplateController_1.EmailTemplateController.getById);
router.post('/', auth_1.authenticate, [
    (0, express_validator_1.body)('name').trim().isLength({ min: 1 }),
    (0, express_validator_1.body)('subject').trim().isLength({ min: 1 }),
    (0, express_validator_1.body)('body').trim().isLength({ min: 1 }),
    validation_1.validate,
], emailTemplateController_1.EmailTemplateController.create);
router.put('/:id', auth_1.authenticate, emailTemplateController_1.EmailTemplateController.update);
router.delete('/:id', auth_1.authenticate, emailTemplateController_1.EmailTemplateController.delete);
router.post('/:id/duplicate', auth_1.authenticate, emailTemplateController_1.EmailTemplateController.duplicate);
exports.default = router;
//# sourceMappingURL=emailTemplateRoutes.js.map