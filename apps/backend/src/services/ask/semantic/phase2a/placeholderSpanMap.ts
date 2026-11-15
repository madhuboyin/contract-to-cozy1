import { minimizeAskQuestion } from '../../askPromptMinimization';

export type PlaceholderKind = 'ITEM' | 'DATE' | 'MONEY' | 'SERIAL' | 'ROOM';

export interface DynamicPlaceholderEntityCandidate {
  readonly kind: 'ITEM' | 'ROOM';
  readonly entityId: string;
  readonly recordId: string;
  readonly names: readonly string[];
  readonly authorized: boolean;
  readonly safeDisplayLabel?: string;
}

export interface AuthorizedEntityCandidateBinding {
  readonly entityId: string;
  readonly recordId: string;
  readonly label: string;
}

export interface BuildSemanticTextEnvelopeOptions {
  readonly normalizedText?: string;
  readonly dynamicEntities?: readonly DynamicPlaceholderEntityCandidate[];
}

export interface IndexedTypedPlaceholder {
  readonly placeholder: string;
  readonly kind: PlaceholderKind;
  readonly index: number;
  readonly rawValue: string;
  readonly protectedValue: string;
  readonly rawSpan: { readonly start: number; readonly end: number };
  readonly protectedSpan: { readonly start: number; readonly end: number };
  readonly minimizedSpan: { readonly start: number; readonly end: number };
  readonly authorizedCandidate: AuthorizedEntityCandidateBinding | null;
}

export interface SpanMappingEntry {
  readonly placeholder: string;
  readonly kind: PlaceholderKind;
  readonly rawStart: number;
  readonly rawEnd: number;
  readonly protectedStart: number;
  readonly protectedEnd: number;
  readonly minimizedStart: number;
  readonly minimizedEnd: number;
  readonly authorizedCandidate: AuthorizedEntityCandidateBinding | null;
}

export interface SemanticTextEnvelope {
  readonly rawText: string;
  readonly normalizedText: string;
  readonly protectedText: string;
  readonly minimizedText: string;
  readonly placeholders: readonly IndexedTypedPlaceholder[];
  readonly spanMap: readonly SpanMappingEntry[];
}

export interface PlaceholderSpanRoundTripReport {
  readonly ok: boolean;
  readonly restoredProtectedText: string;
  readonly restoredMinimizedText: string;
  readonly reasons: readonly string[];
}

interface RawMatchCandidate {
  readonly kind: PlaceholderKind;
  readonly start: number;
  readonly end: number;
  readonly rawValue: string;
  readonly authorizedCandidate: AuthorizedEntityCandidateBinding | null;
}

const DEFAULT_ITEM_PHRASES = [
  'water heater',
  'hvac system',
  'electrical panel',
  'plumbing system',
  'refrigerator',
  'dishwasher',
  'furnace',
  'washer',
  'dryer',
  'fridge',
  'roof',
];

const DEFAULT_ROOM_PHRASES = [
  'living room',
  'dining room',
  'laundry room',
  'utility room',
  'kitchen',
  'basement',
  'garage',
  'attic',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectMatches(
  rawText: string,
  dynamicEntities: readonly DynamicPlaceholderEntityCandidate[] = []
): RawMatchCandidate[] {
  const candidates: RawMatchCandidate[] = [];

  const pushIfNonOverlapping = (candidate: RawMatchCandidate) => {
    const overlaps = candidates.some(
      (existing) => !(candidate.end <= existing.start || candidate.start >= existing.end)
    );
    if (!overlaps) {
      candidates.push(candidate);
    }
  };

  // 1. Serial numbers (e.g., SN-12345, SER-9981A)
  const serialRegex = /\b(?:SN|SER|S\/N)[-#:]?\s*[A-Z0-9-]{4,}\b/gi;
  for (const match of rawText.matchAll(serialRegex)) {
    if (match.index !== undefined) {
      pushIfNonOverlapping({
        kind: 'SERIAL',
        start: match.index,
        end: match.index + match[0].length,
        rawValue: match[0],
        authorizedCandidate: null,
      });
    }
  }

  // 2. Money values (e.g., $1,250.00, $450)
  const moneyRegex = /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\$\d+(?:\.\d{2})?/g;
  for (const match of rawText.matchAll(moneyRegex)) {
    if (match.index !== undefined) {
      pushIfNonOverlapping({
        kind: 'MONEY',
        start: match.index,
        end: match.index + match[0].length,
        rawValue: match[0],
        authorizedCandidate: null,
      });
    }
  }

  // 3. ISO dates or numeric dates (e.g., 2026-11-15, 11/15/2026)
  const dateRegex = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/g;
  for (const match of rawText.matchAll(dateRegex)) {
    if (match.index !== undefined) {
      pushIfNonOverlapping({
        kind: 'DATE',
        start: match.index,
        end: match.index + match[0].length,
        rawValue: match[0],
        authorizedCandidate: null,
      });
    }
  }

  // 4. Dynamic property-backed entity names (longest-first), attaching authorized candidate only when allowed
  const dynamicPhrases = dynamicEntities
    .flatMap((entity) =>
      entity.names
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
        .map((name) => ({
          kind: entity.kind,
          phrase: name,
          authorizedCandidate: entity.authorized
            ? {
                entityId: entity.entityId,
                recordId: entity.recordId,
                label: entity.safeDisplayLabel ?? name,
              }
            : null,
        }))
    )
    .sort((a, b) => b.phrase.length - a.phrase.length);

  for (const entry of dynamicPhrases) {
    const pattern = new RegExp(`\\b${escapeRegExp(entry.phrase)}\\b`, 'gi');
    for (const match of rawText.matchAll(pattern)) {
      if (match.index !== undefined) {
        pushIfNonOverlapping({
          kind: entry.kind,
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          authorizedCandidate: entry.authorizedCandidate,
        });
      }
    }
  }

  // 5. Fallback generic item & room phrases (never overwrite already-matched dynamic entities)
  const itemPattern = new RegExp(`\\b(${DEFAULT_ITEM_PHRASES.join('|')})\\b`, 'gi');
  for (const match of rawText.matchAll(itemPattern)) {
    if (match.index !== undefined) {
      pushIfNonOverlapping({
        kind: 'ITEM',
        start: match.index,
        end: match.index + match[0].length,
        rawValue: match[0],
        authorizedCandidate: null,
      });
    }
  }

  const roomPattern = new RegExp(`\\b(${DEFAULT_ROOM_PHRASES.join('|')})\\b`, 'gi');
  for (const match of rawText.matchAll(roomPattern)) {
    if (match.index !== undefined) {
      pushIfNonOverlapping({
        kind: 'ROOM',
        start: match.index,
        end: match.index + match[0].length,
        rawValue: match[0],
        authorizedCandidate: null,
      });
    }
  }

  return candidates.sort((a, b) => a.start - b.start);
}

/**
 * Builds an indexed typed placeholder envelope preserving raw, normalized,
 * protected, and minimized text along with bidirectional span mappings and
 * authorized entity candidate bindings (§19 #23 / FR-PLAN-3).
 */
export function buildSemanticTextEnvelope(
  rawText: string,
  options?: string | BuildSemanticTextEnvelopeOptions
): SemanticTextEnvelope {
  const normalizedArg = typeof options === 'string' ? options : options?.normalizedText;
  const dynamicEntities = typeof options === 'object' && options !== null ? (options.dynamicEntities ?? []) : [];

  const effectiveNormalized = normalizedArg
    ?? rawText.toLocaleLowerCase('en-US').replace(/[’]/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();

  const matches = collectMatches(rawText, dynamicEntities);
  const counters: Record<PlaceholderKind, number> = {
    ITEM: 0,
    DATE: 0,
    MONEY: 0,
    SERIAL: 0,
    ROOM: 0,
  };

  let protectedText = '';
  let cursor = 0;
  const provisional: Array<{
    placeholder: string;
    kind: PlaceholderKind;
    index: number;
    rawValue: string;
    rawSpan: { start: number; end: number };
    protectedSpan: { start: number; end: number };
    authorizedCandidate: AuthorizedEntityCandidateBinding | null;
  }> = [];

  for (const match of matches) {
    protectedText += rawText.slice(cursor, match.start);
    counters[match.kind] += 1;
    const index = counters[match.kind];
    const placeholder = `[${match.kind}_${index}]`;
    const protectedStart = protectedText.length;
    protectedText += placeholder;
    const protectedEnd = protectedText.length;
    provisional.push({
      placeholder,
      kind: match.kind,
      index,
      rawValue: match.rawValue,
      rawSpan: { start: match.start, end: match.end },
      protectedSpan: { start: protectedStart, end: protectedEnd },
      authorizedCandidate: match.authorizedCandidate,
    });
    cursor = match.end;
  }
  protectedText += rawText.slice(cursor);

  const minimizedText = minimizeAskQuestion(protectedText);
  const placeholders: IndexedTypedPlaceholder[] = [];
  const spanMap: SpanMappingEntry[] = [];

  let searchFrom = 0;
  for (const entry of provisional) {
    const minStart = minimizedText.indexOf(entry.placeholder, searchFrom);
    const effectiveMinStart = minStart >= 0 ? minStart : minimizedText.indexOf(entry.placeholder);
    const effectiveMinEnd = effectiveMinStart >= 0 ? effectiveMinStart + entry.placeholder.length : -1;
    if (effectiveMinStart >= 0) {
      searchFrom = effectiveMinEnd;
    }

    placeholders.push({
      placeholder: entry.placeholder,
      kind: entry.kind,
      index: entry.index,
      rawValue: entry.rawValue,
      protectedValue: entry.placeholder,
      rawSpan: entry.rawSpan,
      protectedSpan: entry.protectedSpan,
      minimizedSpan: { start: effectiveMinStart, end: effectiveMinEnd },
      authorizedCandidate: entry.authorizedCandidate,
    });

    spanMap.push({
      placeholder: entry.placeholder,
      kind: entry.kind,
      rawStart: entry.rawSpan.start,
      rawEnd: entry.rawSpan.end,
      protectedStart: entry.protectedSpan.start,
      protectedEnd: entry.protectedSpan.end,
      minimizedStart: effectiveMinStart,
      minimizedEnd: effectiveMinEnd,
      authorizedCandidate: entry.authorizedCandidate,
    });
  }

  return {
    rawText,
    normalizedText: effectiveNormalized,
    protectedText,
    minimizedText,
    placeholders,
    spanMap,
  };
}

/**
 * Restores indexed typed placeholders in protected or minimized text back to raw values.
 */
export function roundTripRestorePlaceholderSpans(
  textWithPlaceholders: string,
  envelope: SemanticTextEnvelope
): string {
  let restored = textWithPlaceholders;
  for (const entry of envelope.placeholders) {
    restored = restored.replace(entry.placeholder, entry.rawValue);
  }
  return restored;
}

/**
 * Verifies bidirectional round-trip consistency of raw <-> protected <-> minimized spans.
 */
export function verifyPlaceholderSpanMapRoundTrip(envelope: SemanticTextEnvelope): PlaceholderSpanRoundTripReport {
  const reasons: string[] = [];

  for (const entry of envelope.placeholders) {
    const rawSlice = envelope.rawText.slice(entry.rawSpan.start, entry.rawSpan.end);
    if (rawSlice !== entry.rawValue) {
      reasons.push(`raw_span_mismatch:${entry.placeholder}:${rawSlice}!=${entry.rawValue}`);
    }
    const protectedSlice = envelope.protectedText.slice(entry.protectedSpan.start, entry.protectedSpan.end);
    if (protectedSlice !== entry.placeholder) {
      reasons.push(`protected_span_mismatch:${entry.placeholder}:${protectedSlice}`);
    }
    if (entry.minimizedSpan.start < 0 || entry.minimizedSpan.end <= entry.minimizedSpan.start) {
      reasons.push(`minimized_span_missing:${entry.placeholder}`);
    } else {
      const minSlice = envelope.minimizedText.slice(entry.minimizedSpan.start, entry.minimizedSpan.end);
      if (minSlice !== entry.placeholder) {
        reasons.push(`minimized_span_mismatch:${entry.placeholder}:${minSlice}`);
      }
    }
  }

  const restoredProtectedText = roundTripRestorePlaceholderSpans(envelope.protectedText, envelope);
  if (restoredProtectedText !== envelope.rawText) {
    reasons.push('protected_round_trip_mismatch');
  }

  const restoredMinimizedText = roundTripRestorePlaceholderSpans(envelope.minimizedText, envelope);
  for (const entry of envelope.placeholders) {
    if (!restoredMinimizedText.includes(entry.rawValue)) {
      reasons.push(`minimized_round_trip_missing_value:${entry.placeholder}`);
    }
  }

  return {
    ok: reasons.length === 0,
    restoredProtectedText,
    restoredMinimizedText,
    reasons,
  };
}
