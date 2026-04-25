'use client';

// apps/frontend/src/app/(dashboard)/dashboard/components/ShareVaultButton.tsx
// Homeowner-facing "Share Vault" button + modal.
// Fetches vault status on open — shows the set-password form if no password
// has been configured yet, otherwise shows the shareable link.

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, KeyRound, Loader2, Lock, Share2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';

interface ShareVaultButtonProps {
  propertyId: string;
  propertyAddress?: string;
}

type ModalState =
  | { phase: 'loading' }
  | { phase: 'set-password'; error: string | null; saving: boolean }
  | { phase: 'just-set' }          // password was set moments ago — show one-time confirmation
  | { phase: 'configured' };       // vault already had a password before modal opened

export function ShareVaultButton({ propertyId, propertyAddress }: ShareVaultButtonProps) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>({ phase: 'loading' });
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  // Client-side only to avoid SSR/hydration mismatch
  const [vaultUrl, setVaultUrl] = useState(`/vault/${propertyId}`);
  useEffect(() => {
    setVaultUrl(`${window.location.origin}/vault/${propertyId}`);
  }, [propertyId]);

  // Fetch vault status whenever the modal opens
  useEffect(() => {
    if (!open) return;

    setModal({ phase: 'loading' });
    setPassword('');

    api.getVaultStatus(propertyId).then((res) => {
      if (res.success && res.data?.isConfigured) {
        setModal({ phase: 'configured' });
      } else {
        setModal({ phase: 'set-password', error: null, saving: false });
      }
    }).catch(() => {
      setModal({ phase: 'set-password', error: null, saving: false });
    });
  }, [open, propertyId]);

  const handleSetPassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (modal.phase !== 'set-password' || modal.saving) return;

    const trimmed = password.trim();
    if (trimmed.length < 8) {
      setModal({ phase: 'set-password', error: 'Password must be at least 8 characters.', saving: false });
      return;
    }

    setModal({ phase: 'set-password', error: null, saving: true });

    try {
      const res = await api.setVaultPassword(propertyId, trimmed);
      if (res.success) {
        setModal({ phase: 'just-set' });
        setPassword('');
      } else {
        setModal({ phase: 'set-password', error: (res as any).message || 'Failed to set password. Please try again.', saving: false });
      }
    } catch {
      setModal({ phase: 'set-password', error: 'Network error. Please try again.', saving: false });
    }
  }, [modal, password, propertyId]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Clipboard API not available — silently ignore
    }
  };

  const handleClose = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setPassword('');
      setShowPwd(false);
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

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="w-[min(96vw,40rem)] max-h-[90dvh] overflow-hidden p-0 sm:max-w-[40rem]">
          <div className="flex max-h-[90dvh] flex-col">
            <DialogHeader className="border-b border-slate-100 px-5 pb-3 pt-5 sm:px-6">
              <DialogTitle className="flex items-center gap-2 pr-10 text-slate-900">
                <Share2 className="h-5 w-5 shrink-0 text-emerald-600" />
                Share Seller&apos;s Vault
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 overflow-y-auto px-5 pb-5 pt-3 sm:px-6 sm:pb-6">

              {/* ── Loading ── */}
              {modal.phase === 'loading' && (
                <div className="flex items-center justify-center py-8 text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}

              {/* ── Set password form ── */}
              {modal.phase === 'set-password' && (
                <>
                  {propertyAddress && (
                    <p className="break-words text-sm leading-relaxed text-slate-500">
                      Create a password to protect the vault for{' '}
                      <span className="font-medium text-slate-700">{propertyAddress}</span>.
                      Share it along with the link so buyers and realtors can view your
                      verified proof-of-care report.
                    </p>
                  )}

                  <form onSubmit={handleSetPassword} className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold tracking-normal text-slate-500">
                        Vault Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPwd ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Min. 8 characters"
                          className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          autoComplete="new-password"
                          minLength={8}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          aria-label={showPwd ? 'Hide password' : 'Show password'}
                        >
                          {showPwd ? (
                            <KeyRound className="h-4 w-4" />
                          ) : (
                            <Lock className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {modal.error && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                        {modal.error}
                      </p>
                    )}

                    <Button
                      type="submit"
                      disabled={modal.saving || password.trim().length < 8}
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                    >
                      {modal.saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Setting password…
                        </>
                      ) : (
                        'Set Vault Password'
                      )}
                    </Button>
                  </form>
                </>
              )}

              {/* ── Password just set — show the link ── */}
              {modal.phase === 'just-set' && (
                <>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
                    <strong>Vault password set.</strong> Share the link below along with the
                    password you just created. We do not display your password again — you
                    can always set a new one by reopening this dialog.
                  </div>

                  <VaultLinkBlock
                    vaultUrl={vaultUrl}
                    copiedUrl={copiedUrl}
                    onCopy={() => copyToClipboard(vaultUrl)}
                  />

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-slate-500"
                    onClick={() => setModal({ phase: 'set-password', error: null, saving: false })}
                  >
                    Set a different password
                  </Button>
                </>
              )}

              {/* ── Already configured ── */}
              {modal.phase === 'configured' && (
                <>
                  {propertyAddress && (
                    <p className="break-words text-sm leading-relaxed text-slate-500">
                      Share the link below with realtors and prospective buyers for{' '}
                      <span className="font-medium text-slate-700">{propertyAddress}</span>.
                      Include the vault password you created when you first set it up.
                    </p>
                  )}

                  <VaultLinkBlock
                    vaultUrl={vaultUrl}
                    copiedUrl={copiedUrl}
                    onCopy={() => copyToClipboard(vaultUrl)}
                  />

                  <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                    <strong>Tip:</strong> Send the link and your vault password together. The
                    vault is read-only and shows only verified assets and completed service history.
                    If you have forgotten your password, set a new one below.
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-slate-500"
                    onClick={() => setModal({ phase: 'set-password', error: null, saving: false })}
                  >
                    Change vault password
                  </Button>
                </>
              )}

            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-component
// ─────────────────────────────────────────────────────────────────────────────

function VaultLinkBlock({
  vaultUrl,
  copiedUrl,
  onCopy,
}: {
  vaultUrl: string;
  copiedUrl: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold tracking-normal text-slate-500">
        Shareable Link
      </label>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <p className="break-all text-sm text-slate-700">{vaultUrl}</p>
        <div className="mt-2 flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-emerald-700"
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
  );
}
