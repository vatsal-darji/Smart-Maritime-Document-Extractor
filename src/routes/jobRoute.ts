import { Router } from 'express';
import { getJobController } from '@/controllers/jobsController';

const router = Router();

router.get('/:jobId', getJobController);

export default router;