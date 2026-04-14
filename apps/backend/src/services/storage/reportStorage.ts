// apps/backend/src/services/storage/reportStorage.ts
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client } from './s3Client';

type UploadArgs = {
  buffer: Buffer;
  fileName: string;
  checksumSha256: string;
  propertyId: string;
  userId: string;
};

export async function uploadPdfBuffer(args: UploadArgs): Promise<{
  bucket: string;
  key: string;
  fileSizeBytes: number;
}> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is not set');

  const client = getS3Client();

  const key = `reports/${args.userId}/${args.propertyId}/${Date.now()}-${args.fileName}`
    .replace(/\s+/g, '-');

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: args.buffer,
      ContentType: 'application/pdf',
      Metadata: {
        checksumsha256: args.checksumSha256,
        propertyid: args.propertyId,
        userid: args.userId,
      },
    })
  );

  return { bucket, key, fileSizeBytes: args.buffer.length };
}

type DocumentUploadArgs = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  userId: string;
  propertyId?: string | null;
};

export async function uploadDocumentBuffer(args: DocumentUploadArgs): Promise<{
  key: string;
  fileSizeBytes: number;
}> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is not set');

  const client = getS3Client();
  const sanitized = args.fileName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const prefix = args.propertyId
    ? `documents/${args.userId}/${args.propertyId}`
    : `documents/${args.userId}`;
  const key = `${prefix}/${Date.now()}-${sanitized}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: args.buffer,
      ContentType: args.mimeType,
      Metadata: {
        userid: args.userId,
        ...(args.propertyId ? { propertyid: args.propertyId } : {}),
      },
    })
  );

  return { key, fileSizeBytes: args.buffer.length };
}

export async function deleteDocumentObject(key: string): Promise<void> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return; // no-op if S3 not configured
  const client = getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
