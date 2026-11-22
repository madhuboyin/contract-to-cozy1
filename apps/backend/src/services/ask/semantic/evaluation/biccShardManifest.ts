// BICC-EVAL-002 / EVAL-003 / EVAL-013 (FRD §6.1): the rotating sealed held-out pool.
//
//  - tuning and certification prompts are versioned separately;
//  - a shard that was revealed for diagnosis or used to change behaviour is BURNED and becomes tuning evidence;
//  - near-duplicate and template-family overlap with tuning prompts disqualifies a certification prompt;
//  - every report discloses pool size, shards used, burn rate, replenishment and remaining eligible coverage.
//
// Pure functions over plain data; the manifest itself is a versioned file maintained by the evaluation owner.

export type ShardRole = 'TUNING' | 'CERTIFICATION';
export type ShardStatus = 'SEALED' | 'BURNED';

export interface ShardPrompt {
  id: string;
  text: string;
  /** The template or generation family; rephrasings of one family are not independent evidence. */
  templateFamily: string;
  authoredBy: string;
  /** A different person (or process) from the author. */
  reviewedBy: string | null;
  strata?: Record<string, string>;
}

export interface EvaluationShard {
  id: string;
  role: ShardRole;
  status: ShardStatus;
  prompts: ShardPrompt[];
  /** Set the moment a shard's prompts were shown for diagnosis or used to change behaviour. */
  revealedAt?: string | null;
  burnedAt?: string | null;
  burnReason?: string | null;
  replenishes?: string | null;
  /** The role the shard held before it was burned (a burned shard is tuning evidence from then on). */
  originalRole?: ShardRole;
}

export interface ShardManifest {
  version: string;
  shards: EvaluationShard[];
  sampleFloors: { minEligiblePrompts: number; minSealedShards: number };
}

const STOP = new Set(['a', 'an', 'the', 'my', 'our', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'i', 'me', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'please', 'can', 'you', 'tell', 'cozy', 'hey']);

export function normalizedTokens(text: string): string[] {
  return text.toLowerCase().normalize('NFKC').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((token) => token && !STOP.has(token));
}

/** Jaccard similarity of the normalised token sets: robust to polite prefixes/suffixes and word order. */
export function promptSimilarity(a: string, b: string): number {
  const left = new Set(normalizedTokens(a));
  const right = new Set(normalizedTokens(b));
  if (!left.size && !right.size) return 1;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

export const NEAR_DUPLICATE_THRESHOLD = 0.8;

export function validateShardManifest(manifest: ShardManifest): string[] {
  const issues: string[] = [];
  const shardIds = new Set<string>();
  const promptIds = new Set<string>();
  const tuning = manifest.shards.filter((shard) => shard.role === 'TUNING').flatMap((shard) => shard.prompts);
  const tuningFamilies = new Set(tuning.map((prompt) => prompt.templateFamily));
  for (const shard of manifest.shards) {
    if (shardIds.has(shard.id)) issues.push(`Shard ${shard.id}: duplicate id.`);
    shardIds.add(shard.id);
    if (shard.role === 'CERTIFICATION' && shard.status === 'SEALED' && shard.revealedAt) issues.push(`Shard ${shard.id}: revealed at ${shard.revealedAt} but still SEALED; a revealed shard is burned (EVAL-002).`);
    if (shard.status === 'BURNED' && (!shard.burnedAt || !shard.burnReason)) issues.push(`Shard ${shard.id}: a burned shard records when and why.`);
    if (shard.status === 'BURNED' && shard.role === 'CERTIFICATION') issues.push(`Shard ${shard.id}: a burned shard becomes TUNING evidence and cannot stay a certification shard.`);
    for (const prompt of shard.prompts) {
      if (promptIds.has(prompt.id)) issues.push(`Prompt ${prompt.id}: duplicated across shards.`);
      promptIds.add(prompt.id);
      if (shard.role !== 'CERTIFICATION') continue;
      if (!prompt.reviewedBy || prompt.reviewedBy === prompt.authoredBy) issues.push(`Prompt ${prompt.id}: certification prompts need an independent reviewer.`);
      if (tuningFamilies.has(prompt.templateFamily)) issues.push(`Prompt ${prompt.id}: template family "${prompt.templateFamily}" also appears in tuning (EVAL-003).`);
      const twin = tuning.find((candidate) => promptSimilarity(candidate.text, prompt.text) >= NEAR_DUPLICATE_THRESHOLD);
      if (twin) issues.push(`Prompt ${prompt.id}: near-duplicate of tuning prompt ${twin.id} (EVAL-003).`);
    }
  }
  return issues;
}

/** Returns a new manifest in which `shardId` is burned and its prompts are tuning evidence. */
export function burnShard(manifest: ShardManifest, shardId: string, reason: string, at: string): ShardManifest {
  if (!manifest.shards.some((shard) => shard.id === shardId)) throw new Error(`Unknown shard ${shardId}.`);
  return {
    ...manifest,
    shards: manifest.shards.map((shard) => shard.id === shardId
      ? { ...shard, originalRole: shard.originalRole ?? shard.role, role: 'TUNING' as const, status: 'BURNED' as const, revealedAt: shard.revealedAt ?? at, burnedAt: at, burnReason: reason }
      : shard),
  };
}

export interface PoolDisclosure {
  poolSize: number;
  certificationShards: number;
  sealedShards: number;
  burnedShards: number;
  burnRate: number | null;
  replenishedShards: number;
  eligiblePrompts: number;
  eligibleShardIds: string[];
  meetsFloors: boolean;
  floorFailures: string[];
}

/** What every certification report must disclose about the pool it drew from (EVAL-002). */
export function disclosePool(manifest: ShardManifest): PoolDisclosure {
  const everCertification = manifest.shards.filter((shard) => shard.role === 'CERTIFICATION' || shard.originalRole === 'CERTIFICATION');
  const sealed = manifest.shards.filter((shard) => shard.role === 'CERTIFICATION' && shard.status === 'SEALED');
  const burned = everCertification.filter((shard) => shard.status === 'BURNED');
  const eligiblePrompts = sealed.reduce((sum, shard) => sum + shard.prompts.length, 0);
  const failures: string[] = [];
  if (eligiblePrompts < manifest.sampleFloors.minEligiblePrompts) failures.push(`Only ${eligiblePrompts} eligible prompts remain; the floor is ${manifest.sampleFloors.minEligiblePrompts}.`);
  if (sealed.length < manifest.sampleFloors.minSealedShards) failures.push(`Only ${sealed.length} sealed shards remain; the floor is ${manifest.sampleFloors.minSealedShards}.`);
  const total = sealed.length + burned.length;
  return {
    poolSize: manifest.shards.reduce((sum, shard) => sum + shard.prompts.length, 0),
    certificationShards: everCertification.length,
    sealedShards: sealed.length,
    burnedShards: burned.length,
    burnRate: total ? burned.length / total : null,
    replenishedShards: manifest.shards.filter((shard) => shard.replenishes).length,
    eligiblePrompts,
    eligibleShardIds: sealed.map((shard) => shard.id),
    meetsFloors: failures.length === 0,
    floorFailures: failures,
  };
}

/** A result may count toward certification only when its shard is sealed and certification-role. */
export function isCertificationEligible(manifest: ShardManifest, shardId: string): boolean {
  const shard = manifest.shards.find((item) => item.id === shardId);
  return Boolean(shard && shard.role === 'CERTIFICATION' && shard.status === 'SEALED' && !shard.revealedAt);
}
