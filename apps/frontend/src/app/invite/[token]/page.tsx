'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { InvitePreview } from '@/types';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/components/features/household/HouseholdUtils';

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    api.previewInvite(token)
      .then(setPreview)
      .catch(() => setError('This invite link is invalid or has already been used.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const result = await api.acceptInvite(token);
      router.push(`/dashboard?propertyId=${result.propertyId}`);
    } catch (err: any) {
      // If 401, user is not logged in — redirect to login with return URL
      if (err?.statusCode === 401 || err?.status === 401) {
        router.push(`/login?returnUrl=${encodeURIComponent(`/invite/${token}`)}`);
        return;
      }
      setError(err?.message ?? 'Failed to accept invite. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl p-6 shadow-sm text-center space-y-4">
          <p className="text-gray-600 text-sm">{error ?? 'Invite not found.'}</p>
          <Link href="/" className="text-blue-600 text-sm hover:text-blue-800">
            Go to home
          </Link>
        </div>
      </div>
    );
  }

  const expiresAt = new Date(preview.expiresAt);
  const hoursRemaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 3_600_000));

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-white rounded-2xl p-6 shadow-sm space-y-5">
        <div className="text-center space-y-1">
          <p className="text-sm text-gray-500">You&apos;ve been invited to</p>
          <h1 className="text-lg font-semibold text-gray-900">{preview.propertyAddressSnippet}</h1>
          <p className="text-sm text-gray-500">by {preview.invitedByName}</p>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your role</p>
          <p className="text-sm font-medium text-gray-900">{ROLE_LABELS[preview.role]}</p>
          <p className="text-xs text-gray-500">{ROLE_DESCRIPTIONS[preview.role]}</p>
        </div>

        {preview.isExpired ? (
          <p className="text-sm text-red-600 text-center">This invite has expired.</p>
        ) : (
          <>
            {hoursRemaining < 24 && hoursRemaining > 0 && (
              <p className="text-xs text-amber-600 text-center">
                Expires in {hoursRemaining} hour{hoursRemaining !== 1 ? 's' : ''}
              </p>
            )}
            <Button className="w-full" onClick={handleAccept} disabled={accepting}>
              {accepting ? 'Accepting…' : 'Accept Invite'}
            </Button>
          </>
        )}

        <p className="text-center">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">
            Decline
          </Link>
        </p>
      </div>
    </div>
  );
}
