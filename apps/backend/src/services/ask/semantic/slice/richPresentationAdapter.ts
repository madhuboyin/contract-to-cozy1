import type { AskPresentationBlock } from '../../../../productFramework/ask/ask.contract';
import type { SemanticReadReceipt } from '../semanticExecutionReceipt';
import type { EnrichmentRowAction } from '../../actionEnrichment/actionEnrichmentRows';
import { humanizeEnumTokensInCopy, humanizePresentationText, humanizePresentationToken } from '../containment/presentationHumanizer';

/** Block-id suffix of the separate collection of unconfirmed records. */
export const UNCONFIRMED_LIST_SUFFIX = '-needs-confirmation';

export interface SlicePresentationRow {
  readonly id: string;
  readonly label: string;
  readonly subtitle?: string;
  readonly description?: string;
  readonly meta?: readonly string[];
  readonly stateCode?: string;
  /** The record's own status, for a renderer that shows it (the canonical claim list). */
  readonly status?: string;
  readonly badgeLabel?: string;
  readonly groupKey?: string;
  /** Grounded entity type of this row. Set only with `actions`, so a row without a governed next step renders exactly as before. */
  readonly entityType?: string;
  /** Governed next-step actions chosen by the action-enrichment registry (Actionable Result Enrichment FRD). */
  readonly actions?: readonly EnrichmentRowAction[];
}

export interface SliceRichPresentationInput {
  readonly receipt: SemanticReadReceipt;
  readonly title: string;
  readonly summaryBody: string;
  readonly rows: readonly SlicePresentationRow[];
  /**
   * Records the answer could not confirm (their state is unknown). They are a separate collection under their own heading and never part of `rows`, so a record that
   * was not confirmed cannot be shown, counted or described as a match (UI review 2026-11-21, P0 #2). Their number must equal the receipt's unknownCount.
   */
  readonly unconfirmedRows?: readonly SlicePresentationRow[];
  readonly unconfirmedTitle?: string;
  readonly listId?: string;
  readonly listTitle?: string;
  readonly listDescription?: string;
  /** Said under the list when more rows qualified for an action than could be given one (FRD FR-ACT-4). */
  readonly overflowNote?: string;
}

export interface SliceRichPresentationEquivalenceReport {
  readonly ok: boolean;
  readonly reasons: readonly string[];
  readonly renderedItemCount: number;
  readonly receiptDisplayedCount: number;
  readonly receiptConfirmedCount: number;
}

/**
 * §18 Phase 2A / §19 Artifact #26:
 * Query-backed rich presentation adapter rendering SUMMARY, GROUPED_LIST,
 * BOUNDARY (for conflicted/unknown populations), and EVIDENCE blocks while
 * preserving the canonical receipt population and predicate lineage.
 */
export function buildSliceRichPresentation(input: SliceRichPresentationInput): AskPresentationBlock[] {
  const { receipt, rows } = input;
  const blocks: AskPresentationBlock[] = [
    {
      type: 'SUMMARY',
      id: receipt.answerVariantId,
      title: humanizeEnumTokensInCopy(input.title),
      body: humanizeEnumTokensInCopy(input.summaryBody),
      tone: receipt.population.conflictedCount > 0 ? 'CAUTION' : 'DEFAULT',
      actions: [],
    },
  ];

  if (rows.length > 0) {
    const grouped = new Map<string, SlicePresentationRow[]>();
    for (const row of rows) {
      const key = row.groupKey ? humanizePresentationToken(row.groupKey) : 'Matched records';
      const bucket = grouped.get(key) ?? [];
      bucket.push(row);
      grouped.set(key, bucket);
    }

    blocks.push({
      type: 'GROUPED_LIST',
      id: input.listId ?? `${receipt.answerVariantId}-list`,
      title: humanizeEnumTokensInCopy(input.listTitle ?? input.title),
      description: [input.listDescription ?? `Showing ${rows.length} of ${receipt.population.totalMatchCount} confirmed matches`, input.overflowNote].filter(Boolean).join(' '),
      sections: [...grouped.entries()].map(([groupTitle, groupRows], index) => ({
        id: `${receipt.answerVariantId}-section-${index + 1}`,
        title: groupTitle,
        count: groupRows.length,
        items: groupRows.map((row) => ({
          id: row.id,
          title: humanizeEnumTokensInCopy(row.label),
          meta: [...(row.meta ?? [])].map(humanizeEnumTokensInCopy),
          subtitle: row.subtitle ? humanizeEnumTokensInCopy(row.subtitle) : undefined,
          description: row.description ? humanizeEnumTokensInCopy(row.description) : undefined,
          ...(row.status ? { status: row.status } : {}),
          ...(row.entityType ? { entityType: row.entityType } : {}),
          ...(row.actions && row.actions.length > 0 ? { actions: row.actions.map((action) => ({ ...action })) } : {}),
          badge: row.stateCode
            ? humanizePresentationToken(row.stateCode)
            : row.badgeLabel
              ? humanizePresentationToken(row.badgeLabel)
              : undefined,
        })),
      })),
      actions: [],
      filters: [],
    });
  }

  if (input.unconfirmedRows && input.unconfirmedRows.length > 0) {
    blocks.push({
      type: 'GROUPED_LIST',
      id: `${receipt.answerVariantId}${UNCONFIRMED_LIST_SUFFIX}`,
      title: humanizeEnumTokensInCopy(input.unconfirmedTitle ?? 'Needs confirmation'),
      description: '',
      sections: [{
        id: `${receipt.answerVariantId}-unconfirmed-section`,
        title: humanizeEnumTokensInCopy(input.unconfirmedTitle ?? 'Needs confirmation'),
        count: input.unconfirmedRows.length,
        items: input.unconfirmedRows.map((row) => ({
          id: row.id,
          title: humanizeEnumTokensInCopy(row.label),
          meta: [...(row.meta ?? [])].map(humanizeEnumTokensInCopy),
          subtitle: row.subtitle ? humanizeEnumTokensInCopy(row.subtitle) : undefined,
          description: row.description ? humanizeEnumTokensInCopy(row.description) : undefined,
          ...(row.status ? { status: row.status } : {}),
          ...(row.entityType ? { entityType: row.entityType } : {}),
          badge: row.stateCode ? humanizePresentationToken(row.stateCode) : row.badgeLabel ? humanizePresentationToken(row.badgeLabel) : undefined,
        })),
      }],
      actions: [],
      filters: [],
    });
  }

  if (receipt.population.conflictedCount > 0 || receipt.population.unknownCount > 0) {
    // The uncertainty note is about whatever relation the answer reads. Warranty wording only appears on warranty answers; any other
    // job (project permits, recalls, ...) gets a neutral note instead of a misleading "warranty" heading.
    const isWarranty = receipt.predicateIds.some((id) => /warrant/i.test(id));
    blocks.push({
      type: 'BOUNDARY',
      id: `${receipt.answerVariantId}-boundary`,
      title: isWarranty ? 'Warranty linkage requires confirmation' : 'Some records need confirmation',
      body: isWarranty
        ? `Conflicted links: ${receipt.population.conflictedCount}; unknown state: ${receipt.population.unknownCount}.`
        : `${receipt.population.unknownCount > 0 ? `${receipt.population.unknownCount} could not be confirmed from your records` : ''}${receipt.population.unknownCount > 0 && receipt.population.conflictedCount > 0 ? '; ' : ''}${receipt.population.conflictedCount > 0 ? `${receipt.population.conflictedCount} have conflicting records` : ''}, so they are not counted either way.`,
      severity: receipt.population.conflictedCount > 0 ? 'CAUTION' : 'INFO',
      suggestions: isWarranty ? ['Confirm warranty coverage on the item detail page.'] : ['Add or correct the missing details so I can confirm them.'],
    });
  }

  // Provenance shown to the homeowner names the record set in plain words. Predicate and adapter ids stay in the receipt (audit
  // evidence), never in answer copy (FR-ANS-6).
  blocks.push({
    type: 'EVIDENCE',
    id: `${receipt.answerVariantId}-evidence`,
    title: 'Where this comes from',
    items: [
      {
        label: 'Your home record',
        source: humanizePresentationToken(receipt.provenance.sourceType),
        observedAt: receipt.provenance.observedAt,
      },
    ],
  });

  return blocks;
}

/**
 * Proves that the rich presentation preserves the canonical receipt's population
 * counts, record IDs, uncertainty disclosures, and provenance lineage.
 */
export function verifyRichPresentationPopulationEquivalence(
  receipt: SemanticReadReceipt,
  blocks: readonly AskPresentationBlock[]
): SliceRichPresentationEquivalenceReport {
  const reasons: string[] = [];
  const summary = blocks.find((block) => block.type === 'SUMMARY' && block.id === receipt.answerVariantId);
  if (!summary || summary.type !== 'SUMMARY') {
    reasons.push('missing_summary_block_for_receipt');
  } else if (receipt.projection === 'COUNT') {
    const text = `${summary.title} ${summary.body}`;
    if (!new RegExp(`\\b${receipt.population.confirmedCount}\\b`).test(text)) {
      reasons.push('count_not_preserved_in_summary');
    }
  }

  const listBlock = blocks.find((block) => block.type === 'GROUPED_LIST' && !block.id.endsWith(UNCONFIRMED_LIST_SUFFIX));
  const unconfirmedBlock = blocks.find((block) => block.type === 'GROUPED_LIST' && block.id.endsWith(UNCONFIRMED_LIST_SUFFIX));
  if (unconfirmedBlock && unconfirmedBlock.type === 'GROUPED_LIST') {
    const unconfirmedItems = unconfirmedBlock.sections.flatMap((section) => section.items);
    if (unconfirmedItems.length !== receipt.population.unknownCount) reasons.push(`unconfirmed_count_mismatch:${unconfirmedItems.length}!=${receipt.population.unknownCount}`);
    const confirmedIds = new Set(receipt.resolvedRecordIds);
    for (const item of unconfirmedItems) if (confirmedIds.has(item.id)) reasons.push(`unconfirmed_listed_as_confirmed:${item.id}`);
  }
  const renderedItems = listBlock && listBlock.type === 'GROUPED_LIST'
    ? listBlock.sections.flatMap((section) => section.items)
    : [];

  if (receipt.projection !== 'COUNT' && renderedItems.length !== receipt.population.displayedCount) {
    reasons.push(`displayed_count_mismatch:${renderedItems.length}!=${receipt.population.displayedCount}`);
  }

  if (receipt.resolvedRecordIds.length > 0 && renderedItems.length > 0) {
    const allowedIds = new Set(receipt.resolvedRecordIds);
    const seenRenderedIds = new Set<string>();
    for (const item of renderedItems) {
      if (!allowedIds.has(item.id)) {
        reasons.push(`ungrounded_rendered_item:${item.id}`);
      }
      if (seenRenderedIds.has(item.id)) {
        reasons.push(`duplicate_rendered_item:${item.id}`);
      }
      seenRenderedIds.add(item.id);
    }
    if (!receipt.population.truncated && receipt.projection !== 'COUNT') {
      for (const expectedId of receipt.resolvedRecordIds) {
        if (!seenRenderedIds.has(expectedId)) {
          reasons.push(`missing_rendered_item:${expectedId}`);
        }
      }
    }
  }

  const hasBoundary = blocks.some((block) => block.type === 'BOUNDARY');
  if ((receipt.population.conflictedCount > 0 || receipt.population.unknownCount > 0) && !hasBoundary) {
    reasons.push('missing_uncertainty_boundary_block');
  }

  const evidence = blocks.find((block) => block.type === 'EVIDENCE');
  if (!evidence || evidence.type !== 'EVIDENCE') {
    reasons.push('missing_evidence_block');
  } else if (!evidence.items.some((item) => item.source === receipt.provenance.sourceType || item.source === humanizePresentationToken(receipt.provenance.sourceType))) {
    // The audit identity stays in the receipt; the rendered evidence names the same record set in plain words (FR-ANS-6).
    reasons.push('provenance_source_mismatch');
  }

  return {
    ok: reasons.length === 0,
    reasons,
    renderedItemCount: renderedItems.length,
    receiptDisplayedCount: receipt.population.displayedCount,
    receiptConfirmedCount: receipt.population.confirmedCount,
  };
}
