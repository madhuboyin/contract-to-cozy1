// apps/backend/scripts/copy-legacy-documents-to-home-records.ts
//
// COPY, never move: each live legacy `documents` row (the older vault) becomes a Home Record with its file, so Home Records is the complete store. The legacy row,
// its stored file and its links (home_event_documents and the rest) are left exactly as they are, so nothing that still reads them can break.
//
// WHY A SCRIPT AND NOT SQL: a Home Record version needs the file's SHA-256 and the file stored under the Home Records key. Neither can be produced in pgAdmin:
// the 17 legacy documents have no checksum, so every byte has to be read from storage and hashed. The rules themselves are in legacyDocumentCopyPlan.ts (pure, tested).
//
// SAFE BY DEFAULT: it only reports what it would do. Nothing is written without --apply, and it is safe to re-run (a document already copied is recognised by the
// stable ids it was given, and is skipped).
//
// What --apply does, per document:
//   1. reads the stored file and hashes it (a mismatch with a checksum the document already had is skipped and reported, never "fixed");
//   2. runs the same content-threat check uploads run, and skips a file that fails it;
//   3. skips a file whose identical content is already in this property's Home Records (it is reported, and the legacy row still gets its checksum);
//   4. stores a COPY of the file under the Home Records key, then, in one transaction, creates the record, its first version and the links the legacy document had
//      (home events, warranty, insurance policy, inventory item, project), and finally records the checksum on the legacy row so the two stores recognise each other;
//   5. if the database step fails, removes the copy it just stored.
// It does not trash, hide or delete anything legacy. Retiring the legacy store is a separate decision.
//
// Needs DATABASE_URL, S3_BUCKET and the storage credentials of the target environment (run it where the api runs).
//
// Usage (from apps/backend):
//   npx ts-node scripts/copy-legacy-documents-to-home-records.ts                       (report only)
//   npx ts-node scripts/copy-legacy-documents-to-home-records.ts --property=<id>       (one property)
//   npx ts-node scripts/copy-legacy-documents-to-home-records.ts --limit=5             (first five)
//   npx ts-node scripts/copy-legacy-documents-to-home-records.ts --apply               (do it)

import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { deleteDocumentObject, downloadObjectBuffer, uploadPropertyRecordVersionBuffer } from '../src/services/storage/reportStorage';
import { scanBufferForThreats } from '../src/utils/documentValidator.util';
import { planFor, recordIdFor, skipReason, type LegacyDocumentRow } from './legacyDocumentCopyPlan';

const prisma = new PrismaClient() as any;
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const argValue = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const propertyFilter = argValue('property');
const limit = Number(argValue('limit') ?? 0) || undefined;

type Outcome = 'COPIED' | 'WOULD_COPY' | 'SKIPPED' | 'FAILED';
const rows: Array<{ id: string; name: string; outcome: Outcome; note: string }> = [];
const note = (doc: { id: string; name: string }, outcome: Outcome, text: string) => {
  rows.push({ id: doc.id, name: doc.name, outcome, note: text });
  console.log(`${outcome.padEnd(10)} ${doc.id}  ${doc.name}  -  ${text}`);
};

async function main() {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is not set; the stored files cannot be read.');
  console.log(apply ? 'APPLY mode: Home Records will be written.' : 'REPORT ONLY: nothing will be written. Add --apply to copy.');

  const documents: LegacyDocumentRow[] = await prisma.document.findMany({
    where: { deletedAt: null, ...(propertyFilter ? { propertyId: propertyFilter } : {}) },
    orderBy: { createdAt: 'asc' }, ...(limit ? { take: limit } : {}),
    select: {
      id: true, propertyId: true, uploadedBy: true, type: true, name: true, description: true, fileUrl: true, fileSize: true, mimeType: true, sha256: true,
      verificationStatus: true, verifiedAt: true, verifiedByUserId: true, deletedAt: true, warrantyId: true, policyId: true, inventoryItemId: true, projectId: true,
      homeEventLinks: { select: { eventId: true, caption: true } },
    },
  });
  const profiles: Array<{ id: string; userId: string }> = await prisma.homeownerProfile.findMany({ where: { id: { in: [...new Set(documents.map((d) => d.uploadedBy))] } }, select: { id: true, userId: true } });
  const ownerOf = new Map(profiles.map((p) => [p.id, p.userId]));
  const copied: Array<{ id: string }> = await prisma.propertyRecord.findMany({ where: { id: { in: documents.map((d) => recordIdFor(d.id)) } }, select: { id: true } });
  const alreadyCopied = new Set(copied.map((r) => r.id));
  console.log(`${documents.length} live legacy document${documents.length === 1 ? '' : 's'} found.\n`);

  for (const doc of documents) {
    const ownerUserId = ownerOf.get(doc.uploadedBy) ?? null;
    const reason = skipReason(doc, { ownerUserId, alreadyCopied: alreadyCopied.has(recordIdFor(doc.id)) });
    if (reason) { note(doc, 'SKIPPED', reason); continue; }
    try {
      const plan = planFor(doc, ownerUserId as string);
      const buffer = await downloadObjectBuffer(bucket, doc.fileUrl);
      const checksum = createHash('sha256').update(buffer).digest('hex');
      if (doc.sha256 && doc.sha256 !== checksum) { note(doc, 'SKIPPED', 'the stored file does not match the checksum on record; not copied, needs a person to look'); continue; }
      const threat = scanBufferForThreats(buffer, doc.mimeType);
      if (threat) { note(doc, 'SKIPPED', `failed the upload content check (${(threat as { reason?: string }).reason ?? 'content threat'}); not copied`); continue; }
      const duplicate = await prisma.propertyRecordVersion.findFirst({ where: { sha256: checksum, record: { propertyId: plan.propertyId } }, select: { recordId: true } });
      if (duplicate) {
        if (apply && !doc.sha256) await prisma.document.update({ where: { id: doc.id }, data: { sha256: checksum } });
        note(doc, 'SKIPPED', `the same file is already Home Record ${duplicate.recordId}${apply && !doc.sha256 ? '; the legacy row now has its checksum' : ''}`);
        continue;
      }
      const detail = `${buffer.length} bytes, ${plan.recordType}, ${plan.links.length} link${plan.links.length === 1 ? '' : 's'} (${plan.links.map((l) => l.entityType).join(', ') || 'none'})`;
      if (!apply) { note(doc, 'WOULD_COPY', detail); continue; }

      // Object storage cannot join a transaction: store the copy first, remove it if the database step fails.
      const stored = await uploadPropertyRecordVersionBuffer({
        buffer, storageKey: plan.storageKey, fileName: plan.fileName, mimeType: plan.mimeType, propertyId: plan.propertyId, recordId: plan.recordId, versionId: plan.versionId,
        checksumSha256: checksum, userId: plan.ownerUserId,
      });
      try {
        await prisma.$transaction(async (tx: any) => {
          await tx.propertyRecord.create({
            data: {
              id: plan.recordId, propertyId: plan.propertyId, title: plan.title, description: plan.description, recordType: plan.recordType, sensitivity: plan.sensitivity,
              visibility: 'HOUSEHOLD', createdByUserId: plan.ownerUserId, verificationStatus: plan.verificationStatus, verifiedAt: plan.verifiedAt, verifiedByUserId: plan.verifiedByUserId,
              versions: {
                create: {
                  id: plan.versionId, versionNumber: 1, storageKey: plan.storageKey, originalFileName: plan.fileName, mimeType: plan.mimeType, fileSizeBytes: buffer.length,
                  sha256: checksum, storageEtag: stored.storageEtag, uploadedByUserId: plan.ownerUserId, scanStatus: 'CLEAN', integrityStatus: 'VERIFIED',
                },
              },
            },
          });
          await tx.propertyRecord.update({ where: { id: plan.recordId }, data: { currentVersionId: plan.versionId } });
          for (const link of plan.links) {
            await tx.propertyRecordLink.create({
              data: { recordId: plan.recordId, versionId: plan.versionId, entityType: link.entityType, entityId: link.entityId, purpose: link.purpose, label: link.label, createdByUserId: plan.ownerUserId },
            });
          }
          if (!doc.sha256) await tx.document.update({ where: { id: doc.id }, data: { sha256: checksum } });
        });
        note(doc, 'COPIED', detail);
      } catch (error) {
        await deleteDocumentObject(plan.storageKey).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      note(doc, 'FAILED', (error as Error).message);
    }
  }

  const count = (outcome: Outcome) => rows.filter((row) => row.outcome === outcome).length;
  console.log(`\n${apply ? `Copied ${count('COPIED')}` : `Would copy ${count('WOULD_COPY')}`}, skipped ${count('SKIPPED')}, failed ${count('FAILED')}, of ${rows.length}.`);
  if (count('FAILED')) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
