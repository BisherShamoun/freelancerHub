import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { mkdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// Outside "uploads": that folder is served as static files, delivery files must stay private.
export const deliveryUploadDir = resolve(process.cwd(), 'storage', 'private', 'deliveries');

mkdirSync(deliveryUploadDir, { recursive: true });

const allowedExtensions = ['.pdf', '.zip'];
const allowedMimeTypes = [
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
];

export const deliveryMulterOptions: MulterOptions = {
  storage: diskStorage({
    destination: deliveryUploadDir,
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
    },
  }),

  fileFilter: (_req, file, callback) => {
    const extension = extname(file.originalname).toLowerCase();

    if (!allowedExtensions.includes(extension) || !allowedMimeTypes.includes(file.mimetype)) {
      return callback(
        new BadRequestException('Only PDF or ZIP files are allowed'),
        false,
      );
    }

    callback(null, true);
  },

  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1,
  },
};
