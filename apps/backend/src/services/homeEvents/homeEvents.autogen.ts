// apps/backend/src/services/homeEvents/homeEvents.autogen.ts
import { prisma } from '../../lib/prisma';

// Keep it dead simple + safe
function enabled() {
  return String(process.env.HOME_EVENTS_AUTOGEN || '').toLowerCase() === 'true';
}

function safeDate(d?: Date | string | null) {
  if (!d) return null;
  return d instanceof Date ? d : new Date(d);
}

/**
 * Idempotent creator for HomeEvent.
 * - If HOME_EVENTS_AUTOGEN is off: no-op.
 * - If idempotencyKey exists: upsert-like behavior (findFirst + create).
 */
export class HomeEventsAutoGen {
  static async ensureEvent(args: {
    propertyId: string;
    createdById?: string | null;

    type: any; // HomeEventType
    subtype?: string | null;

    occurredAt: Date;
    title: string;
    summary?: string | null;

    roomId?: string | null;
    inventoryItemId?: string | null;
    claimId?: string | null;
    expenseId?: string | null;

    amount?: string | null; // Decimal string "12.34"
    currency?: string | null;
    valueDelta?: string | null;

    meta?: any;
    groupKey?: string | null;

    idempotencyKey: string; // REQUIRED for autogen
  }) {
    if (!enabled()) return null;

    const existing = await prisma.homeEvent.findFirst({
      where: { propertyId: args.propertyId, idempotencyKey: args.idempotencyKey },
      select: { id: true },
    });
    if (existing) return existing;

    return prisma.homeEvent.create({
      data: {
        propertyId: args.propertyId,
        createdById: args.createdById ?? null,

        type: args.type,
        subtype: args.subtype ?? null,

        occurredAt: args.occurredAt,
        title: args.title,
        summary: args.summary ?? null,

        roomId: args.roomId ?? null,
        inventoryItemId: args.inventoryItemId ?? null,
        claimId: args.claimId ?? null,
        expenseId: args.expenseId ?? null,

        amount: args.amount ?? null,
        currency: args.currency ?? undefined,
        valueDelta: args.valueDelta ?? null,

        meta: args.meta ?? undefined,
        groupKey: args.groupKey ?? null,

        idempotencyKey: args.idempotencyKey,
      },
      select: { id: true },
    });
  }

  // ---------------- Claim -> HomeEvent ----------------

  static async onClaimCreated(args: {
    propertyId: string;
    claimId: string;
    userId?: string | null;
    title: string;
    type?: string | null;
    incidentAt?: Date | string | null;
  }) {
    const occurredAt = safeDate(args.incidentAt) ?? new Date();

    return this.ensureEvent({
      propertyId: args.propertyId,
      createdById: args.userId ?? null,
      type: 'CLAIM',
      subtype: args.type ? `CLAIM_${args.type}` : null,
      occurredAt,
      title: `Claim opened: ${args.title}`,
      summary: null,
      claimId: args.claimId,
      idempotencyKey: `claim:${args.claimId}:created`,
      meta: { claimId: args.claimId },
    });
  }

  static async onClaimStatusChanged(args: {
    propertyId: string;
    claimId: string;
    userId?: string | null;
    title: string;
    fromStatus: string;
    toStatus: string;
  }) {
    // Keep status changes as “supporting moments” (grouped under claim)
    return this.ensureEvent({
      propertyId: args.propertyId,
      createdById: args.userId ?? null,
      type: 'CLAIM',
      subtype: 'CLAIM_STATUS',
      occurredAt: new Date(),
      title: `Claim status: ${args.toStatus}`,
      summary: `Changed from ${args.fromStatus} → ${args.toStatus}`,
      claimId: args.claimId,
      groupKey: `claim:${args.claimId}`,
      idempotencyKey: `claim:${args.claimId}:status:${args.fromStatus}->${args.toStatus}:${new Date().toISOString().slice(0, 10)}`,
      meta: { fromStatus: args.fromStatus, toStatus: args.toStatus },
    });
  }

  // ---------------- Inventory -> HomeEvent ----------------

  static async onInventoryItemCreated(args: {
    propertyId: string;
    itemId: string;
    userId?: string | null;

    name: string;
    category?: string | null;
    roomId?: string | null;
    purchasedOn?: Date | string | null;
    purchaseCostCents?: number | null;
    currency?: string | null;

    brand?: string | null;
    model?: string | null;
    upc?: string | null;
    sku?: string | null;
  }) {
    const occurredAt = safeDate(args.purchasedOn) ?? new Date();

    // Convert cents -> decimal string
    const amount =
      typeof args.purchaseCostCents === 'number' ? (args.purchaseCostCents / 100).toFixed(2) : null;

    const labelBits = [args.brand, args.model].filter(Boolean).join(' ');
    const summary = labelBits ? `Details: ${labelBits}` : null;

    return this.ensureEvent({
      propertyId: args.propertyId,
      createdById: args.userId ?? null,
      type: 'PURCHASE',
      subtype: args.category ? `ITEM_${args.category}` : 'ITEM',
      occurredAt,
      title: `Purchased: ${args.name}`,
      summary,
      roomId: args.roomId ?? null,
      inventoryItemId: args.itemId,
      amount,
      currency: args.currency ?? undefined,
      idempotencyKey: `inventoryItem:${args.itemId}:created`,
      groupKey: `purchase:${occurredAt.toISOString().slice(0, 10)}`,
      meta: {
        itemId: args.itemId,
        brand: args.brand ?? null,
        model: args.model ?? null,
        upc: args.upc ?? null,
        sku: args.sku ?? null,
      },
    });
  }

  static normalizeCategory(cat?: string | null) {
    return String(cat || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_')
      .replace(/[^A-Z0-9_]/g, '');
  }
  
  // Very conservative mapping (avoid wrong categorization)
  static mapExpenseCategoryToEventType(category?: string | null): any /* HomeEventType */ {
    const c = this.normalizeCategory(category);
  
    // Improvements / upgrades
    if (c.includes('IMPROV') || c.includes('REMODEL') || c.includes('RENOV') || c.includes('UPGRADE')) {
      return 'IMPROVEMENT';
    }
  
    // Repairs
    if (c.includes('REPAIR') || c.includes('FIX')) {
      return 'REPAIR';
    }
  
    // Maintenance
    if (c.includes('MAINT') || c.includes('SERVICE') || c.includes('TUNE')) {
      return 'MAINTENANCE';
    }
  
    // Default
    return 'PURCHASE';
  }
  
  static async onExpenseCreated(args: {
    propertyId: string;
    expenseId: string;
    userId?: string | null;
  
    category?: string | null;
    description?: string | null;
  
    transactionDate: Date | string;
    amount: number;
    currency?: string | null;
  }) {
    const occurredAt = args.transactionDate instanceof Date ? args.transactionDate : new Date(args.transactionDate);
    const type = this.mapExpenseCategoryToEventType(args.category ?? null);
  
    const categoryLabel = args.category ? String(args.category) : 'Expense';
    const titleBase = args.description?.trim()
      ? args.description.trim()
      : categoryLabel;
  
    return this.ensureEvent({
      propertyId: args.propertyId,
      createdById: args.userId ?? null,
  
      type,
      subtype: args.category ? `EXP_${this.normalizeCategory(args.category)}` : 'EXPENSE',
  
      occurredAt,
      title: `Expense: ${titleBase}`,
      summary: args.category ? `Category: ${categoryLabel}` : null,
  
      expenseId: args.expenseId,
  
      amount: Number(args.amount).toFixed(2),
      currency: args.currency ?? undefined,
  
      groupKey: `expense:${occurredAt.toISOString().slice(0, 10)}`,
      idempotencyKey: `expense:${args.expenseId}:created`,
      meta: {
        expenseId: args.expenseId,
        category: args.category ?? null,
      },
    });
  }
  
  static async onExpenseUpdated(args: {
    propertyId: string;
    expenseId: string;
    userId?: string | null;
  
    category?: string | null;
    description?: string | null;
  
    transactionDate: Date | string;
    amount: number;
    currency?: string | null;
  }) {
    if (!enabled()) return null;
  
    // We update the existing autogen event (if present) rather than creating a new “moment”
    const event = await prisma.homeEvent.findFirst({
      where: { propertyId: args.propertyId, idempotencyKey: `expense:${args.expenseId}:created` },
      select: { id: true },
    });
    if (!event) return null;
  
    const occurredAt = args.transactionDate instanceof Date ? args.transactionDate : new Date(args.transactionDate);
    const type = this.mapExpenseCategoryToEventType(args.category ?? null);
  
    const categoryLabel = args.category ? String(args.category) : 'Expense';
    const titleBase = args.description?.trim()
      ? args.description.trim()
      : categoryLabel;
  
    await prisma.homeEvent.update({
      where: { id: event.id },
      data: {
        type,
        subtype: args.category ? `EXP_${this.normalizeCategory(args.category)}` : 'EXPENSE',
        occurredAt,
        title: `Expense: ${titleBase}`,
        summary: args.category ? `Category: ${categoryLabel}` : null,
        amount: Number(args.amount).toFixed(2),
        currency: args.currency ?? undefined,
        groupKey: `expense:${occurredAt.toISOString().slice(0, 10)}`,
        meta: {
          expenseId: args.expenseId,
          category: args.category ?? null,
        },
      },
    });
  
    return { id: event.id };
  }
  static normalizeDocType(t?: string | null) {
    return String(t || 'OTHER')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_')
      .replace(/[^A-Z0-9_]/g, '');
  }
  
  static inferDocKind(mimeType?: string | null): any /* HomeEventDocumentKind */ {
    const m = String(mimeType || '').toLowerCase();
    if (m.startsWith('image/')) return 'PHOTO';
    if (m === 'application/pdf') return 'PDF';
    return 'OTHER';
  }
  
  /**
   * Create a DOCUMENT HomeEvent + attach the doc to it.
   * Safe + idempotent.
   */
  static async onDocumentUploaded(args: {
    propertyId: string;
    documentId: string;
    homeownerProfileId?: string | null;
  
    name: string;
    docType: string; // Prisma DocumentType (string enum)
    mimeType?: string | null;
    description?: string | null;
  
    createdAt: Date;
  
    // optional link context
    warrantyId?: string | null;
    policyId?: string | null;
  }) {
    // Only create timeline moments for property-linked docs (emotional “home story”)
    if (!args.propertyId) return null;
  
    const subtype = `DOC_${this.normalizeDocType(args.docType)}`;
    const title = `Uploaded document: ${args.name}`;
  
    const summaryParts: string[] = [];
    if (args.docType) summaryParts.push(`Type: ${args.docType}`);
    if (args.warrantyId) summaryParts.push('Linked to Warranty');
    if (args.policyId) summaryParts.push('Linked to Policy');
    const summary = summaryParts.length ? summaryParts.join(' • ') : null;
  
    // Create or find the event
    const evt = await this.ensureEvent({
      propertyId: args.propertyId,
      createdById: null, // you can set later if you pass userId
      type: 'DOCUMENT',
      subtype,
      occurredAt: args.createdAt,
      title,
      summary,
  
      idempotencyKey: `doc:${args.documentId}:created`,
      groupKey: `doc:${args.createdAt.toISOString().slice(0, 10)}`,
      meta: {
        documentId: args.documentId,
        docType: args.docType,
        mimeType: args.mimeType ?? null,
        warrantyId: args.warrantyId ?? null,
        policyId: args.policyId ?? null,
      },
    });
  
    if (!evt?.id) return evt;
  
    // Attach the document to the event (idempotent)
    await prisma.homeEventDocument.upsert({
      where: { eventId_documentId: { eventId: evt.id, documentId: args.documentId } },
      create: {
        eventId: evt.id,
        documentId: args.documentId,
        kind: this.inferDocKind(args.mimeType ?? null),
        caption: args.description ?? null,
        sortOrder: 0,
      },
      update: {},
    });
  // Try to promote DOCUMENT → semantic story moment (safe + conservative)
    try {
        await this.promoteDocumentEventToSemantic({
        propertyId: args.propertyId,
        documentId: args.documentId,
        });
    } catch (e) {
        console.error('[HOME_EVENTS_AUTOGEN] promoteDocumentEventToSemantic failed:', e);
    }
  
    return evt;
  }

  static textOf(...parts: Array<string | null | undefined>) {
    return parts.filter(Boolean).join(' ').toLowerCase();
  }
  
  static hasAny(text: string, words: string[]) {
    return words.some((w) => text.includes(w));
  }
  
  static inferSemanticFromDocument(doc: {
    type: string;
    name: string;
    description?: string | null;
    mimeType?: string | null;
    metadata?: any;
  
    propertyId?: string | null;
    inventoryItemId?: string | null;
    warrantyId?: string | null;
    policyId?: string | null;
  
    // Optional includes if you decide to include relations later
    inventoryItem?: { name: string; category?: any | null } | null;
  }) {
    const t = String(doc.type);
    const blob = this.textOf(doc.name, doc.description, JSON.stringify(doc.metadata ?? {}));
  
    // Hard-high confidence mappings (safe)
    if (t === 'INSPECTION_REPORT') {
      return {
        type: 'INSPECTION' as const,
        subtype: 'DOC_INSPECTION_REPORT',
        title: `Inspection report uploaded: ${doc.name}`,
        summary: doc.description ?? null,
        confidence: 0.95,
        reason: 'DocumentType=INSPECTION_REPORT',
      };
    }
  
    if (t === 'HOME_REPORT_PDF') {
      return {
        type: 'MILESTONE' as const,
        subtype: 'DOC_HOME_REPORT',
        title: `Home report generated: ${doc.name}`,
        summary: doc.description ?? null,
        confidence: 0.9,
        reason: 'DocumentType=HOME_REPORT_PDF',
      };
    }
  
    if (t === 'INSURANCE_CERTIFICATE') {
      return {
        type: 'MILESTONE' as const,
        subtype: 'DOC_INSURANCE',
        title: `Insurance document uploaded: ${doc.name}`,
        summary: doc.description ?? null,
        confidence: 0.85,
        reason: 'DocumentType=INSURANCE_CERTIFICATE',
      };
    }
  
    if (t === 'LICENSE') {
      return {
        type: 'MILESTONE' as const,
        subtype: 'DOC_LICENSE',
        title: `License uploaded: ${doc.name}`,
        summary: doc.description ?? null,
        confidence: 0.8,
        reason: 'DocumentType=LICENSE',
      };
    }
  
    // Contextual mappings (require stronger signals)
    // Permit/Contract are usually improvements, but could be repair—keep conservative.
    if (t === 'PERMIT' || t === 'CONTRACT') {
      // if text suggests remodel/upgrade → IMPROVEMENT strong
      const improvementWords = ['remodel', 'renov', 'upgrade', 'addition', 'kitchen', 'bath', 'basement', 'deck'];
      const repairWords = ['repair', 'fix', 'leak', 'storm', 'water damage', 'roof repair'];
  
      if (this.hasAny(blob, improvementWords)) {
        return {
          type: 'IMPROVEMENT' as const,
          subtype: `DOC_${t}`,
          title: `${t === 'PERMIT' ? 'Permit' : 'Contract'}: ${doc.name}`,
          summary: doc.description ?? null,
          confidence: 0.82,
          reason: `${t} + improvement keywords`,
        };
      }
  
      if (this.hasAny(blob, repairWords)) {
        return {
          type: 'REPAIR' as const,
          subtype: `DOC_${t}`,
          title: `${t === 'PERMIT' ? 'Permit' : 'Contract'}: ${doc.name}`,
          summary: doc.description ?? null,
          confidence: 0.78,
          reason: `${t} + repair keywords`,
        };
      }
  
      // not confident enough → keep DOCUMENT
      return null;
    }
  
    // Estimate/Invoice: could be purchase/repair/maintenance/improvement
    if (t === 'ESTIMATE' || t === 'INVOICE') {
      const purchaseWords = ['purchase', 'order', 'receipt', 'sold', 'paid', 'delivery', 'warranty'];
      const maintenanceWords = ['tune', 'service', 'maintenance', 'inspect', 'cleaning', 'annual', 'hvac'];
      const repairWords = ['repair', 'fix', 'replace', 'leak', 'broken', 'damage', 'restore', 'remediation'];
      const improvementWords = ['remodel', 'renov', 'upgrade', 'install', 'installation', 'project'];
  
      // Strong contextual clue: inventoryItemId typically implies an item purchase/install
      if (doc.inventoryItemId) {
        // if invoice/estimate references install/service → maintenance/repair else purchase
        if (this.hasAny(blob, maintenanceWords)) {
          return {
            type: 'MAINTENANCE' as const,
            subtype: `DOC_${t}`,
            title: `${t === 'INVOICE' ? 'Service invoice' : 'Service estimate'}: ${doc.name}`,
            summary: doc.description ?? null,
            confidence: 0.82,
            reason: `${t} + inventoryItemId + maintenance keywords`,
          };
        }
        if (this.hasAny(blob, repairWords)) {
          return {
            type: 'REPAIR' as const,
            subtype: `DOC_${t}`,
            title: `${t === 'INVOICE' ? 'Repair invoice' : 'Repair estimate'}: ${doc.name}`,
            summary: doc.description ?? null,
            confidence: 0.82,
            reason: `${t} + inventoryItemId + repair keywords`,
          };
        }
        return {
          type: 'PURCHASE' as const,
          subtype: `DOC_${t}`,
          title: `Purchase document: ${doc.name}`,
          summary: doc.description ?? null,
          confidence: 0.8,
          reason: `${t} + inventoryItemId`,
        };
      }
  
      // No item link: require keywords for confidence
      if (this.hasAny(blob, improvementWords)) {
        return {
          type: 'IMPROVEMENT' as const,
          subtype: `DOC_${t}`,
          title: `${t === 'INVOICE' ? 'Project invoice' : 'Project estimate'}: ${doc.name}`,
          summary: doc.description ?? null,
          confidence: 0.8,
          reason: `${t} + improvement keywords`,
        };
      }
      if (this.hasAny(blob, maintenanceWords)) {
        return {
          type: 'MAINTENANCE' as const,
          subtype: `DOC_${t}`,
          title: `${t === 'INVOICE' ? 'Service invoice' : 'Service estimate'}: ${doc.name}`,
          summary: doc.description ?? null,
          confidence: 0.78,
          reason: `${t} + maintenance keywords`,
        };
      }
      if (this.hasAny(blob, repairWords)) {
        return {
          type: 'REPAIR' as const,
          subtype: `DOC_${t}`,
          title: `${t === 'INVOICE' ? 'Repair invoice' : 'Repair estimate'}: ${doc.name}`,
          summary: doc.description ?? null,
          confidence: 0.78,
          reason: `${t} + repair keywords`,
        };
      }
      if (this.hasAny(blob, purchaseWords)) {
        return {
          type: 'PURCHASE' as const,
          subtype: `DOC_${t}`,
          title: `Purchase document: ${doc.name}`,
          summary: doc.description ?? null,
          confidence: 0.76,
          reason: `${t} + purchase keywords`,
        };
      }
  
      // not confident
      return null;
    }
  
    // PHOTO/VIDEO/OTHER: keep DOCUMENT unless you later add explicit “before/after” tagging.
    return null;
  }
  static async promoteDocumentEventToSemantic(args: {
    propertyId: string;
    documentId: string;
  }) {
    if (!enabled()) return null;
  
    const doc = await prisma.document.findUnique({
      where: { id: args.documentId },
      include: {
        inventoryItem: { select: { id: true, name: true, category: true } },
      },
    });
    if (!doc || !doc.propertyId) return null;
  
    // Find the existing “doc created” HomeEvent
    const event = await prisma.homeEvent.findFirst({
      where: { propertyId: args.propertyId, idempotencyKey: `doc:${args.documentId}:created` },
      select: { id: true, type: true, meta: true },
    });
    if (!event) return null;
  
    const inferred = this.inferSemanticFromDocument({
      type: String(doc.type),
      name: doc.name,
      description: doc.description ?? null,
      mimeType: doc.mimeType ?? null,
      metadata: doc.metadata ?? null,
      propertyId: doc.propertyId ?? null,
      inventoryItemId: (doc as any).inventoryItemId ?? null,
      warrantyId: (doc as any).warrantyId ?? null,
      policyId: (doc as any).policyId ?? null,
      inventoryItem: doc.inventoryItem ?? null,
    });
  
    // Only promote when confidence >= threshold
    const THRESHOLD = 0.78;
    if (!inferred || inferred.confidence < THRESHOLD) {
      // Keep DOCUMENT but record why we didn’t promote (optional)
      await prisma.homeEvent.update({
        where: { id: event.id },
        data: {
          meta: {
            ...(event.meta as any),
            semantic: {
              promoted: false,
              confidence: inferred?.confidence ?? null,
              reason: inferred?.reason ?? 'No confident semantic mapping',
              docType: String(doc.type),
            },
          },
        },
      });
      return { id: event.id, promoted: false };
    }
  
    // Promote the existing event in-place (no duplicate timeline events)
    await prisma.homeEvent.update({
      where: { id: event.id },
      data: {
        type: inferred.type as any,
        subtype: inferred.subtype,
        title: inferred.title,
        summary: inferred.summary,
  
        // semantic link enrichments (safe)
        inventoryItemId: (doc as any).inventoryItemId ?? undefined,
  
        meta: {
          ...(event.meta as any),
          semantic: {
            promoted: true,
            confidence: inferred.confidence,
            reason: inferred.reason,
            docType: String(doc.type),
          },
        },
      },
    });
  
    return { id: event.id, promoted: true, type: inferred.type, confidence: inferred.confidence };
  }
        
}
