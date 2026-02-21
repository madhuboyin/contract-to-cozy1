'use client';

// apps/frontend/src/app/(dashboard)/dashboard/components/ShareVaultButton.tsx
// Homeowner-facing "Share Vault" button + modal that displays the
// shareable URL and the access password for realtors / buyers.

import React, { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Lock, Share2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const VAULT_PASSWORD = 'vault_test_2026';

interface ShareVaultButtonProps {
  propertyId: string;
  propertyAddress?: string;
}

export function ShareVaultButton({ propertyId, propertyAddress }: ShareVaultButtonProps) {
  const [open, setOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedPwd, setCopiedPwd] = useState(false);

  // Fix 1: Compute vaultUrl client-side only to avoid SSR/hydration mismatch.
  // During SSR, window is undefined — setting state in useEffect ensures the
  // absolute URL is only ever rendered in the browser, keeping server and
  // client HTML in sync.
  const [vaultUrl, setVaultUrl] = useState(`/vault/${propertyId}`);
  useEffect(() => {
    setVaultUrl(`${window.location.origin}/vault/${propertyId}`);
  }, [propertyId]);

  const copyToClipboard = async (text: string, type: 'url' | 'pwd') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'url') {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      } else {
        setCopiedPwd(true);
        setTimeout(() => setCopiedPwd(false), 2000);
      }
    } catch {
      // Clipboard API not available — silently ignore
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
        onClick={() => setOpen(true)}
      >
        <Share2 className="h-4 w-4" />
        Share Vault
      </Button>

      {/* Fix 4: Remove max-w-md override — it's a no-op at ≥640 px (sm:max-w-lg wins)
          and creates inconsistent width at mobile. Let DialogContent's own sizing rule. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            {/* Fix 3: pr-10 prevents the dialog's absolute close button (right-3, 44 px wide)
                from overlapping the title text at all viewport sizes. */}
            <DialogTitle className="flex items-center gap-2 pr-10 text-slate-900">
              <Share2 className="h-5 w-5 shrink-0 text-emerald-600" />
              Share Seller&apos;s Vault
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {propertyAddress && (
              // Fix 5: break-words guards against long addresses breaking the layout.
              <p className="break-words text-sm text-slate-500">
                Share your property&apos;s verified proof-of-care report for{' '}
                <span className="font-medium text-slate-700">{propertyAddress}</span> with
                realtors and prospective buyers.
              </p>
            )}

            {/* Vault URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Shareable Link
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{vaultUrl}</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(vaultUrl, 'url')}
                  className="shrink-0 text-slate-400 transition hover:text-emerald-600"
                  title="Copy link"
                >
                  {copiedUrl ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
                <a
                  href={vaultUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-slate-400 transition hover:text-blue-600"
                  title="Open in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Access Password
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <Lock className="h-4 w-4 shrink-0 text-slate-400" />
                {/* Fix 2: Removed tracking-widest (caused overflow in the flex row).
                    Added min-w-0 so flex-1 can actually shrink when the container is narrow. */}
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-slate-700">
                  {VAULT_PASSWORD}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(VAULT_PASSWORD, 'pwd')}
                  className="shrink-0 text-slate-400 transition hover:text-emerald-600"
                  title="Copy password"
                >
                  {copiedPwd ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Usage tip */}
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
              <strong>Tip:</strong> Send both the link and password together — the vault is
              read-only and shows only verified assets and completed service history.
            </div>

            <Button
              type="button"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
