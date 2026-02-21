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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(96vw,40rem)] max-h-[90dvh] overflow-hidden p-0 sm:max-w-[40rem]">
          <div className="flex max-h-[90dvh] flex-col">
            <DialogHeader className="border-b border-slate-100 px-5 pb-3 pt-5 sm:px-6">
              <DialogTitle className="flex items-center gap-2 pr-10 text-slate-900">
                <Share2 className="h-5 w-5 shrink-0 text-emerald-600" />
                Share Seller&apos;s Vault
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 overflow-y-auto px-5 pb-5 pt-3 sm:px-6 sm:pb-6">
              {propertyAddress && (
                <p className="break-words text-sm leading-relaxed text-slate-500">
                  Share your property&apos;s verified proof-of-care report for{' '}
                  <span className="font-medium text-slate-700">{propertyAddress}</span> with
                  realtors and prospective buyers.
                </p>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Shareable Link
                </label>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="break-all text-sm text-slate-700">{vaultUrl}</p>
                  <div className="mt-2 flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(vaultUrl, 'url')}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-emerald-700"
                      title="Copy link"
                      aria-label="Copy shareable link"
                    >
                      {copiedUrl ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {copiedUrl ? 'Copied' : 'Copy'}
                    </button>
                    <a
                      href={vaultUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-blue-700"
                      title="Open in new tab"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open
                    </a>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Access Password
                </label>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <Lock className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 break-all font-mono text-sm text-slate-700">
                    {VAULT_PASSWORD}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(VAULT_PASSWORD, 'pwd')}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-emerald-700"
                    title="Copy password"
                    aria-label="Copy vault password"
                  >
                    {copiedPwd ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copiedPwd ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                <strong>Tip:</strong> Send both the link and password together. The vault is
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
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
