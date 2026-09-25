/**
 * image-upload.js — 头像 / 封面上传
 *
 * 文件存到 uploads/avatars/，只收图片，上限 10MB。
 */

import path from 'node:path';
import multer from 'multer';
import { formatMeta } from './logger.js';
import { UPLOADS_DIR } from './data-dir.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * @param {(req: import('express').Request) => string} fileBase  不含扩展名的文件名；扩展名取原文件（缺省 .jpg）
 */
export function createImageUpload(fileBase) {
  return multer({
    storage: multer.diskStorage({
      destination: path.join(UPLOADS_DIR, 'avatars'),
      filename(req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `${fileBase(req)}${ext}`);
      },
    }),
    limits: { fileSize: MAX_IMAGE_BYTES },
    fileFilter(req, file, cb) {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('只接受图片文件'));
    },
  });
}

/**
 * 请求里没有上传文件时回 400 并返回 false，调用方应立即 return。
 */
export function requireUploadedFile(req, res, { log, ns, message = '未收到文件' }) {
  if (req.file) return true;
  log.warn(`${ns}.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'no file received' })}`);
  res.status(400).json({ error: message });
  return false;
}
