// apps/backend/src/services/storage/s3Client.ts
import { S3Client } from '@aws-sdk/client-s3';

export function getS3Client() {
  const endpoint = process.env.S3_ENDPOINT; // optional for R2/minio
  const region = process.env.S3_REGION || 'us-east-1';

  return new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    },
  });
}
