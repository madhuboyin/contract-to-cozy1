'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { AdminConsoleShell } from '@/components/ops/AdminConsoleShell';
import type { ProviderCredential, ProviderCredentialType } from '@/types';
import { formatEnumLabel } from '@/lib/utils/formatters';
import ProviderCredentialQueueActions from '@/components/features/providerTrust/ProviderCredentialQueueActions';

const CREDENTIAL_TYPES: ProviderCredentialType[] = [
  'TRADE_LICENSE',
  'LIABILITY_INSURANCE',
  'WORKERS_COMP_INSURANCE',
  'BONDING',
  'CERTIFICATION',
  'BACKGROUND_CHECK',
];

export default function AdminProviderCompliancePage() {
  const guard = useAdminGuard({
    title: 'Provider Compliance Review',
    subtitle: 'Review pending provider credentials and manage category eligibility.',
  });

  const [queue, setQueue] = useState<ProviderCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<ProviderCredentialType | ''>('');

  const load = useCallback(async () => {
    setLoading(true);
    const items = await api
      .adminListProviderCredentialQueue(typeFilter ? { type: typeFilter } : undefined)
      .catch(() => []);
    setQueue(items);
    setLoading(false);
  }, [typeFilter]);

  useEffect(() => {
    if (guard.isAdmin) load();
  }, [guard.isAdmin, load]);

  function handleDecided(id: string) {
    setQueue((prev) => prev.filter((c) => c.id !== id));
  }

  if (guard.status !== 'ready') return guard.node;

  return (
    <AdminConsoleShell
      title="Provider Compliance Review"
      subtitle="Credentials pending review, oldest first. Approving a credential recomputes the provider's category eligibility immediately."
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ProviderCredentialType | '')}
          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700 focus:border-blue-500 focus:outline-none"
        >
          <option value="">All credential types</option>
          {CREDENTIAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {formatEnumLabel(t)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-neutral-400">Loading…</div>
      ) : queue.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 py-16 text-center">
          <p className="text-sm text-neutral-500">No credentials pending review.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Provider</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Type</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Categories</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Issuing authority</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Submitted</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {queue.map((credential) => (
                <tr key={credential.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {credential.providerProfile?.businessName ?? credential.providerProfileId}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{formatEnumLabel(credential.type)}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    <div className="flex flex-wrap gap-1">
                      {credential.serviceCategories.map((category) => (
                        <span key={category} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                          {formatEnumLabel(category)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{credential.issuingAuthority}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    {new Date(credential.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <ProviderCredentialQueueActions credential={credential} onDecided={handleDecided} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminConsoleShell>
  );
}
