// apps/backend/src/controllers/orchestrationCompletion.controller.ts
import { Request, Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import {
  createCompletion,
  getCompletion,
  updateCompletion,
} from '../services/orchestrationCompletion.service';
import {
  uploadPhoto,
  deletePhoto,
} from '../services/orchestrationCompletionPhoto.service';
import {
  completionCreateSchema,
  completionUpdateSchema,
} from '../validators/orchestrationCompletion.validator';
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/heic'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and HEIC are allowed.'));
    }
  },
});

export const uploadMiddleware = upload.single('file');

export async function getCompletionHandler(
  req: AuthRequest,
  res: Response
) {
  const { propertyId, completionId } = req.params;

  const completion = await getCompletion(propertyId, completionId);

  if (!completion) {
    return res.status(404).json({ error: 'Completion not found' });
  }

  return res.json(completion);
}

export async function updateCompletionHandler(
  req: AuthRequest,
  res: Response
) {
  const { propertyId, completionId } = req.params;

  const validation = completionUpdateSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'Invalid data',
      details: validation.error.issues,
    });
  }

  try {
    const completion = await updateCompletion(
      propertyId,
      completionId,
      validation.data
    );
    return res.json(completion);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
}

export async function uploadPhotoHandler(
  req: AuthRequest,
  res: Response
) {
  const { propertyId } = req.params;
  const { actionKey, orderIndex } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  try {
    const photo = await uploadPhoto({
      file: req.file,
      propertyId,
      actionKey,
      orderIndex: parseInt(orderIndex || '0'),
    });

    return res.json({
      success: true,
      photo,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function deletePhotoHandler(
  req: AuthRequest,
  res: Response
) {
  const { propertyId, photoId } = req.params;

  try {
    await deletePhoto(photoId, propertyId);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}