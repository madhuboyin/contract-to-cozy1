// Ask outcome report (P1, FRD v1.101): how often Ask answers, asks for clarification, or does not understand, and
// which questions land in the last two groups. Read-only over AskExecution; it changes no routing. It exists so new
// operations are chosen from real questions rather than guesses (the P1 "new ops for top unmatched questions" item
// depends on running it against production data, which this repository cannot do).

export type AskOutcomeRow = { status: string; reasonCode?: string | null; operationId?: string | null; message: string };

export type AskOutcomeReport = {
  total: number;
  byStatus: Array<{ status: string; count: number; rate: number }>;
  answeredRate: number;
  clarificationRate: number;
  unmatchedRate: number;
  topClarifications: Array<{ question: string; count: number; reasonCodes: string[] }>;
  topUnmatched: Array<{ question: string; count: number; reasonCodes: string[] }>;
  suppressedSingletons: number;
};

const ANSWERED = new Set(['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS', 'NEEDS_CONFIRMATION']);
const CLARIFICATION = new Set(['NEEDS_CLARIFICATION', 'NEEDS_ENTITY', 'NEEDS_CONTEXT']);

// Unmatched: out of scope, or no operation could be chosen and the answer was not a plain answer.
export const isUnmatchedOutcome = (row: AskOutcomeRow) => row.status === 'OUT_OF_SCOPE' || (!row.operationId && row.status === 'NEEDS_CLARIFICATION');

// A question is grouped by a normalised form: lower case, emails and digits masked, spaces collapsed. Question text is
// user-written, so the report never prints a wording that fewer than `minCount` people-turns produced.
export function normalizeAskQuestion(message: string): string {
  return message.toLowerCase().replace(/[^\s@]+@[^\s@]+/g, '<email>').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 160);
}

const rate = (count: number, total: number) => (total ? Math.round((count / total) * 1000) / 1000 : 0);

function topQuestions(rows: AskOutcomeRow[], minCount: number, limit: number) {
  const groups = new Map<string, { count: number; reasonCodes: Set<string> }>();
  for (const row of rows) {
    const key = normalizeAskQuestion(row.message);
    if (!key) continue;
    const group = groups.get(key) ?? { count: 0, reasonCodes: new Set<string>() };
    group.count += 1;
    if (row.reasonCode) group.reasonCodes.add(row.reasonCode);
    groups.set(key, group);
  }
  const all = [...groups.entries()].map(([question, g]) => ({ question, count: g.count, reasonCodes: [...g.reasonCodes].sort() }));
  const shown = all.filter((g) => g.count >= minCount).sort((a, b) => b.count - a.count || a.question.localeCompare(b.question)).slice(0, limit);
  return { shown, suppressed: all.length - all.filter((g) => g.count >= minCount).length };
}

export function buildAskOutcomeReport(rows: AskOutcomeRow[], options: { minCount?: number; limit?: number } = {}): AskOutcomeReport {
  const minCount = Math.max(1, options.minCount ?? 2);
  const limit = options.limit ?? 20;
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  const total = rows.length;
  const sum = (predicate: (status: string) => boolean) => [...counts.entries()].filter(([status]) => predicate(status)).reduce((n, [, c]) => n + c, 0);
  const unmatched = rows.filter(isUnmatchedOutcome);
  const clarifications = rows.filter((row) => CLARIFICATION.has(row.status) && !isUnmatchedOutcome(row));
  const topClar = topQuestions(clarifications, minCount, limit);
  const topUnm = topQuestions(unmatched, minCount, limit);
  return {
    total,
    byStatus: [...counts.entries()].map(([status, count]) => ({ status, count, rate: rate(count, total) })).sort((a, b) => b.count - a.count || a.status.localeCompare(b.status)),
    answeredRate: rate(sum((s) => ANSWERED.has(s)), total),
    clarificationRate: rate(sum((s) => CLARIFICATION.has(s)), total),
    unmatchedRate: rate(unmatched.length, total),
    topClarifications: topClar.shown,
    topUnmatched: topUnm.shown,
    suppressedSingletons: topClar.suppressed + topUnm.suppressed,
  };
}

// Loads the rows for the last `days` days (top-level turns only: child capture executions are not questions).
export async function loadAskOutcomeReport(db: { askExecution: { findMany: (args: any) => Promise<AskOutcomeRow[]> } }, options: { days?: number; now?: Date; minCount?: number; limit?: number } = {}) {
  const days = options.days ?? 28;
  const since = new Date((options.now ?? new Date()).getTime() - days * 24 * 60 * 60 * 1000);
  const rows = await db.askExecution.findMany({
    where: { createdAt: { gte: since }, parentExecutionId: null },
    select: { status: true, reasonCode: true, operationId: true, message: true },
    orderBy: { createdAt: 'desc' },
    take: 20000,
  });
  return { days, since, report: buildAskOutcomeReport(rows, options) };
}
