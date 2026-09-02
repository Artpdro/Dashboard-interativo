import { Router } from 'express';
import { body } from 'express-validator';
import { AuthController } from '../controllers/authController';
import { authenticate, requireAdmin } from '../middlewares/auth';
import { validate } from '../middlewares/validation';

const router = Router();
router.post('/login', [body('email').isEmail().normalizeEmail(), body('password').isLength({ min: 6 }), validate], AuthController.login);
router.post('/register', [body('name').trim().isLength({ min: 2 }), body('email').isEmail().normalizeEmail(), body('password').isLength({ min: 6 }), validate], AuthController.register);
router.get('/me', authenticate, AuthController.me);
router.get('/users', authenticate, requireAdmin, AuthController.listUsers);
router.put('/users/:id', authenticate, requireAdmin, AuthController.updateUser);
router.delete('/users/:id', authenticate, requireAdmin, AuthController.deleteUser);
export default router;
