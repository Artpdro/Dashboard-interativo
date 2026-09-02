import { Router } from 'express';
import { body } from 'express-validator';
import { CompanyController } from '../controllers/companyController';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validation';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.get('/', authenticate, CompanyController.list);
router.get('/stats', authenticate, CompanyController.getStats);
router.get('/:id', authenticate, CompanyController.getById);
router.post('/', authenticate, [
  body('name').trim().isLength({ min: 1 }),
  validate,
], CompanyController.create);
router.put('/:id', authenticate, CompanyController.update);
router.delete('/:id', authenticate, CompanyController.delete);
router.post('/batch-delete', authenticate, CompanyController.deleteMany);
router.post('/import', authenticate, upload.single('file'), CompanyController.importCsv);
router.post('/preview-csv', authenticate, upload.single('file'), CompanyController.previewCsv);
router.post('/export', authenticate, CompanyController.exportCsv);

export default router;
