// apps/backend/src/services/storage/reportStorage.ts
import { PutObjectCommand } from '@aws-sdk/client-s3';
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
