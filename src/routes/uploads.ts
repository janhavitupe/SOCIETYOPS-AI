import express, { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../logger';
import { requireAuth } from '../auth/authMiddleware';
import { getStorage, newUploadKey, LocalStorageDriver, MAX_UPLOAD_BYTES } from '../services/storage';
import { validateBody } from './validate';
import { uploadBody } from './schemas';

/**
 * Photo uploads. The client asks for a signed URL, sends the file straight to
 * storage, then passes the returned key with its chat message or ticket.
 */
const router = Router();

router.post('/uploads', requireAuth, validateBody(uploadBody), async (req, res) => {
  const { contentType, size } = req.body;
  const key = newUploadKey(req.user!.id, contentType);
  const upload = await getStorage().presignUpload(key, contentType, size);
  logger.info('Upload URL issued', { key, size, driver: getStorage().name });
  res.status(201).json({ key, upload });
});

// --- Local driver only: the signed URLs it issues point back at these. ---

type FileParams = { key: string[] };

function localDriver(req: Request, res: Response, next: NextFunction) {
  if (!(getStorage() instanceof LocalStorageDriver)) return res.status(404).json({ error: 'Not found' });
  next();
}

const keyOf = (req: Request<FileParams>) => req.params.key.join('/');

router.put(
  '/files/*key',
  localDriver,
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  async (req: Request<FileParams>, res: Response) => {
    const storage = getStorage() as LocalStorageDriver;
    const key = keyOf(req);
    if (!storage.verify('put', key, req.query)) {
      return res.status(403).json({ error: 'Upload link is invalid or expired' });
    }

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length !== Number(req.query.size)) {
      return res.status(400).json({ error: 'File size does not match the upload request' });
    }
    if (req.headers['content-type'] !== req.query.type) {
      return res.status(400).json({ error: 'File type does not match the upload request' });
    }

    const target = storage.pathFor(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    res.status(200).end();
  },
);

router.get('/files/*key', localDriver, async (req: Request<FileParams>, res: Response) => {
  const storage = getStorage() as LocalStorageDriver;
  const key = keyOf(req);
  if (!storage.verify('get', key, req.query)) return res.status(403).json({ error: 'Link is invalid or expired' });

  const object = await storage.head(key);
  if (!object) return res.status(404).json({ error: 'Not found' });

  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.type(object.contentType);
  // pathFor has already confined the key to the storage root, which may itself
  // be a dot-directory (the tests use .test-uploads).
  res.sendFile(storage.pathFor(key), { dotfiles: 'allow' });
});

export default router;
