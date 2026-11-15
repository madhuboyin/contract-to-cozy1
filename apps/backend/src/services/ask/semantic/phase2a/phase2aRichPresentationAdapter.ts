import type { AskPresentationBlock } from '../../../../productFramework/ask/ask.contract';
import type { SemanticReadReceipt } from '../semanticExecutionReceipt';
import { humanizePresentationText, humanizePresentationToken } from '../phase1/presentationHumanizer';

export interface Phase2aPresentationRow {
  readonly id: string;
  readonly label: string;
  readonly subtitle?: string;
  readonly stateCode?: string;
  readonly badgeLabel?: string;
  readonly groupKey?: string;
}

export interface Phase2aRichPresentationInput {
  readonly receipt: SemanticReadReceipt;
  readonly title: string;
  readonly summaryBody: string;
  readonly rows: readonly Phase2aPresentationRow[];
}

export interface Phase2aRichPresentationEquivalenceReport {
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
export function buildPhase2aRichPresentation(input: Phase2aRichPresentationInput): AskPresentationBlock[] {
  const { receipt, rows } = input;
  const blocks: AskPresentationBlock[] = [
    {
      type: 'SUMMARY',
      id: receipt.answerVariantId,
      title: humanizePresentationText(input.title),
      body: humanizePresentationText(input.summaryBody),
      tone: receipt.population.conflictedCount > 0 ? 'CAUTION' : 'DEFAULT',
      actions: [],
    },
  ];

  if (rows.length > 0) {
    const grouped = new Map<string, Phase2aPresentationRow[]>();
    for (const row of rows) {
      const key = row.groupKey ? humanizePresentationToken(row.groupKey) : 'Matched records';
      const bucket = grouped.get(key) ?? [];
      bucket.push(row);
      grouped.set(key, bucket);
    }

    blocks.push({
      type: 'GROUPED_LIST',
      id: `${receipt.answerVariantId}-list`,
      title: humanizePresentationText(input.title),
      description: `Showing ${rows.length} of ${receipt.population.totalMatchCount} confirmed matches`,
      sections: [...grouped.entries()].map(([groupTitle, groupRows], index) => ({
        id: `${receipt.answerVariantId}-section-${index + 1}`,
        title: groupTitle,
        count: groupRows.length,
        items: groupRows.map((row) => ({
          id: row.id,
          title: row.label,
          meta: [],
          subtitle: row.subtitle ? humanizePresentationText(row.subtitle) : undefined,
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

  if (receipt.population.conflictedCount > 0 || receipt.population.unknownCount > 0) {
    blocks.push({
      type: 'BOUNDARY',
      id: `${receipt.answerVariantId}-boundary`,
      title: 'Warranty linkage requires confirmation',
      body: `Conflicted links: ${receipt.population.conflictedCount}; unknown state: ${receipt.population.unknownCount}.`,
      severity: receipt.population.conflictedCount > 0 ? 'CAUTION' : 'INFO',
      suggestions: ['Confirm warranty coverage on the item detail page.'],
    });
  }

  blocks.push({
    type: 'EVIDENCE',
    id: `${receipt.answerVariantId}-evidence`,
    title: 'Grounded semantic evidence',
    items: [
      {
        label: `Predicates: ${receipt.predicateIds.join(', ')}`,
        source: receipt.provenance.sourceType,
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
): Phase2aRichPresentationEquivalenceReport {
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

  const listBlock = blocks.find((block) => block.type === 'GROUPED_LIST');
  const renderedItems = listBlock && listBlock.type === 'GROUPED_LIST'
    ? listBlock.sections.flatMap((section) => section.items)
    : [];

  if (receipt.projection !== 'COUNT' && renderedItems.length !== receipt.population.displayedCount) {
    reasons.push(`displayed_count_mismatch:${renderedItems.length}!=${receipt.population.displayedCount}`);
  }

  if (receipt.resolvedRecordIds.length > 0 && renderedItems.length > 0) {
    const allowedIds = new Set(receipt.resolvedRecordIds);
    for (const item of renderedItems) {
      if (!allowedIds.has(item.id)) {
        reasons.push(`ungrounded_rendered_item:${item.id}`);
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
  } else if (!evidence.items.some((item) => item.source === receipt.provenance.sourceType)) {
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
