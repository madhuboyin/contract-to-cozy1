'use client';

// apps/frontend/src/app/(dashboard)/dashboard/components/ShareVaultButton.tsx
// Homeowner-facing "Share Vault" button + modal that displays the
// shareable URL and the access password for realtors / buyers.

import React, { useState } from 'react';
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

  const vaultUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/vault/${propertyId}`
      : `/vault/${propertyId}`;

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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Share2 className="h-5 w-5 text-emerald-600" />
              Share Seller's Vault
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {propertyAddress && (
              <p className="text-sm text-slate-500">
                Share your property's verified proof-of-care report for{' '}
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
                <span className="flex-1 font-mono text-sm tracking-widest text-slate-700">
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
