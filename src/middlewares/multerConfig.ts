import { Request, Response, NextFunction } from "express";
import { mkdirSync } from "fs";
import multer from "multer";
import path, { extname, resolve } from "path";

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_SIZE_BYTES = 1024 * 1024 * 10

export const UPLOAD_DIR = resolve(process.cwd(), "uploads");

if (!UPLOAD_DIR) {
mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('UNSUPPORTED_FORMAT'));
    }
  },
}).single('document');

export function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'FILE_TOO_LARGE',
        message: 'File exceeds the 10MB limit.',
        retryAfterMs: null,
      });
    }

    if (err?.message === 'UNSUPPORTED_FORMAT') {
      return res.status(400).json({
        error: 'UNSUPPORTED_FORMAT',
        message: 'Accepted types: image/jpeg, image/png, application/pdf',
        retryAfterMs: null,
      });
    }

    next(err);
  });
}
