import express from 'express';
import { loginUser, registerUser } from '../controllers/authController.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', loginUser);
// Personnel accounts change access to protected health data and may only be
// provisioned by a signed-in administrator.
router.post('/register', protect, admin, registerUser);

export default router;
