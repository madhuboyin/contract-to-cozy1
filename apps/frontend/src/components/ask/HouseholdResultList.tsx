'use client';

import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import type { HouseholdMember } from '@/types';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = Block['sections'][number]['items'][number];

function errorStatus(error: unknown): number | null {
  return error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number'
    ? (error as { status: number }).status
    : null;
}

function label(value: string | null | undefined): string {
  return value ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()) : 'Not recorded';
}

// Unlike Inventory/Room/Document detail, the household members list endpoint
// has no per-member "not found" 404 -- a removed member is simply absent from
// the array, never an HTTP error. So any thrown error here is treated as
// access loss, and "no longer a member" is a data check, not a status check.
function HouseholdMemberDetail({ memberId, expectedPropertyId, fallbackItem, onAccessLost, onClose }: {
  memberId: string;
  expectedPropertyId?: string;
  fallbackItem: Item;
  onAccessLost: () => void;
  onClose: () => void;
}) {
  const [member, setMember] = useState<HouseholdMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const callbacksRef = useRef({ onAccessLost });
  callbacksRef.current = { onAccessLost };

  useEffect(() => {
    if (!expectedPropertyId) {
      setLoading(false);
      setError(true);
      return;
    }
    let active = true;
    setLoading(true);
    setError(false);
    setNotFound(false);
    setMember(null);
    api.listHouseholdMembers(expectedPropertyId)
      .then((members) => {
        if (!active) return;
        const match = members.find((candidate) => candidate.id === memberId);
        if (!match) { setNotFound(true); return; }
        setMember(match);
      })
      .catch((caught) => {
        if (!active) return;
        const status = errorStatus(caught);
        if (status === 401 || status === 403 || status === 404) {
          callbacksRef.current.onAccessLost();
          return;
        }
        setError(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [expectedPropertyId, memberId]);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  const displayName = member?.displayName?.trim() || (member ? `${member.user.firstName} ${member.user.lastName}`.trim() : '') || fallbackItem.title;

  return <aside className="border-t border-teal-100 bg-teal-50/40 p-4" aria-labelledby={`household-detail-${memberId}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Household member detail</p>
        <h4 ref={headingRef} tabIndex={-1} id={`household-detail-${memberId}`} className="mt-1 text-lg font-semibold text-slate-950 outline-none">{displayName}</h4>
      </div>
      <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close household member detail for ${fallbackItem.title}`}><X className="h-4 w-4" /></button>
    </div>
    {loading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading the current household record…</p>}
    {(notFound || error) && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3" role="alert">
      <p className="text-sm font-semibold text-amber-900">{notFound ? 'No longer a household member' : 'Could not verify the current member'}</p>
      <p className="mt-1 text-sm text-slate-700">{notFound ? 'This person is no longer part of this household.' : 'The current canonical household record could not be loaded.'}</p>
      <p className="mt-2 text-xs text-slate-500">The conversation remains available. Refresh this Ask result to reconcile with your household record.</p>
    </div>}
    {member && <>
      <dl className="mt-4 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-xs text-slate-500">Role</dt><dd className="mt-0.5 font-medium text-slate-900">{label(member.role)}</dd></div>
        <div><dt className="text-xs text-slate-500">Email</dt><dd className="mt-0.5 font-medium text-slate-900">{member.user.email}</dd></div>
        <div><dt className="text-xs text-slate-500">Primary owner</dt><dd className="mt-0.5 font-medium text-slate-900">{member.isPrimaryOwner ? 'Yes' : 'No'}</dd></div>
        <div><dt className="text-xs text-slate-500">Joined</dt><dd className="mt-0.5 font-medium text-slate-900">{new Date(member.joinedAt).toLocaleDateString()}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-slate-500">Current canonical household record.</p>
    </>}
  </aside>;
}

export function HouseholdResultList({ block, propertyId, onAccessLost, link }: {
  block: Block;
  propertyId?: string;
  onAccessLost: () => void;
  link: (href: string, label: ReactNode) => ReactNode;
}) {
  const controls = useContext(ResultViewContext);
  const [localDetailMemberId, setLocalDetailMemberId] = useState<string | null>(null);
  const detailMemberId = controls ? controls.detailIdFor(block.id) : localDetailMemberId;
  const detailItem = block.sections.flatMap((section) => section.items).find((item) => item.id === detailMemberId);
  const openDetail = (item: Item) => {
    if (controls) controls.openDetail(block.id, item.id);
    else setLocalDetailMemberId(item.id);
  };
  const closeDetail = () => {
    const closingId = detailMemberId;
    if (controls) controls.closeDetail();
    else setLocalDetailMemberId(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-household-detail-trigger="${CSS.escape(closingId ?? '')}"]`)?.focus());
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
    </div>
    {block.sections.map((section) => <div key={section.id} className="border-b border-slate-100 p-4">
      <h4 className="font-semibold">{section.title} · {section.count}</h4>
      {section.items.length === 0 && <p className="mt-2 text-sm text-slate-500">No household members are recorded yet.</p>}
      <ul className="mt-3 space-y-3">
        {section.items.map((item) => {
          const selected = controls?.view.selectedTaskId === item.id;
          return <li key={item.id} data-ask-task-id={item.id} tabIndex={-1} className={cn('rounded-xl border p-3 outline-offset-2', selected ? 'border-teal-600 bg-teal-50' : 'border-transparent bg-slate-50')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" data-household-detail-trigger={item.id} data-ask-detail-trigger={item.id} data-ask-detail-block={block.id} aria-expanded={detailMemberId === item.id} aria-controls={`household-detail-${item.id}`} onClick={() => openDetail(item)} className="min-h-10 text-left font-medium text-slate-950 underline-offset-4 hover:text-teal-800 hover:underline">{item.title}</button>
              {item.status && <span className="text-xs text-slate-600">{item.status.replace(/_/g, ' ')}</span>}
            </div>
            {item.meta.length > 0 && <p className="mt-1 text-xs text-slate-600">{item.meta.join(' · ')}</p>}
          </li>;
        })}
      </ul>
      {section.count > section.items.length && <p className="mt-3 text-sm text-slate-500">+{section.count - section.items.length} more household members are available through the full Household collection.</p>}
    </div>)}
    {detailMemberId && detailItem && <HouseholdMemberDetail key={detailMemberId} memberId={detailMemberId} expectedPropertyId={propertyId} fallbackItem={detailItem} onAccessLost={onAccessLost} onClose={closeDetail} />}
    <div className="flex flex-wrap gap-3 p-4 text-sm font-semibold text-teal-800">{block.actions.map((action) => action.href && <span key={action.id}>{link(action.href, <>{action.label}<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}</span>)}</div>
  </section>;
}
