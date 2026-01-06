// apps/workers/src/storage/deleteObject.ts
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client } from './s3Client';

export async function deleteObject(bucket: string, key: string) {
  const client = getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
