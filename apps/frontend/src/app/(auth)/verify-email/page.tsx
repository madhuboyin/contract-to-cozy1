'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AuthTemplate from '@/components/auth/AuthTemplate';
import { api } from '@/lib/api/client';

type VerificationState = 'verifying' | 'success' | 'error';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get('token')?.trim() ?? '', [searchParams]);
  const [state, setState] = useState<VerificationState>(token ? 'verifying' : 'error');
  const [message, setMessage] = useState(token ? 'Verifying your email...' : 'Verification link is missing or invalid.');

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    void api.post('/api/auth/verify-email', { token })
      .then(() => {
        if (cancelled) return;
        setState('success');
        setMessage('Your email has been verified. You can sign in now.');
      })
      .catch((error: any) => {
        if (cancelled) return;
        setState('error');
        setMessage(error?.message || 'This verification link is invalid or has expired.');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthTemplate
      activeRoute="login"
      title="Verify your email"
      subtitle="We use email verification to protect access to sensitive contract and property data."
    >
      <div className="rounded-xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-sm text-slate-700">{message}</p>

        <div className="mt-5 flex gap-3">
          {state === 'success' ? (
            <Link
              href="/login"
              className="inline-flex rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
            >
              Go to sign in
            </Link>
          ) : null}

          {state === 'error' ? (
            <Link
              href="/signup"
              className="inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Create account again
            </Link>
          ) : null}
        </div>
      </div>
    </AuthTemplate>
  );
}
