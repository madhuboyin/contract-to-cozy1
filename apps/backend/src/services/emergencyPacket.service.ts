// apps/backend/src/services/emergencyPacket.service.ts
//
// Slice 7's "secure offline/emergency packet": a printable/downloadable PDF
// of exactly the information a household member needs when the app itself
// might be unreachable (power outage, no signal) — emergency contacts and
// every Home Digital Will entry explicitly flagged isEmergency, grouped by
// section. Deliberately distinct from Property Brief's external-recipient
// sharing model (Slice 7's other mechanism) — this is for the household's
// own offline use, gated at the same CONTRIBUTOR+ floor the Digital Will
// read route already uses, not a token-based external share.
//
// Reuses the same pdf-lib primitives propertyBrief.service.ts's
// renderPropertyBriefPdf already established, but as a small self-contained
// generator rather than sharing code across the two files — the content
// shapes are different enough (contacts + flagged entries vs. assembled
// sections) that a shared abstraction would add more indirection than it
// would save.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';

function printable(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export async function generateEmergencyPacketPdf(propertyId: string): Promise<Buffer> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { name: true, address: true, city: true, state: true, zipCode: true },
  });
  if (!property) throw new APIError('Property not found.', 404, 'PROPERTY_NOT_FOUND');

  const will = await prisma.homeDigitalWill.findUnique({
    where: { propertyId },
    include: {
      sections: {
        orderBy: [{ sortOrder: 'asc' }],
        include: {
          entries: {
            where: { isEmergency: true },
            orderBy: [{ priority: 'desc' }, { sortOrder: 'asc' }],
          },
        },
      },
      trustedContacts: {
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      },
    },
  });

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 612;
  const height = 792;
  const margin = 48;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const ensureSpace = (needed = 40) => {
    if (y - needed >= margin) return;
    page = pdf.addPage([width, height]);
    y = height - margin;
  };
  const linesFor = (text: string, size: number, maxWidth: number, font = regular) => {
    const words = printable(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines.length > 0 ? lines : [''];
  };
  const drawText = (text: string, options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = options.size ?? 10;
    const font = options.bold ? bold : regular;
    const lines = linesFor(text, size, width - margin * 2, font);
    ensureSpace(lines.length * (size + 3) + (options.gap ?? 5));
    for (const line of lines) {
      page.drawText(line, { x: margin, y, size, font, color: options.color ?? rgb(0.15, 0.2, 0.27) });
      y -= size + 3;
    }
    y -= options.gap ?? 5;
  };

  drawText('EMERGENCY & OFFLINE REFERENCE PACKET', { size: 9, bold: true, color: rgb(0.72, 0.2, 0.15), gap: 8 });
  drawText(
    `${property.name ?? 'Home'} — ${property.address}, ${property.city}, ${property.state} ${property.zipCode}`,
    { size: 16, bold: true, gap: 6 },
  );
  drawText(`Generated ${new Date().toISOString()}. Keep an offline (printed or saved) copy — this packet is meant for use when the app itself may be unreachable.`, { size: 8, color: rgb(0.4, 0.43, 0.47), gap: 14 });

  drawText('Emergency contacts', { size: 14, bold: true, color: rgb(0.72, 0.2, 0.15), gap: 6 });
  const contacts = will?.trustedContacts ?? [];
  if (contacts.length === 0) {
    drawText('No trusted contacts have been added to the Home Digital Will yet.', { size: 9 });
  }
  for (const contact of contacts) {
    ensureSpace(30);
    drawText(`${contact.name}${contact.isPrimary ? ' (primary)' : ''} — ${contact.relationship ?? contact.role}`, { size: 10, bold: true, gap: 2 });
    drawText([contact.phone, contact.email].filter(Boolean).join(' · ') || 'No phone or email on file', { size: 9, gap: 8 });
  }

  drawText('Critical information', { size: 14, bold: true, color: rgb(0.72, 0.2, 0.15), gap: 6 });
  const sectionsWithEmergencyEntries = (will?.sections ?? []).filter((section) => section.entries.length > 0);
  if (sectionsWithEmergencyEntries.length === 0) {
    drawText('No entries have been marked as emergency-relevant yet in the Home Digital Will.', { size: 9 });
  }
  for (const section of sectionsWithEmergencyEntries) {
    ensureSpace(30);
    drawText(section.title, { size: 11, bold: true, gap: 4 });
    for (const entry of section.entries) {
      ensureSpace(24);
      drawText(`${entry.title} [${entry.priority}]`, { size: 9, bold: true, gap: 2 });
      drawText(entry.summary || entry.content || 'No details recorded.', { size: 9, gap: 8 });
    }
  }

  drawText(
    'This packet reflects homeowner-authored entries as of the generation date above — it is not a verified, professional, or emergency-services document.',
    { size: 8, color: rgb(0.45, 0.48, 0.52) },
  );

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
