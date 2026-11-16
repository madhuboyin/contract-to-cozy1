// Cross-domain semantic FRD FR-ONT-6 / §19 #5: schema-to-registry drift check.
//
// The entity and field registries are generated from Prisma (DMMF) plus reviewed overrides, and the runtime lexicon is
// generated from those registries. "Schema or catalogue changes that make a generated registry or lexicon stale shall fail
// conformance until regenerated and reviewed." This module produces a deterministic snapshot of that generated state and
// compares it with the committed snapshot, naming exactly what drifted so a reviewer can accept or fix the change.
//
// Pure apart from reading the generated registries: no database, no network.
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { ASK_CROSS_DOMAIN_SEMANTIC_LEXICON } from '../crossDomain/crossDomainPlanBuilder';
import { ASK_TRAVERSABLE_RELATION_PATH_MANIFEST } from './relationGovernanceBaseline';
import {
  ASK_SEMANTIC_DOMAINS,
  buildSemanticEntityRegistry,
  buildSemanticFieldRegistry,
} from './semanticOntologyBaseline';

export const ASK_REGISTRY_DRIFT_SNAPSHOT_VERSION = 'registry-drift-1.0.0' as const;

export interface RegistryDriftEntityEntry {
  readonly prismaModel: string;
  readonly domainId: string;
  readonly supportedFieldIds: readonly string[];
  readonly supportedRelationIds: readonly string[];
  /** Every scalar/enum column the Prisma model currently has, so a column added or removed behind a registered entity is visible. */
  readonly schemaColumns: readonly string[];
}

export interface RegistryDriftFieldEntry {
  readonly prismaModel: string;
  readonly storageColumn: string;
  readonly prismaType: string;
  readonly nullableInSchema: boolean;
  readonly valueFamily: string;
  readonly enumVocabulary: readonly string[] | null;
  readonly audienceFloor: string;
}

export interface RegistryDriftSnapshot {
  readonly snapshotVersion: typeof ASK_REGISTRY_DRIFT_SNAPSHOT_VERSION;
  readonly domains: readonly string[];
  readonly entities: Readonly<Record<string, RegistryDriftEntityEntry>>;
  readonly fields: Readonly<Record<string, RegistryDriftFieldEntry>>;
  readonly relationPaths: readonly string[];
  readonly lexicon: { readonly lexemeCount: number; readonly digest: string };
  /** Digest over everything above, so a one-line comparison answers "has anything changed". */
  readonly digest: string;
}

export type RegistryDriftKind =
  | 'ENTITY_ADDED' | 'ENTITY_REMOVED' | 'ENTITY_CHANGED'
  | 'FIELD_ADDED' | 'FIELD_REMOVED' | 'FIELD_CHANGED'
  | 'DOMAIN_SET_CHANGED' | 'RELATION_PATHS_CHANGED' | 'LEXICON_CHANGED' | 'SNAPSHOT_VERSION_CHANGED';

export interface RegistryDriftFinding {
  readonly kind: RegistryDriftKind;
  readonly subject: string;
  readonly detail: string;
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Key-sorted JSON, so the digest never depends on declaration order. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sorted<T extends string>(values: readonly T[]): T[] {
  return [...values].sort();
}

export function buildRegistryDriftSnapshot(): RegistryDriftSnapshot {
  const modelsByName = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));

  const entities: Record<string, RegistryDriftEntityEntry> = {};
  for (const entity of buildSemanticEntityRegistry()) {
    const model = modelsByName.get(entity.prismaModel);
    entities[entity.entityId] = {
      prismaModel: entity.prismaModel,
      domainId: entity.domainId,
      supportedFieldIds: sorted(entity.supportedFieldIds),
      supportedRelationIds: sorted(entity.supportedRelationIds),
      schemaColumns: sorted((model?.fields ?? []).filter((field) => field.kind === 'scalar' || field.kind === 'enum').map((field) => `${field.name}:${field.type}${field.isRequired ? '' : '?'}`)),
    };
  }

  const fields: Record<string, RegistryDriftFieldEntry> = {};
  for (const field of buildSemanticFieldRegistry()) {
    fields[field.fieldId] = {
      prismaModel: field.prismaModel,
      storageColumn: field.storageColumn,
      prismaType: field.prismaType,
      nullableInSchema: field.nullableInSchema,
      valueFamily: field.valueFamily,
      enumVocabulary: field.enumVocabulary ? sorted(field.enumVocabulary) : null,
      audienceFloor: field.audienceFloor,
    };
  }

  const lexemeLines = ASK_CROSS_DOMAIN_SEMANTIC_LEXICON
    .map((lexeme) => `${lexeme.role}|${lexeme.semanticId}|${lexeme.phrase}|${lexeme.lineage}`)
    .sort();

  const body = {
    snapshotVersion: ASK_REGISTRY_DRIFT_SNAPSHOT_VERSION,
    domains: sorted(ASK_SEMANTIC_DOMAINS.map((domain) => domain.domainId)),
    entities,
    fields,
    relationPaths: sorted(ASK_TRAVERSABLE_RELATION_PATH_MANIFEST.map((path) => path.pathId)),
    lexicon: { lexemeCount: lexemeLines.length, digest: sha256(lexemeLines.join('\n')) },
  };
  return { ...body, digest: sha256(stableStringify(body)) };
}

function changedKeys(a: object, b: object): string[] {
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  return Object.keys({ ...left, ...right }).filter((key) => stableStringify(left[key]) !== stableStringify(right[key]));
}

/** Compares the committed snapshot with the live generated state and names every difference. Empty means no drift. */
export function compareRegistryDrift(committed: RegistryDriftSnapshot, live: RegistryDriftSnapshot): RegistryDriftFinding[] {
  const findings: RegistryDriftFinding[] = [];
  if (committed.snapshotVersion !== live.snapshotVersion) {
    findings.push({ kind: 'SNAPSHOT_VERSION_CHANGED', subject: 'snapshot', detail: `${committed.snapshotVersion} -> ${live.snapshotVersion}` });
  }
  if (stableStringify(committed.domains) !== stableStringify(live.domains)) {
    findings.push({ kind: 'DOMAIN_SET_CHANGED', subject: 'domains', detail: `${committed.domains.length} -> ${live.domains.length} domains` });
  }

  const compareMap = <T extends object>(
    committedMap: Readonly<Record<string, T>>,
    liveMap: Readonly<Record<string, T>>,
    kinds: { added: RegistryDriftKind; removed: RegistryDriftKind; changed: RegistryDriftKind },
  ) => {
    for (const id of Object.keys(liveMap).sort()) {
      if (!(id in committedMap)) findings.push({ kind: kinds.added, subject: id, detail: 'present in the generated registry, absent from the committed snapshot' });
      else {
        const diff = changedKeys(committedMap[id], liveMap[id]);
        if (diff.length > 0) findings.push({ kind: kinds.changed, subject: id, detail: `changed: ${diff.join(', ')}` });
      }
    }
    for (const id of Object.keys(committedMap).sort()) {
      if (!(id in liveMap)) findings.push({ kind: kinds.removed, subject: id, detail: 'present in the committed snapshot, absent from the generated registry' });
    }
  };
  compareMap(committed.entities, live.entities, { added: 'ENTITY_ADDED', removed: 'ENTITY_REMOVED', changed: 'ENTITY_CHANGED' });
  compareMap(committed.fields, live.fields, { added: 'FIELD_ADDED', removed: 'FIELD_REMOVED', changed: 'FIELD_CHANGED' });

  if (stableStringify(committed.relationPaths) !== stableStringify(live.relationPaths)) {
    findings.push({ kind: 'RELATION_PATHS_CHANGED', subject: 'relationPaths', detail: `${committed.relationPaths.length} -> ${live.relationPaths.length} bounded paths` });
  }
  if (committed.lexicon.digest !== live.lexicon.digest) {
    findings.push({ kind: 'LEXICON_CHANGED', subject: 'lexicon', detail: `${committed.lexicon.lexemeCount} -> ${live.lexicon.lexemeCount} lexemes (digest changed)` });
  }
  return findings;
}
