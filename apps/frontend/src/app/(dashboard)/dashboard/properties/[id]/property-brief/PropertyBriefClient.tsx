'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  FileCheck2,
  Link2,
  LockKeyhole,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  createPropertyBrief,
  createPropertyBriefShare,
  getPropertyBriefPreview,
  getPropertyBriefTemplates,
  listEligiblePropertyBriefDocuments,
  listPropertyBriefs,
  revokePropertyBriefShare,
  type PropertyBrief,
  type PropertyBriefPurpose,
  type PropertyBriefSection,
  type PropertyBriefSectionType,
} from './propertyBriefApi';

const SECTION_LABELS: Record<PropertyBriefSectionType, string> = {
  PROPERTY_FACTS: 'Property facts',
  VERIFIED_HISTORY: 'Verified history',
  DOCUMENTS: 'Selected verified documents',
  OPEN_UNKNOWNS: 'Open unknowns',
  CLAIMS: 'Claims',
  INSURANCE: 'Insurance',
};

function humanize(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  return String(value).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function itemValue(item: Record<string, unknown>) {
  const hidden = new Set(['key', 'asOf', 'source', 'verification']);
  return Object.entries(item)
    .filter(([key, value]) => !hidden.has(key) && value !== null && value !== undefined)
    .map(([key, value]) => `${humanize(key)}: ${humanize(value)}`)
    .join(' · ');
}

function BriefSection({ section }: { section: PropertyBriefSection }) {
  const evidence = new Map(section.evidenceLinks.map((item) => [item.itemKey, item]));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-950">{section.title}</h3>
          <p className="mt-1 text-xs text-slate-500">As of {new Date(section.asOf).toLocaleString()}</p>
        </div>
        {section.sensitive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900">
            <LockKeyhole className="h-3 w-3" /> Sensitive
          </span>
        )}
      </div>
      <div className="mt-4 space-y-3">
        {(section.payload.items ?? []).length === 0 && (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            No eligible records were included in this selected section.
          </p>
        )}
        {(section.payload.items ?? []).map((item) => {
          const proof = evidence.get(item.key);
          return (
            <article key={item.key} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-900">{itemValue(item)}</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                Source: {proof?.sourceLabel ?? humanize(item.source)} · As of{' '}
                {new Date(proof?.sourceAsOf ?? String(item.asOf)).toLocaleDateString()} ·{' '}
                {humanize(proof?.verification ?? item.verification)}
              </p>
            </article>
          );
        })}
        {section.payload.completenessBoundary && (
          <p className="text-xs leading-5 text-slate-500">{section.payload.completenessBoundary}</p>
        )}
        {section.payload.limitation && (
          <p className="text-xs leading-5 text-amber-800">{section.payload.limitation}</p>
        )}
        {section.payload.excludedFields && (
          <p className="text-xs leading-5 text-slate-500">
            Excluded fields: {section.payload.excludedFields.join(', ')}.
          </p>
        )}
      </div>
    </section>
  );
}

export default function PropertyBriefClient({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const templatesQuery = useQuery({
    queryKey: ['property-brief-templates'],
    queryFn: getPropertyBriefTemplates,
  });
  const briefsQuery = useQuery({
    queryKey: ['property-briefs', propertyId],
    queryFn: () => listPropertyBriefs(propertyId),
  });
  const eligibleDocumentsQuery = useQuery({
    queryKey: ['property-brief-eligible-documents', propertyId],
    queryFn: () => listEligiblePropertyBriefDocuments(propertyId),
  });
  const [purpose, setPurpose] = React.useState<PropertyBriefPurpose>('HOMEOWNER_REFERENCE');
  const [selectedSections, setSelectedSections] = React.useState<PropertyBriefSectionType[]>([
    'PROPERTY_FACTS',
    'VERIFIED_HISTORY',
    'OPEN_UNKNOWNS',
  ]);
  const [sensitiveAcknowledged, setSensitiveAcknowledged] = React.useState(false);
  const [selectedBriefId, setSelectedBriefId] = React.useState<string | null>(null);
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);
  const [copyComplete, setCopyComplete] = React.useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = React.useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = React.useState(14);
  const [downloadPolicy, setDownloadPolicy] = React.useState<'VIEW_ONLY' | 'ALLOW_DOWNLOAD'>('VIEW_ONLY');

  const currentTemplate = templatesQuery.data?.find((item) => item.purpose === purpose);
  const previewQuery = useQuery({
    queryKey: ['property-brief-preview', propertyId, selectedBriefId],
    queryFn: () => getPropertyBriefPreview(propertyId, selectedBriefId as string),
    enabled: Boolean(selectedBriefId),
  });

  const createMutation = useMutation({
    mutationFn: () => createPropertyBrief(propertyId, {
      purpose,
      selectedSections,
      acknowledgeSensitiveSections: sensitiveAcknowledged,
      documentIds: selectedSections.includes('DOCUMENTS') ? selectedDocumentIds : [],
    }),
    onSuccess: async (brief) => {
      setSelectedBriefId(brief.id);
      setShareUrl(null);
      await queryClient.invalidateQueries({ queryKey: ['property-briefs', propertyId] });
    },
  });
  const shareMutation = useMutation({
    mutationFn: () => createPropertyBriefShare(propertyId, selectedBriefId as string, {
      expiresInDays,
      downloadPolicy,
      previewAcknowledged: true,
      limitationAcknowledged: true,
    }),
    onSuccess: async (share) => {
      setShareUrl(share.shareUrl);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['property-briefs', propertyId] }),
        queryClient.invalidateQueries({ queryKey: ['property-brief-preview', propertyId, selectedBriefId] }),
      ]);
    },
  });
  const revokeMutation = useMutation({
    mutationFn: ({ briefId, shareId }: { briefId: string; shareId: string }) =>
      revokePropertyBriefShare(propertyId, briefId, shareId),
    onSuccess: async () => {
      setShareUrl(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['property-briefs', propertyId] }),
        queryClient.invalidateQueries({ queryKey: ['property-brief-preview', propertyId, selectedBriefId] }),
      ]);
    },
  });

  const changePurpose = (nextPurpose: PropertyBriefPurpose) => {
    setPurpose(nextPurpose);
    const template = templatesQuery.data?.find((item) => item.purpose === nextPurpose);
    if (template) setSelectedSections(template.defaultSections);
    setSensitiveAcknowledged(false);
  };
  const toggleSection = (section: PropertyBriefSectionType) => {
    setSelectedSections((current) =>
      current.includes(section)
        ? current.filter((item) => item !== section)
        : [...current, section],
    );
  };
  const selectedSensitive = selectedSections.some((section) =>
    currentTemplate?.sensitiveSections.includes(section),
  );
  const preview = previewQuery.data;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 pb-24 sm:p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sky-700">
          <FileCheck2 className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-semibold uppercase tracking-wide">Property Brief</span>
        </div>
        <h1 className="text-2xl font-semibold text-slate-950">Prepare a selective property summary</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          Choose a recipient purpose and only the sections they need. Every included item preserves its
          source and as-of date; omitted sections and known gaps remain visible.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.4fr]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-950">1. Choose purpose and sections</h2>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="brief-purpose">
              Recipient purpose
            </label>
            <select
              id="brief-purpose"
              value={purpose}
              onChange={(event) => changePurpose(event.target.value as PropertyBriefPurpose)}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {(templatesQuery.data ?? []).map((template) => (
                <option key={template.purpose} value={template.purpose}>{template.label}</option>
              ))}
            </select>

            <fieldset className="mt-5 space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Included sections</legend>
              {(currentTemplate?.allowedSections ?? []).map((section) => {
                const sensitive = currentTemplate?.sensitiveSections.includes(section);
                return (
                  <label key={section} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
                    <input
                      type="checkbox"
                      checked={selectedSections.includes(section)}
                      onChange={() => toggleSection(section)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-800">
                      {SECTION_LABELS[section]}
                      {sensitive && <span className="ml-2 text-xs font-semibold text-amber-700">Sensitive</span>}
                    </span>
                  </label>
                );
              })}
            </fieldset>

            {selectedSections.includes('DOCUMENTS') && (
              <fieldset className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Verified Vault documents</legend>
                {eligibleDocumentsQuery.isLoading && <p className="text-xs text-slate-600">Loading eligible documents…</p>}
                {(eligibleDocumentsQuery.data ?? []).length === 0 && !eligibleDocumentsQuery.isLoading && (
                  <p className="text-xs leading-5 text-slate-600">No verified documents are eligible. Verify a Vault document before including it.</p>
                )}
                {(eligibleDocumentsQuery.data ?? []).map((document) => (
                  <label key={document.id} className="flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3">
                    <input
                      type="checkbox"
                      checked={selectedDocumentIds.includes(document.id)}
                      onChange={() => setSelectedDocumentIds((current) => current.includes(document.id)
                        ? current.filter((id) => id !== document.id)
                        : [...current, document.id])}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-800">
                      <span className="block font-medium">{document.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{humanize(document.type)} · verified {new Date(document.verifiedAt ?? document.updatedAt).toLocaleDateString()}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            {selectedSensitive && (
              <label className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <input
                  type="checkbox"
                  checked={sensitiveAcknowledged}
                  onChange={(event) => setSensitiveAcknowledged(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-400"
                />
                <span className="text-xs leading-5 text-amber-900">
                  I understand the selected sections can contain sensitive household, claim, insurance, or document information.
                </span>
              </label>
            )}

            <button
              type="button"
              disabled={
                selectedSections.length === 0 ||
                (selectedSensitive && !sensitiveAcknowledged) ||
                createMutation.isPending
              }
              onClick={() => createMutation.mutate()}
              className="mt-5 w-full rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createMutation.isPending ? 'Preparing snapshot…' : 'Prepare recipient preview'}
            </button>
            {createMutation.isError && (
              <p className="mt-3 text-sm text-rose-700">The brief could not be prepared. Review the selected sections and try again.</p>
            )}
          </section>

          {(briefsQuery.data ?? []).length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-950">Saved briefs</h2>
              <div className="mt-3 space-y-2">
                {(briefsQuery.data ?? []).map((brief) => (
                  <button
                    key={brief.id}
                    type="button"
                    onClick={() => {
                      setSelectedBriefId(brief.id);
                      setShareUrl(null);
                    }}
                    className="w-full rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
                  >
                    <span className="block text-sm font-semibold text-slate-900">{brief.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {humanize(brief.purpose)} · {new Date(brief.asOf).toLocaleDateString()} · {humanize(brief.status)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <section className="space-y-4" aria-live="polite">
          {!selectedBriefId && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <ShieldAlert className="mx-auto h-6 w-6 text-slate-500" />
              <h2 className="mt-3 font-semibold text-slate-900">Preview is required before sharing</h2>
              <p className="mt-2 text-sm text-slate-600">Prepare a snapshot to see exactly what a recipient can access.</p>
            </div>
          )}
          {previewQuery.isLoading && <p className="text-sm text-slate-600">Loading recipient preview…</p>}
          {preview && (
            <>
              <header className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Recipient preview</p>
                    <h2 className="mt-1 text-xl font-semibold text-slate-950">{preview.title}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Snapshot as of {new Date(preview.asOf).toLocaleString()}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-800">
                    {humanize(preview.purpose)}
                  </span>
                </div>
                <div className="mt-4 rounded-xl bg-white p-3 text-xs leading-5 text-slate-600">
                  Explicitly excluded: {preview.excludedSections.length > 0
                    ? preview.excludedSections.map((item) => SECTION_LABELS[item]).join(', ')
                    : 'No template sections'}
                </div>
              </header>

              {(preview.sections ?? []).map((section) => <BriefSection key={section.id} section={section} />)}

              <aside className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div>
                    <h3 className="font-semibold text-amber-950">Limitations</h3>
                    <p className="mt-1 text-xs leading-5 text-amber-900">{preview.limitationStatement}</p>
                  </div>
                </div>
              </aside>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-slate-950">2. Share this exact snapshot</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Choose a short expiration and whether the recipient may download this immutable snapshot. Every view and download is logged.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Expires after
                    <select value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))} className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900">
                      <option value={1}>1 day</option><option value={3}>3 days</option><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Recipient permissions
                    <select value={downloadPolicy} onChange={(event) => setDownloadPolicy(event.target.value as typeof downloadPolicy)} className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900">
                      <option value="VIEW_ONLY">View only</option><option value="ALLOW_DOWNLOAD">View and download</option>
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  disabled={shareMutation.isPending}
                  onClick={() => shareMutation.mutate()}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Link2 className="h-4 w-4" />
                  {shareMutation.isPending ? 'Creating controlled link…' : 'Create controlled share link'}
                </button>
                {shareUrl && (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="break-all text-xs text-emerald-950">{shareUrl}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(shareUrl);
                          setCopyComplete(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-emerald-900"
                      >
                        {copyComplete ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copyComplete ? 'Copied' : 'Copy link'}
                      </button>
                      <a
                        href={shareUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-emerald-900"
                      >
                        Open recipient view <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                )}
                {(preview.shares ?? []).map((share) => (
                  <div key={share.id} className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                    <div className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-900">{humanize(share.status)}</span>
                      {' · '}expires {new Date(share.expiresAt).toLocaleDateString()}
                      {' · '}{share.accessCount} access{share.accessCount === 1 ? '' : 'es'}
                    </div>
                    {share.status === 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={() => revokeMutation.mutate({ briefId: preview.id, shareId: share.id })}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700"
                      >
                        <X className="h-3.5 w-3.5" /> Revoke
                      </button>
                    )}
                  </div>
                ))}
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
