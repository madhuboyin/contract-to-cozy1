// BICC-MM-010: the S3 side of an ephemeral chat attachment. Keys come only from storageKeyFor (owner, scope and id are validated and are part of the path). Raw files are
// written encrypted at rest. A missing bucket FAILS CLOSED: nothing is written and nothing is reported as deleted.
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client } from '../../storage/s3Client';
import { storageKeyFor, type AttachmentOwner } from './attachmentLifecycle';
import type { AttachmentDerivedKind } from './attachmentPolicy';
import type { AttachmentDerivedStorage, SweepableAttachment } from './attachmentSweeper';

export interface AttachmentObjectStore extends AttachmentDerivedStorage {
  putRaw(owner: AttachmentOwner, attachmentId: string, bytes: Buffer, mimeType: string): Promise<void>;
}

export const s3AttachmentObjectStore: AttachmentObjectStore = {
  async putRaw(owner, attachmentId, bytes, mimeType) {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error('S3_BUCKET is not set');
    await getS3Client().send(new PutObjectCommand({
      Bucket: bucket, Key: storageKeyFor(owner, attachmentId, 'RAW_FILE'), Body: bytes, ContentType: mimeType, ServerSideEncryption: 'AES256',
      Metadata: { userid: owner.userId, scopekind: owner.scopeKind.toLowerCase() },
    }));
  },
  async deleteCopies(attachment: SweepableAttachment, kinds: readonly AttachmentDerivedKind[]) {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) return { failed: [...kinds] };
    const client = getS3Client();
    const failed: AttachmentDerivedKind[] = [];
    for (const kind of kinds) {
      try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKeyFor(attachment, attachment.id, kind) })); } catch { failed.push(kind); }
    }
    return { failed };
  },
};
