import { Router } from 'express';
import { body } from 'express-validator';
import { GroupController } from '../controllers/groupController';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validation';

const router = Router();
router.get('/', authenticate, GroupController.list);
router.get('/search-companies', authenticate, GroupController.searchCompanies);
router.get('/:id', authenticate, GroupController.getById);
router.post('/', authenticate, [body('name').trim().isLength({ min: 1 }), validate], GroupController.create);
router.put('/:id', authenticate, GroupController.update);
router.delete('/:id', authenticate, GroupController.delete);
router.post('/:id/companies', authenticate, GroupController.addCompanies);
router.post('/:id/companies-by-filter', authenticate, GroupController.addByFilter);
router.delete('/:id/companies/:companyId', authenticate, GroupController.removeCompany);
export default router;
