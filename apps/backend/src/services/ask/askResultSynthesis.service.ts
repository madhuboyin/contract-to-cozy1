import { z } from 'zod';
import { AskPresentationBlockSchema, type AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import { geminiService } from '../gemini.service';
import type { AskOperationId, AskOperationResult } from './askOperationRegistry';
import { minimizeAskQuestion } from './askPromptMinimization';
import { askRemoteGenerationCharactersTotal, askRemoteGenerationTotal } from '../../lib/metrics';

const SynthesisOutputSchema = z.object({ summary: z.string().trim().min(1).max(600) }).strict();

function resultOnlyBlock(block: AskPresentationBlock): unknown {
  switch (block.type) {
    case 'SUMMARY': return { type: block.type, title: block.title, body: block.body, tone: block.tone };
    case 'GROUPED_LIST': return { type: block.type, title: block.title, description: block.description, sections: block.sections.map((section) => ({ title: section.title, count: section.count, items: section.items.map((item) => ({ title: item.title, description: item.description, meta: item.meta, status: item.status })) })) };
    case 'TABLE': return { type: block.type, title: block.title, description: block.description, columns: block.columns, rows: block.rows.map((row) => row.values) };
    case 'CAPABILITY_LIST': return { type: block.type, title: block.title, capabilities: block.capabilities.map((item) => ({ label: item.label, description: item.description, expectedOutput: item.expectedOutput, readiness: item.readiness, readinessLabel: item.readinessLabel, readinessReasons: item.readinessReasons })) };
    case 'EVIDENCE': return { type: block.type, title: block.title, items: block.items };
    default: return null;
  }
}

function sanitizeResultValue(value: unknown): unknown {
  if (typeof value === 'string') return minimizeAskQuestion(value);
  if (Array.isArray(value)) return value.map(sanitizeResultValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeResultValue(item)]));
  return value;
}

export function buildAskResultSynthesisPayload(operationId: AskOperationId, blocks: AskPresentationBlock[]): string | null {
  const validated = blocks.map((block) => AskPresentationBlockSchema.parse(block));
  if (validated.some((block) => block.type === 'BOUNDARY' || block.type === 'MONITOR' || block.type === 'WORKFLOW_PROGRESS')) return null;
  const result = validated.map(resultOnlyBlock).filter(Boolean).map(sanitizeResultValue);
  if (!result.length) return null;
  const payload = JSON.stringify({ operationId, instruction: 'Write one concise homeowner-facing summary using only this validated result. Do not add advice, facts, numbers, dates, links, actions, or conclusions.', result });
  return payload.length <= 16_000 ? payload : null;
}

function numericalClaims(value: string): string[] {
  return value.match(/(?:\$\s*)?\d[\d,.]*(?:\s*%|\s*(?:days?|months?|years?))?/gi) ?? [];
}

export async function synthesizeAskResult(operationId: AskOperationId, result: AskOperationResult): Promise<AskOperationResult> {
  if (result.status !== 'ANSWERED' && result.status !== 'READY_WITH_LIMITATIONS') return result;
  const payload = buildAskResultSynthesisPayload(operationId, result.blocks);
  if (!payload) return result;
  askRemoteGenerationCharactersTotal.inc({ direction: 'input' }, payload.length);
  let output: z.infer<typeof SynthesisOutputSchema>;
  try {
    output = SynthesisOutputSchema.parse(await geminiService.synthesizeAskResult(payload));
    askRemoteGenerationCharactersTotal.inc({ direction: 'output' }, output.summary.length);
    askRemoteGenerationTotal.inc({ outcome: 'result_synthesis_success' });
  } catch (error) {
    askRemoteGenerationTotal.inc({ outcome: 'result_synthesis_failure' });
    throw error;
  }
  if (numericalClaims(output.summary).some((claim) => !payload.includes(claim))) throw new Error('Ask synthesis introduced an unsupported numerical claim.');
  const summaryIndex = result.blocks.findIndex((block) => block.type === 'SUMMARY');
  const blocks = [...result.blocks];
  if (summaryIndex >= 0) {
    const current = blocks[summaryIndex];
    if (current.type === 'SUMMARY') blocks[summaryIndex] = AskPresentationBlockSchema.parse({ ...current, body: output.summary });
  } else {
    blocks.unshift(AskPresentationBlockSchema.parse({ type: 'SUMMARY', id: 'result-synthesis', title: 'At a glance', body: output.summary, tone: 'DEFAULT', actions: [] }));
  }
  return { ...result, blocks };
}
