'use client';

import { useState } from 'react';
import { api } from '@/lib/api/client';
import { useToast } from '@/components/ui/use-toast';
import type { ProviderCredential } from '@/types';

interface Props {
  credential: ProviderCredential;
  onDecided: (id: string) => void;
}

/**
 * Admin review actions — approve/reject/revoke (Section 8). Reject/revoke
 * require a reason, which the backend stores as ProviderCredential.rejectionReason
 * (reused for both — see providerCredential.service.ts).
 */
export default function ProviderCredentialQueueActions({ credential, onDecided }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    try {
      await api.adminApproveProviderCredential(credential.id);
      toast({ title: 'Credential approved' });
      onDecided(credential.id);
    } catch (err: any) {
      toast({ title: 'Failed to approve', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    const rejectionReason = window.prompt('Reason for rejection (shown to the provider):');
    if (!rejectionReason?.trim()) return;

    setBusy(true);
    try {
      await api.adminRejectProviderCredential(credential.id, rejectionReason.trim());
      toast({ title: 'Credential rejected' });
      onDecided(credential.id);
    } catch (err: any) {
      toast({ title: 'Failed to reject', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    const reason = window.prompt('Reason for revoking this credential (e.g. fraud, complaint):');
    if (!reason?.trim()) return;

    setBusy(true);
    try {
      await api.adminRevokeProviderCredential(credential.id, reason.trim());
      toast({ title: 'Credential revoked' });
      onDecided(credential.id);
    } catch (err: any) {
      toast({ title: 'Failed to revoke', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  if (credential.status === 'PENDING_REVIEW') {
    return (
      <div className="flex gap-2">
        <button
          onClick={approve}
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={reject}
          disabled={busy}
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    );
  }

  if (credential.status === 'APPROVED') {
    return (
      <button
        onClick={revoke}
        disabled={busy}
        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
      >
        Revoke
      </button>
    );
  }

  return null;
}
