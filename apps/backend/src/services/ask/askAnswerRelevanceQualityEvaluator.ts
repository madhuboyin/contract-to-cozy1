import type { AskOperationId } from './askOperationRegistry';
import { validateAskSemanticAnswerRelevance } from './askSemanticAnswerValidator';

export interface AskAnswerRelevanceFixture {
  operationId: AskOperationId;
  answerOperationId?: AskOperationId;
  message: string;
  answer: string;
}

export interface AskAnswerRelevanceQualityReport {
  schemaVersion: '1.0';
  generatedAt: string;
  samples: number;
  passed: number;
  failed: number;
  unknown: number;
  passRate: number | null;
  byOperation: Array<{ operationId: AskOperationId; samples: number; passed: number; failed: number; unknown: number }>;
}

export function evaluateAskAnswerRelevanceQuality(
  fixtures: readonly AskAnswerRelevanceFixture[],
  generatedAt = new Date().toISOString(),
): AskAnswerRelevanceQualityReport {
  const rows = fixtures.map((fixture) => ({
    fixture,
    result: validateAskSemanticAnswerRelevance({
      question: fixture.message,
      operationId: fixture.operationId,
      result: {
        status: 'ANSWERED', suggestions: [],
        blocks: [{ type: 'SUMMARY', id: 'certified-direct-answer', title: 'Direct answer', body: fixture.answer, tone: 'DEFAULT', actions: [] }],
        parameters: fixture.answerOperationId ? {
          answerTrustEvidence: {
            schemaVersion: '1.0',
            sources: [{ sourceId: 'certification-fixture', operationId: fixture.answerOperationId, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-08-15T00:00:00.000Z' }],
          },
        } : undefined,
      },
    }),
  }));
  const byOperation = [...new Set(rows.map(({ fixture }) => fixture.operationId))].sort().map((operationId) => {
    const operationRows = rows.filter(({ fixture }) => fixture.operationId === operationId);
    return {
      operationId, samples: operationRows.length,
      passed: operationRows.filter(({ result }) => result.outcome === 'PASS').length,
      failed: operationRows.filter(({ result }) => result.outcome === 'FAIL').length,
      unknown: operationRows.filter(({ result }) => result.outcome === 'UNKNOWN').length,
    };
  });
  const passed = rows.filter(({ result }) => result.outcome === 'PASS').length;
  const failed = rows.filter(({ result }) => result.outcome === 'FAIL').length;
  const unknown = rows.filter(({ result }) => result.outcome === 'UNKNOWN').length;
  return {
    schemaVersion: '1.0', generatedAt, samples: rows.length, passed, failed, unknown,
    passRate: rows.length ? Number((passed / rows.length).toFixed(4)) : null,
    byOperation,
  };
}
