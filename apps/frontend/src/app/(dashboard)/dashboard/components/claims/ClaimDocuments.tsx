// apps/frontend/src/app/(dashboard)/dashboard/components/claims/ClaimDocuments.tsx
'use client';

import React from 'react';
import type { ClaimDTO, ClaimDocumentDTO } from '@/types/claims.types';

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function truncateMiddle(input: string, max = 48) {
  if (!input) return input;
  if (input.length <= max) return input;
  const left = Math.ceil((max - 3) / 2);
  const right = Math.floor((max - 3) / 2);
  return `${input.slice(0, left)}...${input.slice(input.length - right)}`;
}

function getDisplayTitle(d: ClaimDocumentDTO) {
  return d.title || d.document?.name || 'Document';
}

export default function ClaimDocuments({ claim }: { claim: ClaimDTO }) {
  const docs = claim.documents ?? [];

  if (docs.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-3 text-sm text-gray-600">
        <div className="font-medium text-gray-800">No documents yet</div>
        <div className="mt-1">
          Add photos, invoices, estimates, or reports to keep everything in one place.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {docs.map((d) => {
        const title = getDisplayTitle(d);
        const created = formatDate(d.createdAt);
        const docUrl = d.document?.fileUrl || null;

        const chip = d.claimDocumentType ?? 'OTHER';
        const mime = d.document?.mimeType || null;

        return (
          <div key={d.id} className="rounded-lg border bg-white p-3">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-gray-900">
                  {title}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <span className="inline-flex items-center rounded-full border bg-gray-50 px-2 py-1 sm:py-0.5">
                    {chip}
                  </span>

                  {mime ? <span>{mime}</span> : null}
                  {created ? <span>• Added {created}</span> : null}
                </div>
              </div>

              {docUrl ? (
                <a
                  className="w-full sm:w-auto sm:shrink-0 rounded-lg border px-3 py-2 min-h-[44px] inline-flex items-center justify-center text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                  href={docUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={docUrl}
                >
                  View / Download
                </a>
              ) : null}
            </div>

            {d.notes ? (
              <div className="mt-2 whitespace-pre-line text-sm text-gray-700">
                {d.notes}
              </div>
            ) : null}

            {/* Optional: show underlying name/url when title is custom */}
            {d.document?.name && d.title && d.title !== d.document.name ? (
              <div className="mt-2 text-xs text-gray-500">
                File: {truncateMiddle(d.document.name)}
              </div>
            ) : null}

            {/* If document relation missing (shouldn't happen often), still show something */}
            {!d.document && d.documentId ? (
              <div className="mt-2 text-xs text-gray-500">
                Document reference: {truncateMiddle(d.documentId)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
