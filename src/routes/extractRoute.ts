import { Router } from 'express';
import { handleUpload } from '@/middlewares/multerConfig'
import { rateLimiter } from '@/middlewares/rateLimiter';
import { extractController } from '@/controllers/extractController';

const router = Router();

// POST /api/extract?mode=sync|async
router.post('/', rateLimiter, handleUpload, extractController);

export default router;
