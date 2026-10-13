// What happens to quotes imported from a Home Record when that record is permanently deleted (design §3.5, D-Q7).
//
// Source deletion does not undo a person's affirmation: confirmed and corrected facts, line items and terms stay, and the quote stays usable for
// comparison and for the historical decision. Everything that was only extracted is removed: unconfirmed line items, terms and facts, and the raw
// content and excerpts of the rest. The provenance row keeps the extractor and schema versions and records when the source was removed; the opaque
// record and version references become null when the record row is deleted. Dependency-free on purpose: the purge worker calls it with its own
// client, inside the transaction that deletes the record.
import { evaluateQuoteReadiness } from './quoteComparability.service';

export interface QuoteSourceRemovalSummary { sources: number; removedLineItems: number; removedTerms: number; removedFacts: number }

export async function removeQuoteSourceContent(db: any, recordId: string, now = new Date()): Promise<QuoteSourceRemovalSummary> {
  const summary: QuoteSourceRemovalSummary = { sources: 0, removedLineItems: 0, removedTerms: 0, removedFacts: 0 };
  const sources = await db.quoteHomeRecordSource.findMany({ where: { propertyRecordId: recordId, sourceRemovedAt: null }, select: { id: true, quoteId: true } }) as Array<{ id: string; quoteId: string }>;
  for (const source of sources) {
    summary.sources += 1;
    const lineItems = await db.quoteComparisonLineItem.deleteMany({ where: { quoteId: source.quoteId, confirmationStatus: 'EXTRACTED_UNCONFIRMED' } });
    const terms = await db.quoteComparisonTerm.deleteMany({ where: { quoteId: source.quoteId, confirmationStatus: 'EXTRACTED_UNCONFIRMED' } });
    const facts = await db.quoteComparisonFactConfirmation.deleteMany({ where: { quoteId: source.quoteId, status: 'EXTRACTED_UNCONFIRMED' } });
    summary.removedLineItems += lineItems.count; summary.removedTerms += terms.count; summary.removedFacts += facts.count;
    // What is kept no longer carries the document's text or the raw extracted value.
    await db.quoteComparisonLineItem.updateMany({ where: { quoteId: source.quoteId }, data: { sourceText: null, sourcePage: null } });
    await db.quoteComparisonTerm.updateMany({ where: { quoteId: source.quoteId }, data: { sourceText: null, sourcePage: null } });
    await db.quoteComparisonFactConfirmation.updateMany({ where: { quoteId: source.quoteId }, data: { sourceText: null, sourcePage: null, extractedValueJson: null } });

    const quote = await db.quoteComparisonQuote.findUnique({
      where: { id: source.quoteId }, include: { lineItems: true, terms: true },
    });
    if (quote) {
      // Readiness is recomputed from what remains, never from what was removed.
      const readiness = evaluateQuoteReadiness({
        id: quote.id, vendorName: quote.vendorName, quoteAmount: Number(quote.quoteAmount), serviceCategory: quote.serviceCategory, scopeKind: quote.scopeKind,
        scopeSummary: quote.scopeSummary, serviceLocation: quote.serviceLocation, quoteDate: quote.quoteDate,
        lineItems: quote.lineItems.map((item: any) => ({
          description: item.description, kind: item.kind, quantity: item.quantity === null ? null : Number(item.quantity), unit: item.unit,
          unitPrice: item.unitPrice === null ? null : Number(item.unitPrice), total: item.total === null ? null : Number(item.total),
        })),
        terms: quote.terms.map((term: any) => ({ type: term.type, value: term.value, included: term.included })),
        homeownerConfirmedAt: quote.homeownerConfirmedAt,
      } as never);
      await db.quoteComparisonQuote.update({
        where: { id: quote.id },
        data: {
          readinessStage: readiness.stage, readinessScore: readiness.score, comparabilityKey: readiness.comparabilityKey,
          missingFactsJson: readiness.missingFacts, ambiguitiesJson: readiness.ambiguities,
        },
      });
    }
    await db.quoteHomeRecordSource.update({ where: { id: source.id }, data: { sourceRemovedAt: now } });
  }
  return summary;
}
