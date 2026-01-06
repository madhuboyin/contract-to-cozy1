// apps/backend/src/services/storage/presign.ts
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Client } from './s3Client';

export async function presignGetObject(args: {
  bucket: string;
  key: string;
  expiresInSeconds?: number;
}) {
  const client = getS3Client();
  const cmd = new GetObjectCommand({ Bucket: args.bucket, Key: args.key });
  return getSignedUrl(client, cmd, { expiresIn: args.expiresInSeconds ?? 60 });
}
