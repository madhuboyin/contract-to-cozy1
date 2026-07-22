import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '../lib/prisma';
import { uploadPdfBuffer } from '@worker-shared/services/storage/reportStorage';
import { logger } from '../lib/logger';
import { checkPermitWorkerContext } from '@worker-shared/services/projectCompliance/permitWorkerContext.service';

export const GENERATE_PERMIT_DISCLOSURE_JOB = 'generate-permit-disclosure';

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function buildDisclosureSnapshot(propertyId: string) {
  const property = await (prisma as any).property.findUnique({
    where: { id: propertyId },
    select: {
      address: true,
      city: true,
      state: true,
      zipCode: true,
    },
  });

  const [permits, flags] = await Promise.all([
    (prisma as any).propertyPermitRecord.findMany({
      where: { propertyId, isActive: true },
      select: {
        permitNumber: true,
        category: true,
        workTypes: true,
        status: true,
        issueDate: true,
        finaledDate: true,
        description: true,
        contractorName: true,
        // W3 (permits): auto-fetched records are matched to a property via
        // a fuzzy address match and category-inferred via keyword regex —
        // not guaranteed-correct. This is a seller-disclosure document; it
        // previously presented every record with identical authority
        // regardless of source, with no caveat for unverified auto-matches.
        source: true,
        isVerified: true,
      },
      orderBy: { issueDate: 'desc' },
    }),
    (prisma as any).permitUnpermittedFlag.findMany({
      where: {
        propertyId,
        status: { in: ['FLAGGED', 'INVESTIGATING', 'CONFIRMED_UNPERMITTED', 'WILL_REMEDIATE'] },
      },
      select: {
        workType: true,
        flagReason: true,
        disclosureRisk: true,
        status: true,
      },
    }),
  ]);

  return { property, permits, flags };
}

async function renderDisclosurePdf(
  snapshot: Awaited<ReturnType<typeof buildDisclosureSnapshot>>,
  propertyId: string,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const addPage = () => {
    const page = doc.addPage([612, 792]);
    return page;
  };

  const { property, permits, flags } = snapshot;
  const address = [property?.address, property?.city, property?.state, property?.zipCode]
    .filter(Boolean)
    .join(', ') || 'Property';

  let page = addPage();
  let y = 750;
  const leftMargin = 50;
  const lineHeight = 16;

  const write = (text: string, x: number, yPos: number, size = 11, bold = false) => {
    page.drawText(text, {
      x,
      y: yPos,
      size,
      font: bold ? boldFont : font,
      color: rgb(0, 0, 0),
    });
  };

  const nextLine = (lines = 1) => {
    y -= lineHeight * lines;
    if (y < 60) {
      page = addPage();
      y = 750;
    }
  };

  // Header
  write('Permit History & Disclosure Report', leftMargin, y, 18, true);
  nextLine(1.5);
  write(`Property: ${address}`, leftMargin, y, 12);
  nextLine();
  write(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, leftMargin, y, 10);
  nextLine(2);

  // Permit Summary
  write('PERMIT HISTORY', leftMargin, y, 13, true);
  nextLine();
  write(`Total permits on file: ${permits.length}`, leftMargin, y, 11);
  nextLine(1.5);

  for (const permit of permits) {
    const issued = permit.issueDate
      ? new Date(permit.issueDate).toLocaleDateString('en-US')
      : 'N/A';
    const line = `• ${permit.category} — ${permit.status} (Issued: ${issued})${permit.permitNumber ? ` #${permit.permitNumber}` : ''}`;
    write(line, leftMargin + 10, y, 10);
    nextLine();
    if (permit.description) {
      write(`  ${permit.description.slice(0, 100)}`, leftMargin + 10, y, 9);
      nextLine();
    }
    // W3 (permits): auto-matched/unverified records carry real address- and
    // category-inference uncertainty that a seller-disclosure reader needs
    // to know about, not just a homeowner-entered or verified record.
    const provenanceLabel = permit.isVerified
      ? 'Verified'
      : permit.source === 'MANUAL_ENTRY'
        ? 'Manually entered — unverified'
        : permit.source === 'DOCUMENT_UPLOAD'
          ? 'From uploaded document — unverified'
          : 'Auto-matched from public records — unverified, confirm with municipality';
    write(`  Source: ${provenanceLabel}`, leftMargin + 10, y, 9);
    nextLine();
  }

  if (permits.length === 0) {
    write('No permit records found.', leftMargin + 10, y, 10);
    nextLine();
  }

  nextLine();

  // Unpermitted Work Flags
  write('UNPERMITTED WORK FLAGS', leftMargin, y, 13, true);
  nextLine();
  write(`Open flags: ${flags.length}`, leftMargin, y, 11);
  nextLine(1.5);

  for (const flag of flags) {
    write(`• [${flag.disclosureRisk}] ${flag.workType} — ${flag.status}`, leftMargin + 10, y, 10);
    nextLine();
    write(`  ${flag.flagReason.slice(0, 120)}`, leftMargin + 10, y, 9);
    nextLine();
  }

  if (flags.length === 0) {
    write('No open unpermitted work flags.', leftMargin + 10, y, 10);
    nextLine();
  }

  nextLine();
  write('This report is generated automatically from available permit records.', leftMargin, y, 9);
  nextLine();
  write('Verify all permit information with the relevant municipal authority.', leftMargin, y, 9);

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

export async function generatePermitDisclosureJob(exportId: string): Promise<void> {
  const exp = await (prisma as any).permitDisclosureExport.findUnique({
    where: { id: exportId },
  });

  if (!exp) return;
  if (exp.status !== 'PENDING') return;

  const contextCheck = await checkPermitWorkerContext(exp.propertyId);
  if (!contextCheck.allowed) {
    await (prisma as any).permitDisclosureExport.update({
      where: { id: exportId },
      data: {
        status: 'FAILED',
        errorMessage: `PROPERTY_CONTEXT_RECHECK_BLOCKED:${contextCheck.reasonCodes.join(',')}`,
      },
    });
    logger.info(
      { exportId, propertyId: exp.propertyId, reasonCodes: contextCheck.reasonCodes },
      '[PermitDisclosure] skipped after property context recheck',
    );
    return;
  }

  await (prisma as any).permitDisclosureExport.update({
    where: { id: exportId },
    data: { status: 'GENERATING' },
  });

  try {
    const snapshot = await buildDisclosureSnapshot(exp.propertyId);
    const pdfBuffer = await renderDisclosurePdf(snapshot, exp.propertyId);
    const checksum = sha256(pdfBuffer);
    const fileName = `permit-disclosure-${exp.propertyId}-${new Date().toISOString().slice(0, 10)}.pdf`;

    const uploaded = await uploadPdfBuffer({
      buffer: pdfBuffer,
      fileName,
      checksumSha256: checksum,
      propertyId: exp.propertyId,
      userId: exp.requestedByUserId,
    });

    await (prisma as any).permitDisclosureExport.update({
      where: { id: exportId },
      data: {
        status: 'COMPLETED',
        // W3 (permits): this used to also persist a raw, permanent,
        // non-expiring https://<bucket>.s3.amazonaws.com/<key> URL — unlike
        // every other export job in this codebase (generateHomeReportExport,
        // generateMaterialSpecExport), which store only the object key and
        // presign a short-lived URL on read. A permit disclosure PDF
        // (permit history + unpermitted-work flags) is exactly the kind of
        // legally-sensitive document that shouldn't be guessable-URL
        // fetchable forever, undermining the 7-day expiresAt retention
        // below. fileUrl is presigned on read instead — see
        // permitTracker.service.ts#getDisclosureExport/listDisclosureExports.
        fileKey: uploaded.key,
        totalPermits: snapshot.permits.length,
        openFlags: snapshot.flags.length,
        snapshotJson: {
          ...snapshot,
          propertyContextVersion: contextCheck.contextVersion,
        } as any,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    logger.info({ exportId, key: uploaded.key }, '[PermitDisclosure] Export completed');
  } catch (err: any) {
    logger.error({ err, exportId }, '[PermitDisclosure] Export failed');

    await (prisma as any).permitDisclosureExport.update({
      where: { id: exportId },
      data: {
        status: 'FAILED',
        errorMessage: (err?.message ?? 'Unknown error').slice(0, 1000),
      },
    });

    throw err;
  }
}
