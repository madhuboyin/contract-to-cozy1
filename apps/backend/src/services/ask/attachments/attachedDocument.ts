// BICC-3.2 (deterministic slice): answers a question about a PDF attached to this conversation by quoting the matching passages with their page. No model reads the file and
// nothing is inferred: the passages are exact slices of the file's own text layer, found by the words of the question (MM-006, MM-012). Scope, owner and liveness are checked
// before the file is read and again before the answer is delivered (MM-004); reading never creates a record, a fact or an action (MM-003). A photo or a scanned PDF has no text
// layer, and the answer says so instead of guessing.
import { prisma } from '../../../lib/prisma';
import { resolvePropertyAccess } from '../../propertyAccess.service';
import { candidatePropertyService } from '../buyer/candidateProperty.service';
import type { AskOperationResult } from '../askOperationRegistry';
import type { AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { canRetrieve, deleteAfter as deleteAfterFor, attachmentScopeKey, type AttachmentState } from './attachmentLifecycle';
import { s3AttachmentObjectStore, type AttachmentObjectStore } from './attachmentObjectStore.s3';
import { extractPdfPages, type PdfText } from './pdfText';
import { findPassages, passagesFromPages } from './documentPassages';
import type { AttachedDocumentRequest } from '../support/attachedDocumentRequest';

export const ATTACHED_DOCUMENT_REASON = 'ASK_ATTACHED_DOCUMENT';
export const ATTACHED_DOCUMENT_LIMITED_REASON = 'ASK_ATTACHED_DOCUMENT_LIMITED';
const READ_TIMEOUT_MS = 20_000;

export interface AttachedDocumentDeps {
  objects?: Pick<AttachmentObjectStore, 'getRaw'>;
  extract?: (bytes: Buffer) => Promise<PdfText>;
  reachableScopes?: (userId: string) => Promise<ReadonlySet<string>>;
  now?: () => Date;
}

type Row = { id: string; userId: string; scopeKind: string; scopeId: string; state: string; originalFileName: string; detectedMimeType: string | null; analysisCompletedAt: Date | null; uploadedAt: Date; deleteAfter: Date };

const quote = (id: string, title: string, body: string, rows: Array<{ id: string; values: Record<string, string> }>): AskPresentationBlock[] => ([
  { type: 'SUMMARY', id: 'attached-document-summary', title, body, tone: 'DEFAULT', actions: [] },
  { type: 'TABLE', id, title: 'Exact text from the file', columns: [{ key: 'where', label: 'Where' }, { key: 'text', label: 'Exact text' }], rows },
] as unknown as AskPresentationBlock[]);

const limited = (title: string, body: string): AskOperationResult => ({
  status: 'READY_WITH_LIMITATIONS', reasonCode: ATTACHED_DOCUMENT_LIMITED_REASON, captureRequests: [], clarification: null, confirmation: null, suggestions: [], suggestedNextActions: [],
  suggestedNextActionsGoverned: true, suppressSkillHandoff: true,
  blocks: [{ type: 'EMPTY_STATE', id: 'attached-document-empty', title, body, actions: [] }] as unknown as AskPresentationBlock[],
});

async function defaultReachableScopes(userId: string, rows: readonly Row[]): Promise<ReadonlySet<string>> {
  const reachable = new Set<string>();
  for (const row of rows) {
    if (row.scopeKind === 'PROPERTY') { if (await resolvePropertyAccess(userId, row.scopeId)) reachable.add(attachmentScopeKey('PROPERTY', row.scopeId)); }
    else if (await candidatePropertyService.get(userId, row.scopeId)) reachable.add(attachmentScopeKey('CANDIDATE', row.scopeId));
  }
  return reachable;
}

const withTimeout = <T>(work: Promise<T>): Promise<T> => Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('The file took too long to read.')), READ_TIMEOUT_MS))]);

export async function attachedDocumentResult(input: { userId: string; sessionId: string; request: AttachedDocumentRequest }, deps: AttachedDocumentDeps = {}): Promise<AskOperationResult> {
  const now = (deps.now ?? (() => new Date()))();
  if (input.request.kind === 'SUMMARY') {
    return limited('I can find passages, not summarize', 'I do not summarize files. I can search the file you attached and quote the exact passages that mention something, with their page. Try “What does the PDF say about hail?” or “Find the deductible in the document.”');
  }
  const rows = (await prisma.askChatAttachment.findMany({
    where: { userId: input.userId, sessionId: input.sessionId, state: { in: ['READY', 'ANALYZED'] }, deleteAfter: { gt: now } }, orderBy: { uploadedAt: 'desc' }, take: 5,
  })) as unknown as Row[];
  if (!rows.length) return limited('No file in this conversation', 'There is no file attached to this conversation right now. Files are removed within a day. Use the photo and PDF button beside the message box to add one.');
  const reachable = await (deps.reachableScopes ? deps.reachableScopes(input.userId) : defaultReachableScopes(input.userId, rows));
  const usable = rows.find((row) => canRetrieve({ userId: row.userId, scopeKind: row.scopeKind === 'CANDIDATE' ? 'CANDIDATE' : 'PROPERTY', scopeId: row.scopeId, state: row.state as AttachmentState }, { userId: input.userId, reachableScopes: reachable }));
  if (!usable) return limited('That file is no longer available', 'You no longer have access to the home this file was added to, so I cannot read it.');
  if (usable.detectedMimeType !== 'application/pdf') {
    return limited('I can only read PDF text right now', `${usable.originalFileName} is a photo. Reading text in photos is not available yet, so I cannot answer from it. A PDF with selectable text works.`);
  }

  let pdf: PdfText;
  try {
    const bytes = await (deps.objects ?? s3AttachmentObjectStore).getRaw({ userId: usable.userId, scopeKind: usable.scopeKind === 'CANDIDATE' ? 'CANDIDATE' : 'PROPERTY', scopeId: usable.scopeId }, usable.id);
    pdf = await withTimeout((deps.extract ?? extractPdfPages)(bytes));
  } catch {
    return limited('I could not read that file', `I could not read ${usable.originalFileName}. It may be damaged or password protected. Try adding it again.`);
  }
  if (!pdf.pages.length) {
    return limited('This PDF has no text I can read', `${usable.originalFileName} has no selectable text, which usually means it is a scan or a photo of a page. Reading scanned pages is not available yet.`);
  }

  // MM-004: checked again before delivery. A file that was removed, expired or lost access while it was being read yields nothing.
  const still = (await prisma.askChatAttachment.findFirst({ where: { id: usable.id, userId: input.userId, state: { in: ['READY', 'ANALYZED'] }, deleteAfter: { gt: (deps.now ?? (() => new Date()))() } } })) as unknown as Row | null;
  if (!still) return limited('That file is no longer available', 'The file was removed while I was reading it, so I did not use it.');

  // Reading marks it analysed (and starts the 24 hours after analysis); it creates no record, fact or action (MM-003).
  if (still.state === 'READY') {
    const completed = (deps.now ?? (() => new Date()))();
    await prisma.askChatAttachment.updateMany({ where: { id: still.id, userId: input.userId, state: 'READY' }, data: { state: 'ANALYZED', analysisCompletedAt: completed, deleteAfter: deleteAfterFor({ state: 'ANALYZED', uploadedAt: still.uploadedAt, analysisCompletedAt: completed }) } });
  }

  const query = (input.request as { query: string }).query;
  const matches = findPassages(passagesFromPages(pdf.pages), query);
  const limits = `These are word matches copied exactly from ${usable.originalFileName}; I did not interpret them, and wording I did not match may also be in the file. Check anything important against the original.${pdf.truncated ? ` Only the first ${pdf.pages.length} pages with text were read.` : ''}`;
  if (!matches.length) {
    const result = limited(`Nothing about “${query.slice(0, 80)}” found`, `I did not find those words in ${usable.originalFileName}. The file may use different wording; try another word for it. ${limits}`);
    return result;
  }
  return {
    status: 'ANSWERED', reasonCode: ATTACHED_DOCUMENT_REASON, captureRequests: [], clarification: null, confirmation: null, suggestions: [], suggestedNextActions: [], suggestedNextActionsGoverned: true, suppressSkillHandoff: true,
    blocks: [
      ...quote('attached-document-passages', `${matches.length === 1 ? 'One passage' : `${matches.length} passages`} about “${query.slice(0, 80)}” in ${usable.originalFileName}`, 'Each passage is quoted exactly and names its page.',
        matches.map((m) => ({ id: m.id, values: { where: `Page ${m.page}, passage ${m.index}`, text: m.text } }))),
      { type: 'LIMITATION', id: 'attached-document-limits', title: 'What this is', body: limits, severity: 'INFO' },
    ] as unknown as AskPresentationBlock[],
  };
}
