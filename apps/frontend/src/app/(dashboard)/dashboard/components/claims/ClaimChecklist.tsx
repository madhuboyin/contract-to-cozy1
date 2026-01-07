// apps/frontend/src/app/(dashboard)/dashboard/components/claims/ClaimChecklist.tsx
'use client';

import React, { useMemo, useRef, useState } from 'react';
import type {
  ClaimDTO,
  ClaimChecklistStatus,
  ClaimChecklistItemDTO,
  ClaimDocumentType,
} from '@/types/claims.types';
import {
  updateClaimChecklistItem,
  uploadChecklistItemDocument,
} from '@/app/(dashboard)/dashboard/properties/[id]/claims/claimsApi';
import { toast } from '@/components/ui/use-toast';

type BlockingEntry = {
  itemId: string;
  title?: string;
  missingStatus?: boolean;
  missingDocs?: number;
  requiredDocTypes?: string[];
  requiredDocMinCount?: number;
};

function statusLabel(s: ClaimChecklistStatus) {
  if (s === 'DONE') return 'Done';
  if (s === 'NOT_APPLICABLE') return 'N/A';
  return 'Open';
}

function docReqLabel(types?: ClaimDocumentType[], min?: number) {
  const m = min ?? 0;
  if (m <= 0 && !(types?.length ?? 0)) return null;
  const t = (types ?? []).length ? (types ?? []).join(', ') : 'Any';
  return m > 0 ? `Requires ${m} doc(s) (${t})` : `Accepted doc type(s): ${t}`;
}

function blockingReasonText(b: BlockingEntry) {
  const parts: string[] = [];
  if (b.missingStatus) parts.push('Mark as Done or N/A');
  if ((b.missingDocs ?? 0) > 0) {
    const types = (b.requiredDocTypes ?? []).length ? ` (${b.requiredDocTypes?.join(', ')})` : '';
    const min = b.requiredDocMinCount ?? undefined;
    parts.push(`Upload ${b.missingDocs} more doc(s)${min ? ` (min ${min})` : ''}${types}`);
  }
  return parts.length ? parts.join(' • ') : 'Incomplete requirements';
}

function normalizeDocType(t?: string | null) {
  return (t || '').trim().toUpperCase();
}

function computeDocProgress(
  item: ClaimChecklistItemDTO,
  docs: any[]
): {
  min: number;
  totalUploaded: number;
  satisfied: boolean;
  pct: number;
  requiredTypes: string[];
  requiredByType: { type: string; count: number }[];
} {
  const min = item.requiredDocMinCount ?? 0;

  const requiredTypes: string[] = Array.isArray(item.requiredDocTypes)
    ? (item.requiredDocTypes as any[]).map((t) => normalizeDocType(String(t))).filter(Boolean)
    : [];

  // docs appear to be ClaimChecklistItemDocument-ish:
  // d.claimDocumentType might exist, or d.document?.type, or d.documentType
  const docTypes = (docs ?? [])
    .map((d: any) =>
      normalizeDocType(
        d?.claimDocumentType ??
          d?.documentType ??
          d?.document?.type ??
          d?.document?.documentType ??
          d?.type
      )
    )
    .filter(Boolean);

  const totalUploaded = docTypes.length;

  const byType: Record<string, number> = {};
  for (const t of docTypes) byType[t] = (byType[t] || 0) + 1;

  const requiredByType = requiredTypes.map((t) => ({
    type: t,
    count: byType[t] || 0,
  }));

  const satisfied = min <= 0 ? true : totalUploaded >= min;
  const pct = min <= 0 ? 100 : Math.min(100, Math.round((totalUploaded / min) * 100));

  return { min, totalUploaded, satisfied, pct, requiredTypes, requiredByType };
}

export default function ClaimChecklist({
  propertyId,
  claim,
  onChanged,
  busy = false,
  blocking = [],
}: {
  propertyId: string;
  claim: ClaimDTO;
  onChanged: () => Promise<void>;
  busy?: boolean;
  blocking?: BlockingEntry[];
}) {
  const items = useMemo(
    () =>
      (claim.checklistItems ?? [])
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [claim.checklistItems]
  );

  const blockingByItemId = useMemo(() => {
    const map = new Map<string, BlockingEntry>();
    (blocking ?? []).forEach((b) => {
      if (b?.itemId) map.set(b.itemId, b);
    });
    return map;
  }, [blocking]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadForItemId, setUploadForItemId] = useState<string | null>(null);

  async function setItemStatus(item: ClaimChecklistItemDTO, status: ClaimChecklistStatus) {
    setBusyId(item.id);
    try {
      await updateClaimChecklistItem(propertyId, claim.id, item.id, { status });
      await onChanged();
    } finally {
      setBusyId(null);
    }
  }

  function openUpload(itemId: string) {
    setUploadForItemId(itemId);
    setTimeout(() => fileRef.current?.click(), 0);
  }

  async function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const itemId = uploadForItemId;
    e.target.value = '';
    setUploadForItemId(null);

    if (!itemId || files.length === 0) return;

    setBusyId(itemId);
    try {
      for (const f of files) {
        await uploadChecklistItemDocument(propertyId, claim.id, itemId, {
          file: f,
          claimDocumentType: 'OTHER',
          title: f.name,
        });
      }
      toast({ title: 'Uploaded', description: `${files.length} file(s) attached.` });
      await onChanged();
    } catch (err: any) {
      toast({
        title: 'Upload failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <div className="text-sm text-gray-600">No checklist items yet.</div>;
  }

  return (
    <div className="space-y-2">
      <input ref={fileRef} type="file" className="hidden" multiple onChange={onFilesSelected} />

      {/* Blocking summary (shown after failed submit) */}
      {(blocking?.length ?? 0) > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">Submission blocked</div>
          <div className="mt-1 text-xs text-amber-800">
            Complete the highlighted checklist requirements below, then submit again.
          </div>
        </div>
      ) : null}

      {items.map((it) => {
        const reqText = docReqLabel(it.requiredDocTypes, it.requiredDocMinCount);
        const docs = (it as any).documents ?? [];
        const block = blockingByItemId.get(it.id);
        const isBlocked = Boolean(block);

        const progress = computeDocProgress(it, docs);
        const shouldShowDocProgress =
          (it.requiredDocMinCount ?? 0) > 0 || (it.requiredDocTypes?.length ?? 0) > 0;

        const blockingTooltip = block ? blockingReasonText(block as BlockingEntry) : '';

        return (
          <div
            key={it.id}
            className={[
              'rounded-lg border bg-white p-3',
              isBlocked ? 'border-amber-300 bg-amber-50/30' : '',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-gray-900">
                    {it.orderIndex + 1}. {it.title}
                  </div>

                  {it.required ? (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                      Required
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-700">
                      Optional
                    </span>
                  )}

                  {/* Replace big amber text block with inline tooltip icon */}
                  {isBlocked ? (
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded bg-amber-100 text-xs font-semibold text-amber-900"
                      title={blockingTooltip}
                      aria-label="Needs attention"
                    >
                      ⚠
                    </span>
                  ) : null}
                </div>

                {it.description ? (
                  <div className="mt-1 text-sm text-gray-600">{it.description}</div>
                ) : null}

                {reqText ? (
                  <div className="mt-1 text-xs font-medium text-amber-700">{reqText}</div>
                ) : null}

                {/* Doc progress (x/y + mini progress bar + required type counters) */}
                {shouldShowDocProgress ? (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-xs text-gray-700">
                      <span className="opacity-80">Docs</span>
                      {progress.min > 0 ? (
                        <span className={progress.satisfied ? 'opacity-80' : 'font-semibold'}>
                          {progress.totalUploaded}/{progress.min} uploaded
                        </span>
                      ) : (
                        <span className="opacity-80">{progress.totalUploaded} uploaded</span>
                      )}
                    </div>

                    {progress.min > 0 ? (
                      <div className="h-2 w-full rounded bg-black/10">
                        <div
                          className="h-2 rounded bg-black/40"
                          style={{ width: `${progress.pct}%` }}
                        />
                      </div>
                    ) : null}

                    {progress.requiredTypes.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {progress.requiredByType.map((rt) => (
                          <span
                            key={rt.type}
                            className={[
                              'rounded px-2 py-0.5 text-[11px]',
                              rt.count > 0 ? 'bg-black/10' : 'bg-black/5 opacity-70',
                            ].join(' ')}
                            title={`${rt.type}: ${rt.count} uploaded`}
                          >
                            {rt.type}: {rt.count}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <button
                  className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50"
                  onClick={() => openUpload(it.id)}
                  disabled={busy || busyId === it.id}
                  title="Upload and attach documents to this checklist item"
                >
                  Upload
                </button>

                <select
                  className="rounded-lg border px-2 py-1 text-sm"
                  value={it.status}
                  disabled={busy || busyId === it.id}
                  onChange={(e) => setItemStatus(it, e.target.value as ClaimChecklistStatus)}
                >
                  <option value="OPEN">{statusLabel('OPEN')}</option>
                  <option value="DONE">{statusLabel('DONE')}</option>
                  <option value="NOT_APPLICABLE">{statusLabel('NOT_APPLICABLE')}</option>
                </select>
              </div>
            </div>

            {busyId === it.id ? (
              <div className="mt-2 text-xs text-gray-500">Updating…</div>
            ) : null}

            {docs.length > 0 ? (
              <div className="mt-3 rounded-lg border bg-gray-50 p-2">
                <div className="text-xs font-semibold text-gray-700">Documents</div>
                <div className="mt-2 space-y-1">
                  {docs.map((d: any) => {
                    const url = d.document?.fileUrl;
                    const label = d.title || d.document?.name || 'Document';
                    return (
                      <div key={d.id} className="flex items-center justify-between gap-2">
                        <div className="truncate text-xs text-gray-700">{label}</div>
                        {url ? (
                          <a
                            className="shrink-0 text-xs font-medium text-emerald-700 hover:underline"
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View
                          </a>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
