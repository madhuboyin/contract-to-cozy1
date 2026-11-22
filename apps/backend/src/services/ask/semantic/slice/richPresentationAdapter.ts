import type { AskListRecordKind, AskPresentationBlock, AskPresentationFamily } from '../../../../productFramework/ask/ask.contract';
import type { SemanticReadReceipt } from '../semanticExecutionReceipt';
import type { EnrichmentRowAction } from '../../actionEnrichment/actionEnrichmentRows';
import { humanizeEnumTokensInCopy, humanizePresentationText, humanizePresentationToken } from '../containment/presentationHumanizer';

/**
 * Answer first (UI review 2026-11-21, #43): the headline is the answer's own first sentence, not a topic label such as "Project permit requirements", and what follows it is the one
 * supporting line. The title and body stay as they were for every consumer that reads them; a client that knows `headline` uses it.
 */
export function answerFirst(body: string, title: string): { headline?: string; supportLine?: string } {
  const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((sentence) => sentence.trim()).filter(Boolean);
  const first = sentences[0];
  if (!first || first.length > 200 || first.toLowerCase() === title.toLowerCase()) return {};
  const rest = sentences.slice(1).join(' ');
  return { headline: first, ...(rest.length > 0 && rest.length <= 240 ? { supportLine: rest } : {}) };
}

/** The group heading of a list whose records are all of one kind. */
export const SECTION_NOUN_OF_RECORD_KIND: Readonly<Record<AskListRecordKind, string>> = {
  INVENTORY_ITEM: 'Items', MAINTENANCE_TASK: 'Tasks', CLAIM: 'Claims', PERMIT: 'Permits', WARRANTY: 'Warranties', DOCUMENT: 'Documents', HOME_EVENT: 'Events',
};

/** The row `entityType` each list kind's canonical renderer expects (the same value the registry handlers emit). */
export const ENTITY_TYPE_OF_RECORD_KIND: Readonly<Record<AskListRecordKind, string>> = {
  INVENTORY_ITEM: 'INVENTORY_ITEM', MAINTENANCE_TASK: 'MAINTENANCE_TASK', CLAIM: 'CLAIM', PERMIT: 'PERMIT_RECORD', WARRANTY: 'WARRANTY', DOCUMENT: 'DOCUMENT', HOME_EVENT: 'HOME_EVENT',
};

/** The block contract's field is `badgeLabel` (a key it does not declare is stripped on parse), and it is omitted when the row has no state to show. */
function rowBadge(row: SlicePresentationRow): { badgeLabel?: string } {
  const label = row.stateCode ? humanizePresentationToken(row.stateCode) : row.badgeLabel ? humanizePresentationToken(row.badgeLabel) : '';
  return label.trim().length > 0 ? { badgeLabel: label.slice(0, 60) } : {};
}

/** The one secondary line of a row: its description and subtitle (said once if they are the same), else why it matched. */
export function rowSecondaryLine(row: SlicePresentationRow): string | undefined {
  const parts = [row.description, row.subtitle].map((part) => (part ? humanizeEnumTokensInCopy(part) : '')).filter((part, index, all) => part.length > 0 && all.indexOf(part) === index);
  const line = parts.length > 0 ? parts.join(' · ') : row.matchReason ? humanizeEnumTokensInCopy(row.matchReason) : '';
  return line.length > 0 ? line : undefined;
}

/** Block-id suffix of the separate collection of unconfirmed records. */
export const UNCONFIRMED_LIST_SUFFIX = '-needs-confirmation';

export interface SlicePresentationRow {
  readonly id: string;
  readonly label: string;
  readonly subtitle?: string;
  readonly description?: string;
  readonly meta?: readonly string[];
  /** Why this record is in the answer, in the homeowner's words. */
  readonly matchReason?: string;
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
  /** The family of this answer; derived from the rows when omitted (a list when there are records, a direct answer when there are none). */
  readonly family?: AskPresentationFamily;
  /** The kind of record the list carries, so the client renders the canonical domain list whatever the block id. */
  readonly recordKind?: AskListRecordKind;
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
      presentationFamily: input.family ?? (rows.length > 0 || (input.unconfirmedRows?.length ?? 0) > 0 ? 'ENTITY_LIST' : 'DIRECT_ANSWER'),
      ...answerFirst(humanizeEnumTokensInCopy(input.summaryBody), humanizeEnumTokensInCopy(input.title)),
      actions: [],
    },
  ];

  if (rows.length > 0) {
    const grouped = new Map<string, SlicePresentationRow[]>();
    for (const row of rows) {
      // A row with no group of its own is simply a match. A list of a known record kind names its group by that kind (the domain renderers always print a section heading); any other list has no
      // group heading at all, and never a generic "Matched records".
      const key = row.groupKey ? humanizePresentationToken(row.groupKey) : input.recordKind ? SECTION_NOUN_OF_RECORD_KIND[input.recordKind] : '';
      const bucket = grouped.get(key) ?? [];
      bucket.push(row);
      grouped.set(key, bucket);
    }

    blocks.push({
      type: 'GROUPED_LIST',
      id: input.listId ?? `${receipt.answerVariantId}-list`,
      ...(input.recordKind ? { recordKind: input.recordKind } : {}),
      // Records are listed densely: a one-line row unless the record has more to say. The list's heading is not the answer's heading said again.
      listDensity: 'DENSE',
      title: input.listTitle ? humanizeEnumTokensInCopy(input.listTitle) : '',
      // The count is stated once (in the answer). The list says how many are shown only when it is showing part of them.
      description: [input.listDescription ?? (rows.length < receipt.population.totalMatchCount ? `Showing ${rows.length} of ${receipt.population.totalMatchCount}` : ''), input.overflowNote].filter(Boolean).join(' '),
      sections: [...grouped.entries()].map(([groupTitle, groupRows], index) => ({
        id: `${receipt.answerVariantId}-section-${index + 1}`,
        title: groupTitle,
        count: groupRows.length,
        items: groupRows.map((row) => ({
          id: row.id,
          title: humanizeEnumTokensInCopy(row.label),
          meta: [...(row.meta ?? [])].map(humanizeEnumTokensInCopy),
          // The block contract has no `subtitle`: a field it does not know is stripped on parse and never reaches the homeowner. A row's secondary line is its `description`.
          description: rowSecondaryLine(row),
          ...(row.status ? { status: row.status } : {}),
          ...(row.entityType ? { entityType: row.entityType } : input.recordKind ? { entityType: ENTITY_TYPE_OF_RECORD_KIND[input.recordKind] } : {}),
          ...(row.matchReason ? { matchReason: humanizeEnumTokensInCopy(row.matchReason) } : {}),
          ...(row.actions && row.actions.length > 0 ? { actions: row.actions.map((action) => ({ ...action })) } : {}),
          ...rowBadge(row),
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
      listDensity: 'DENSE',
      sections: [{
        id: `${receipt.answerVariantId}-unconfirmed-section`,
        title: humanizeEnumTokensInCopy(input.unconfirmedTitle ?? 'Needs confirmation'),
        count: input.unconfirmedRows.length,
        items: input.unconfirmedRows.map((row) => ({
          id: row.id,
          title: humanizeEnumTokensInCopy(row.label),
          meta: [...(row.meta ?? [])].map(humanizeEnumTokensInCopy),
          // The block contract has no `subtitle`: a field it does not know is stripped on parse and never reaches the homeowner. A row's secondary line is its `description`.
          description: rowSecondaryLine(row),
          ...(row.status ? { status: row.status } : {}),
          ...(row.entityType ? { entityType: row.entityType } : {}),
          ...rowBadge(row),
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
    const unknown = receipt.population.unknownCount;
    const conflicted = receipt.population.conflictedCount;
    const noun = isWarranty ? { one: 'item', many: 'items' } : { one: 'record', many: 'records' };
    const sentences = [
      unknown > 0 ? `${unknown} ${unknown === 1 ? noun.one : noun.many} could not be confirmed` : null,
      conflicted > 0 ? `${conflicted} ${conflicted === 1 ? `${noun.one} has` : `${noun.many} have`} conflicting information` : null,
    ].filter((part): part is string => part !== null);
    // One calm line, no instruction the homeowner cannot act on from here. The records themselves are in the "Needs confirmation" list when the answer has one.
    blocks.push({
      type: 'BOUNDARY',
      id: `${receipt.answerVariantId}-boundary`,
      title: isWarranty ? 'Warranty linkage requires confirmation' : 'Not counted',
      body: `${sentences.join(', and ')}, so ${unknown + conflicted === 1 ? 'it isn’t' : 'they aren’t'} counted either way.`,
      severity: conflicted > 0 ? 'CAUTION' : 'INFO',
      suggestions: [],
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

  // An analysis is one result, not a collection: its summary is the displayed result, so there are no rows to count.
  const isAnalysis = summary?.type === 'SUMMARY' && summary.presentationFamily === 'ANALYSIS';
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

  if (!isAnalysis && receipt.projection !== 'COUNT' && renderedItems.length !== receipt.population.displayedCount) {
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
    if (!isAnalysis && !receipt.population.truncated && receipt.projection !== 'COUNT') {
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
