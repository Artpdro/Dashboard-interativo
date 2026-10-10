"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const companyController_1 = require("../controllers/companyController");
const auth_1 = require("../middlewares/auth");
const errorHandler_1 = require("../utils/errorHandler");
const spreadsheet_1 = require("../utils/spreadsheet");
// Upload só em memória, 1 arquivo, até 10 MB, apenas .csv/.xls/.xlsx (o conteúdo é validado de novo na leitura).
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: spreadsheet_1.MAX_IMPORT_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
        const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
        if (!spreadsheet_1.ALLOWED_IMPORT_EXTENSIONS.includes((0, spreadsheet_1.getExtension)(name))) {
            return cb(new errorHandler_1.AppError('Formato não suportado. Envie um arquivo .xls, .xlsx ou .csv.', 400, 'INVALID_FILE_TYPE'));
        }
        cb(null, true);
    },
});
const router = (0, express_1.Router)();
router.get('/', auth_1.authenticate, companyController_1.CompanyController.list);
router.get('/stats', auth_1.authenticate, companyController_1.CompanyController.getStats);
router.get('/:id', auth_1.authenticate, companyController_1.CompanyController.getById);
router.post('/', auth_1.authenticate, companyController_1.CompanyController.create);
router.put('/:id', auth_1.authenticate, companyController_1.CompanyController.update);
router.delete('/:id', auth_1.authenticate, companyController_1.CompanyController.delete);
router.post('/batch-delete', auth_1.authenticate, companyController_1.CompanyController.deleteMany);
// Importação (.xls, .xlsx, .csv): 1) preview  2) analyze  3) import
router.post('/import/preview', auth_1.authenticate, upload.single('file'), companyController_1.CompanyController.importPreview);
router.post('/import/analyze', auth_1.authenticate, upload.single('file'), companyController_1.CompanyController.importAnalyze);
router.post('/import', auth_1.authenticate, upload.single('file'), companyController_1.CompanyController.importExecute);
router.post('/preview-csv', auth_1.authenticate, upload.single('file'), companyController_1.CompanyController.importPreview); // compatibilidade
router.post('/export', auth_1.authenticate, companyController_1.CompanyController.exportCsv);
exports.default = router;
//# sourceMappingURL=companyRoutes.js.map