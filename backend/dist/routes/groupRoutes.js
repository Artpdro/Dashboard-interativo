"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const groupController_1 = require("../controllers/groupController");
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../middlewares/validation");
const router = (0, express_1.Router)();
router.get('/', auth_1.authenticate, groupController_1.GroupController.list);
router.get('/search-companies', auth_1.authenticate, groupController_1.GroupController.searchCompanies);
router.get('/:id', auth_1.authenticate, groupController_1.GroupController.getById);
router.post('/', auth_1.authenticate, [(0, express_validator_1.body)('name').trim().isLength({ min: 1 }), validation_1.validate], groupController_1.GroupController.create);
router.put('/:id', auth_1.authenticate, groupController_1.GroupController.update);
router.delete('/:id', auth_1.authenticate, groupController_1.GroupController.delete);
router.post('/:id/companies', auth_1.authenticate, groupController_1.GroupController.addCompanies);
router.post('/:id/companies-by-filter', auth_1.authenticate, groupController_1.GroupController.addByFilter);
router.delete('/:id/companies/:companyId', auth_1.authenticate, groupController_1.GroupController.removeCompany);
exports.default = router;
//# sourceMappingURL=groupRoutes.js.map