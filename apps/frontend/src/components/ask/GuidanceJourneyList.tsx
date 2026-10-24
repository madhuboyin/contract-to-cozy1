'use client';

import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { GUIDANCE_JOURNEY_WORKSPACE_ID, GuidanceJourneyWorkspace } from './GuidanceJourneyWorkspace';
import type { AskBlockRendererProps } from './blocks/types';

// The guided-journey list opens a journey in the same card (no second conversational turn): the same read the "Open journey" action used to start is
// requested without presenting it in the conversation, shown here with a Back control, and kept as the result's presentation state (the same detail
// target other result lists use), so a reload shows the journey the homeowner last opened. Every open and every reload is re-read from the server, so a
// journey that was dismissed, suppressed or removed since is never shown from memory: the list returns with a short explanation instead.

export const GUIDANCE_JOURNEY_LIST_ID = 'guidance-journeys-items';
const CONTINUE_OPERATION_ID = 'GUIDANCE_JOURNEY_CONTINUE';
const OPEN_FAILED = 'That journey could not be opened right now. Your journeys are listed below.';

type Props = AskBlockRendererProps<Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>>;
type Opened = { workspace: Extract<AskPresentationBlock, { type: 'TASK_GUIDE' }>; boundary: string | null };

/** The workspace of an opened journey, or the plain reason it is not available (what the server said, never a guess). */
function readJourney(execution: AskExecutionResponse | void): { opened: Opened } | { unavailable: string } {
  if (!execution) return { unavailable: OPEN_FAILED };
  const workspace = execution.blocks.find((block): block is Extract<AskPresentationBlock, { type: 'TASK_GUIDE' }> => block.type === 'TASK_GUIDE' && block.id === GUIDANCE_JOURNEY_WORKSPACE_ID);
  if (workspace) {
    const boundary = execution.blocks.find((block) => block.type === 'BOUNDARY');
    return { opened: { workspace, boundary: boundary?.type === 'BOUNDARY' ? boundary.body : null } };
  }
  const first = execution.blocks.find((block) => block.type === 'SUMMARY' || block.type === 'EMPTY_STATE');
  const text = first?.type === 'SUMMARY' ? `${first.title}.` : first?.type === 'EMPTY_STATE' ? `${first.title}.` : OPEN_FAILED;
  return { unavailable: `${text} Your journeys are listed below.` };
}

function OpenedJourney({ journeyId, refreshKey, props, onBack, onUnavailable }: {
  journeyId: string; refreshKey: unknown; props: Props; onBack: () => void; onUnavailable: (reason: string) => void;
}) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const request = useRef(0);
  // The workspace recreates its action handler on every render; the read must not restart because of that.
  const onItemActionRef = useRef(props.onItemAction);
  onItemActionRef.current = props.onItemAction;
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;
  useEffect(() => {
    const mine = ++request.current;
    void (async () => {
      let read: ReturnType<typeof readJourney>;
      try {
        read = readJourney(await onItemActionRef.current('GUIDANCE_JOURNEY', journeyId, 'Continue this guided journey.', CONTINUE_OPERATION_ID, 'CONVERSATION_CONTINUE', undefined, undefined, 'WORKSPACE'));
      } catch {
        read = { unavailable: OPEN_FAILED };
      }
      if (mine !== request.current) return;
      if ('opened' in read) setOpened(read.opened);
      else onUnavailableRef.current(read.unavailable);
    })();
    return () => { request.current += 1; };
  // A refreshed list (a step was recorded, skipped or the journey dismissed) is a new block: read the journey again.
  }, [journeyId, refreshKey]);
  return (
    <div data-guidance-journey-open={journeyId} className="space-y-3">
      <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />All journeys
      </button>
      {!opened && <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Opening this journey…</p>}
      {opened && <GuidanceJourneyWorkspace block={opened.workspace} />}
      {opened?.boundary && <p className="max-w-[1000px] rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{opened.boundary}</p>}
    </div>
  );
}

export function GuidanceJourneyListView({ props, renderList }: { props: Props; renderList: (onItemAction: Props['onItemAction']) => ReactNode }) {
  const controls = useContext(ResultViewContext);
  const [notice, setNotice] = useState<string | null>(null);
  const detailId = controls?.detailIdFor(props.block.id) ?? null;
  // Where the view state is not kept (no result controls), the original behaviour stands: the read opens as its own turn.
  if (!controls) return <>{renderList(props.onItemAction)}</>;
  const open: Props['onItemAction'] = (entityType, entityId, message, operationId, interactionType, ...rest) => {
    if (operationId !== CONTINUE_OPERATION_ID) return props.onItemAction(entityType, entityId, message, operationId, interactionType, ...rest);
    setNotice(null);
    controls.openDetail(props.block.id, entityId);
    return undefined;
  };
  if (detailId) {
    return (
      <OpenedJourney
        journeyId={detailId} refreshKey={props.block} props={props} onBack={controls.closeDetail}
        // Clearing the target directly (not closeDetail) because a reload has no history entry of ours to go back to.
        onUnavailable={(reason) => { setNotice(reason); controls.change((view) => ({ ...view, detailTarget: null, detailTaskId: null })); }}
      />
    );
  }
  return <>
    {notice && <p role="status" className="mb-2 max-w-[1000px] rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{notice}</p>}
    {renderList(open)}
  </>;
}
