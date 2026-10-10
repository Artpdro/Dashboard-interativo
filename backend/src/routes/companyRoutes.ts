import { Router } from 'express';
import multer from 'multer';
import { CompanyController } from '../controllers/companyController';
import { authenticate } from '../middlewares/auth';
import { AppError } from '../utils/errorHandler';
import { ALLOWED_IMPORT_EXTENSIONS, MAX_IMPORT_BYTES, getExtension } from '../utils/spreadsheet';

// Upload só em memória, 1 arquivo, até 10 MB, apenas .csv/.xls/.xlsx (o conteúdo é validado de novo na leitura).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    if (!ALLOWED_IMPORT_EXTENSIONS.includes(getExtension(name))) {
      return cb(new AppError('Formato não suportado. Envie um arquivo .xls, .xlsx ou .csv.', 400, 'INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});

const router = Router();

router.get('/', authenticate, CompanyController.list);
router.get('/stats', authenticate, CompanyController.getStats);
router.get('/:id', authenticate, CompanyController.getById);
router.post('/', authenticate, CompanyController.create);
router.put('/:id', authenticate, CompanyController.update);
router.delete('/:id', authenticate, CompanyController.delete);
router.post('/batch-delete', authenticate, CompanyController.deleteMany);

// Importação (.xls, .xlsx, .csv): 1) preview  2) analyze  3) import
router.post('/import/preview', authenticate, upload.single('file'), CompanyController.importPreview);
router.post('/import/analyze', authenticate, upload.single('file'), CompanyController.importAnalyze);
router.post('/import', authenticate, upload.single('file'), CompanyController.importExecute);
router.post('/preview-csv', authenticate, upload.single('file'), CompanyController.importPreview); // compatibilidade

router.post('/export', authenticate, CompanyController.exportCsv);

export default router;
