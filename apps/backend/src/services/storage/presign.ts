// apps/backend/src/services/storage/presign.ts
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Client } from './s3Client';

export async function presignGetObject(args: {
  bucket: string;
  key: string;
  expiresInSeconds?: number;
  /** When provided, the signed URL will include ResponseContentDisposition so
   *  the browser downloads the file rather than rendering it inline. Pass the
   *  original filename (e.g. "invoice.pdf"). */
  downloadFilename?: string;
}) {
  const client = getS3Client();

  // Sanitise the filename for the Content-Disposition header value.
  const disposition = args.downloadFilename
    ? `attachment; filename="${args.downloadFilename.replace(/"/g, '\\"')}"`
    : undefined;

  const cmd = new GetObjectCommand({
    Bucket: args.bucket,
    Key: args.key,
    ...(disposition ? { ResponseContentDisposition: disposition } : {}),
  });
  return getSignedUrl(client, cmd, { expiresIn: args.expiresInSeconds ?? 60 });
}
