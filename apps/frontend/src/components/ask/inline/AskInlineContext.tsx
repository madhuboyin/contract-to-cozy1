'use client';

import { createContext, useContext } from 'react';
import type { AskWorkspaceHrefInput } from '@/lib/navigation/askNavigation';

/** The one structured block that stays: the export review is a confirm-before-create form, not a collection to browse. */
export type AskInlineViewKind = 'export';

export interface AskInlineViewRequest {
  kind: AskInlineViewKind;
}

/**
 * What the parts of an Ask conversation need to act without leaving it: ask a question as the next turn (with the operation and record a
 * result declares, when it declares them), open the export review as a block, or bring another conversation's execution into view.
 * Provided by AskWorkspace.
 */
export interface AskInlineApi {
  /** Sends the launch's question (with its declared operation and record, when it has one) as the next turn of this conversation. */
  launch: (input: AskWorkspaceHrefInput) => void;
  /** Opens an existing conversation's execution in place of this transcript. Resolves false when it could not be opened. */
  openExecution: (sessionId: string, executionId: string) => Promise<boolean>;
  openView: (request: AskInlineViewRequest) => void;
}

export const AskInlineContext = createContext<AskInlineApi | null>(null);

export function useAskInline(): AskInlineApi | null {
  return useContext(AskInlineContext);
}
