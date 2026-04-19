import { Request, Response, NextFunction } from "express";
import { mkdirSync } from "fs";
import multer from "multer";
import { extname, resolve } from "path";
import generalResponse from "../helpers/generalResponse";

export const UPLOADS_DIR = resolve(process.cwd(), "uploads");

mkdirSync(UPLOADS_DIR, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const extension = extname(file.originalname);
    const baseName = file.originalname
      .replace(extension, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9-_]/g, "")
      .toLowerCase();

    cb(null, `${baseName || "upload"}-${Date.now()}${extension}`);
  },
});


// File type checker
const checkFileType = (
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
  fileType: string[]
) => {
  if (fileType.length > 0) {
    if (fileType.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Only${fileType.map(
            (type) => ` ${type.replace("image/", ".")}`
          )} file format allowed!`
        )
      );
    }
  } else {
    cb(null, true);
  }
};

// Export the multer configuration as middleware
// Common file type configurations
export const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
];
export const DOCUMENT_TYPES = [
  "application/pdf",
];

// Pre-configured multer instances for common use cases
export const imageUploadConfig = () => multerInterceptorConfig(IMAGE_TYPES, 10); // 10MB limit
export const documentUploadConfig = () =>
  multerInterceptorConfig(DOCUMENT_TYPES, 10); // 10MB limit

export const multerInterceptorConfig = (
  filetype: string[] = [],
  filesize: number | null = null
) => {
  const upload = multer({
    storage: diskStorage,
    limits: {
      fileSize: filesize ? filesize * 1024 * 1024 : undefined,
    },
    fileFilter: (req, file, cb) => {
      checkFileType(file, cb, filetype);
    },
  }).any();

  // Return middleware function
  return (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err) => {
      if (err) {
        console.log("Multer error:", err);

        if (err instanceof multer.MulterError) {
          return generalResponse(res, null, err.message, "error", 400);
        }
        return generalResponse(res, null, err.message, "error", 500);
      }
      next();
    });
  };
};
