// apps/backend/src/services/orchestrationCompletionPhoto.service.ts
import { prisma } from '../lib/prisma';
import sharp from 'sharp';

export interface PhotoUploadResult {
  id: string;
  thumbnailUrl: string;
  originalUrl: string;
  fileSize: number;
}

function toDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function buildThumbnail(
  source: Buffer,
  fallbackMimeType: string
): Promise<{ buffer: Buffer; mimeType: string; width?: number; height?: number }> {
  try {
    const transformed = await sharp(source)
      .rotate()
      .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 76, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: transformed.data,
      mimeType: 'image/jpeg',
      width: transformed.info.width,
      height: transformed.info.height,
    };
  } catch {
    return { buffer: source, mimeType: fallbackMimeType };
  }
}

export async function uploadPhoto(params: {
  file: Express.Multer.File;
  propertyId: string;
  actionKey: string;
  orderIndex: number;
}): Promise<PhotoUploadResult> {
  const { file, propertyId, orderIndex } = params;
  const { buffer, mimeType: thumbMime, width, height } = await buildThumbnail(file.buffer, file.mimetype);

  const photo = await prisma.orchestrationActionCompletionPhoto.create({
    data: {
      propertyId,
      completionId: null, // Will be linked when completion is created
      fileName: file.originalname,
      fileSizeBytes: file.size,
      mimeType: file.mimetype,
      originalUrl: toDataUrl(file.buffer, file.mimetype),
      thumbnailUrl: toDataUrl(buffer, thumbMime),
      width,
      height,
      orderIndex,
    },
  });

  return {
    id: photo.id,
    thumbnailUrl: photo.thumbnailUrl,
    originalUrl: photo.originalUrl,
    fileSize: photo.fileSizeBytes,
  };
}

export async function deletePhoto(
  photoId: string,
  propertyId: string
): Promise<void> {
  // Delete from database
  await prisma.orchestrationActionCompletionPhoto.delete({
    where: {
      id: photoId,
      propertyId,
    },
  });

  // TODO: When S3 is implemented, also delete from S3
}
