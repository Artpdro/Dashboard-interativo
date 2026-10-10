"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const companyController_1 = require("../controllers/companyController");
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../middlewares/validation");
const multer_1 = __importDefault(require("multer"));
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
const router = (0, express_1.Router)();
router.get('/', auth_1.authenticate, companyController_1.CompanyController.list);
router.get('/stats', auth_1.authenticate, companyController_1.CompanyController.getStats);
router.get('/:id', auth_1.authenticate, companyController_1.CompanyController.getById);
router.post('/', auth_1.authenticate, [
    (0, express_validator_1.body)('name').trim().isLength({ min: 1 }),
    validation_1.validate,
], companyController_1.CompanyController.create);
router.put('/:id', auth_1.authenticate, companyController_1.CompanyController.update);
router.delete('/:id', auth_1.authenticate, companyController_1.CompanyController.delete);
router.post('/batch-delete', auth_1.authenticate, companyController_1.CompanyController.deleteMany);
router.post('/import', auth_1.authenticate, upload.single('file'), companyController_1.CompanyController.importCsv);
router.post('/preview-csv', auth_1.authenticate, upload.single('file'), companyController_1.CompanyController.previewCsv);
router.post('/export', auth_1.authenticate, companyController_1.CompanyController.exportCsv);
exports.default = router;
//# sourceMappingURL=companyRoutes.js.map