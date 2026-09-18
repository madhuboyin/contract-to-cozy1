'use client';

import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { getRoomInsights, type RoomInsightsDTO } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import type { AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { cn } from '@/lib/utils';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = Block['sections'][number]['items'][number];

function errorStatus(error: unknown): number | null {
  return error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number'
    ? (error as { status: number }).status
    : null;
}

function errorCode(error: unknown): string | null {
  const payload = error && typeof error === 'object' ? (error as { payload?: unknown }).payload : null;
  const code = payload && typeof payload === 'object' ? (payload as { error?: { code?: unknown } }).error?.code : null;
  return typeof code === 'string' ? code : null;
}

function label(value: string | null | undefined): string {
  return value ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()) : 'Not recorded';
}

function currencyFromCents(value: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value / 100);
}

function RoomDetail({ roomId, expectedPropertyId, fallbackItem, onAccessLost, onClose }: {
  roomId: string;
  expectedPropertyId?: string;
  fallbackItem: Item;
  onAccessLost: () => void;
  onClose: () => void;
}) {
  const [room, setRoom] = useState<RoomInsightsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'ROOM_NOT_FOUND' | 'REVALIDATION_FAILED' | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const callbacksRef = useRef({ onAccessLost });
  callbacksRef.current = { onAccessLost };

  useEffect(() => {
    if (!expectedPropertyId) {
      setLoading(false);
      setError('REVALIDATION_FAILED');
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    setRoom(null);
    getRoomInsights(expectedPropertyId, roomId)
      .then((result) => { if (active) setRoom(result); })
      .catch((caught) => {
        if (!active) return;
        const status = errorStatus(caught);
        const code = errorCode(caught);
        if (status === 401 || status === 403 || (status === 404 && code !== 'ROOM_NOT_FOUND')) {
          callbacksRef.current.onAccessLost();
          return;
        }
        setError(status === 404 ? 'ROOM_NOT_FOUND' : 'REVALIDATION_FAILED');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [expectedPropertyId, roomId]);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  return <aside className="border-t border-teal-100 bg-teal-50/40 p-4" aria-labelledby={`room-detail-${roomId}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Room detail</p>
        <h4 ref={headingRef} tabIndex={-1} id={`room-detail-${roomId}`} className="mt-1 text-lg font-semibold text-slate-950 outline-none">{room?.room.name ?? fallbackItem.title}</h4>
      </div>
      <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close room detail for ${fallbackItem.title}`}><X className="h-4 w-4" /></button>
    </div>
    {loading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading the current room…</p>}
    {error && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3" role="alert">
      <p className="text-sm font-semibold text-amber-900">{error === 'ROOM_NOT_FOUND' ? 'Room no longer exists' : 'Could not verify the current room'}</p>
      <p className="mt-1 text-sm text-slate-700">{error === 'ROOM_NOT_FOUND' ? 'This room was removed after the Ask result was created.' : 'The current canonical room record could not be loaded.'}</p>
      <p className="mt-2 text-xs text-slate-500">The conversation remains available. Refresh this Ask result to reconcile with your home record.</p>
    </div>}
    {room && <>
      <dl className="mt-4 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-xs text-slate-500">Room type</dt><dd className="mt-0.5 font-medium text-slate-900">{label(room.room.type)}</dd></div>
        <div><dt className="text-xs text-slate-500">Recorded items</dt><dd className="mt-0.5 font-medium text-slate-900">{room.stats.itemCount}</dd></div>
        <div><dt className="text-xs text-slate-500">Appliances</dt><dd className="mt-0.5 font-medium text-slate-900">{room.stats.appliancesCount}</dd></div>
        <div><dt className="text-xs text-slate-500">Linked documents</dt><dd className="mt-0.5 font-medium text-slate-900">{room.stats.docsLinkedCount}</dd></div>
        <div><dt className="text-xs text-slate-500">Coverage gaps</dt><dd className="mt-0.5 font-medium text-slate-900">{room.stats.coverageGapsCount}</dd></div>
        <div><dt className="text-xs text-slate-500">Recorded replacement value</dt><dd className="mt-0.5 font-medium text-slate-900">{currencyFromCents(room.stats.replacementTotalCents)}</dd></div>
        <div><dt className="text-xs text-slate-500">Room health</dt><dd className="mt-0.5 font-medium text-slate-900">{room.healthScore.score == null ? room.healthScore.label : `${room.healthScore.label} · ${room.healthScore.score}/100`}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-slate-500">Current canonical room record and room-level inventory analysis.</p>
    </>}
  </aside>;
}

export function RoomResultList({ block, propertyId, onAccessLost, link }: {
  block: Block;
  propertyId?: string;
  onAccessLost: () => void;
  link: (href: string, label: ReactNode) => ReactNode;
}) {
  const controls = useContext(ResultViewContext);
  const [localDetailRoomId, setLocalDetailRoomId] = useState<string | null>(null);
  const detailRoomId = controls?.view.detailTaskId ?? localDetailRoomId;
  const detailItem = block.sections.flatMap((section) => section.items).find((item) => item.id === detailRoomId);
  const openDetail = (item: Item) => {
    if (controls) controls.change((view) => ({ ...view, selectedTaskId: item.id, detailTaskId: item.id }));
    else setLocalDetailRoomId(item.id);
  };
  const closeDetail = () => {
    const closingId = detailRoomId;
    if (controls) controls.change((view) => ({ ...view, detailTaskId: null }));
    else setLocalDetailRoomId(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-room-detail-trigger="${CSS.escape(closingId ?? '')}"]`)?.focus());
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
    </div>
    {block.sections.map((section) => <div key={section.id} className="border-b border-slate-100 p-4">
      <h4 className="font-semibold">{section.title} · {section.count}</h4>
      {section.items.length === 0 && <p className="mt-2 text-sm text-slate-500">No rooms are recorded yet.</p>}
      <ul className="mt-3 space-y-3">
        {section.items.map((item) => {
          const selected = controls?.view.selectedTaskId === item.id;
          return <li key={item.id} data-ask-task-id={item.id} tabIndex={-1} className={cn('rounded-xl border p-3 outline-offset-2', selected ? 'border-teal-600 bg-teal-50' : 'border-transparent bg-slate-50')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" data-room-detail-trigger={item.id} aria-expanded={detailRoomId === item.id} aria-controls={`room-detail-${item.id}`} onClick={() => openDetail(item)} className="min-h-10 text-left font-medium text-slate-950 underline-offset-4 hover:text-teal-800 hover:underline">{item.title}</button>
              {item.status && <span className="text-xs text-slate-600">{item.status.replace(/_/g, ' ')}</span>}
            </div>
            {item.meta.length > 0 && <p className="mt-1 text-xs text-slate-600">{item.meta.join(' · ')}</p>}
          </li>;
        })}
      </ul>
      {section.count > section.items.length && <p className="mt-3 text-sm text-slate-500">+{section.count - section.items.length} more rooms are available through the full Rooms collection.</p>}
    </div>)}
    {detailRoomId && detailItem && <RoomDetail key={detailRoomId} roomId={detailRoomId} expectedPropertyId={propertyId} fallbackItem={detailItem} onAccessLost={onAccessLost} onClose={closeDetail} />}
    <div className="flex flex-wrap gap-3 p-4 text-sm font-semibold text-teal-800">{block.actions.map((action) => action.href && <span key={action.id}>{link(action.href, <>{action.label}<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}</span>)}</div>
  </section>;
}
