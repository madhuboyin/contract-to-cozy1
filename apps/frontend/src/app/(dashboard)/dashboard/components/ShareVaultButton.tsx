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
import { VaultShareLinkResponse } from '@/types';

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
  const [shareLink, setShareLink] = useState<VaultShareLinkResponse | null>(null);
  const [shareLinkError, setShareLinkError] = useState<string | null>(null);
  const [creatingShareLink, setCreatingShareLink] = useState(false);

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
    setShareLink(null);
    setShareLinkError(null);

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

  const refreshShareLink = useCallback(async () => {
    setCreatingShareLink(true);
    setShareLinkError(null);

    try {
      const res = await api.createVaultShareLink(propertyId);
      if (res.success && res.data) {
        setShareLink(res.data);
      } else {
        setShareLink(null);
        setShareLinkError(res.message || 'Unable to create a temporary share link right now.');
      }
    } catch {
      setShareLink(null);
      setShareLinkError('Unable to create a temporary share link right now.');
    } finally {
      setCreatingShareLink(false);
    }
  }, [propertyId]);

  useEffect(() => {
    if (!open) return;
    if (modal.phase !== 'configured' && modal.phase !== 'just-set') return;
    void refreshShareLink();
  }, [modal.phase, open, refreshShareLink]);

  const handleSetPassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (modal.phase !== 'set-password' || modal.saving) return;

    const trimmed = password.trim();
    if (trimmed.length < 14) {
      setModal({
        phase: 'set-password',
        error: 'Use at least 14 characters with uppercase, lowercase, and a number.',
        saving: false,
      });
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
                      We recommend a unique passphrase with at least 14 characters, plus
                      uppercase, lowercase, and a number.
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
                          placeholder="At least 14 chars, mixed case, number"
                          className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          autoComplete="new-password"
                          minLength={14}
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
                      disabled={modal.saving || password.trim().length < 14}
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
                    <strong>Vault password set.</strong> We generated a temporary share link below.
                    It expires automatically, and changing the vault password invalidates old links.
                  </div>

                  <VaultLinkBlock
                    vaultUrl={shareLink?.shareUrl || vaultUrl}
                    copiedUrl={copiedUrl}
                    onCopy={() => copyToClipboard(shareLink?.shareUrl || vaultUrl)}
                    expiresAt={shareLink?.expiresAt ?? null}
                    loading={creatingShareLink}
                    error={shareLinkError}
                    onRefresh={() => void refreshShareLink()}
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
                      The temporary link expires automatically, and changing the vault password
                      invalidates previously generated links.
                    </p>
                  )}

                  <VaultLinkBlock
                    vaultUrl={shareLink?.shareUrl || vaultUrl}
                    copiedUrl={copiedUrl}
                    onCopy={() => copyToClipboard(shareLink?.shareUrl || vaultUrl)}
                    expiresAt={shareLink?.expiresAt ?? null}
                    loading={creatingShareLink}
                    error={shareLinkError}
                    onRefresh={() => void refreshShareLink()}
                  />

                  <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                    <strong>Tip:</strong> The vault is read-only and shows only verified assets
                    and completed service history. Generate a fresh share link any time you want
                    to rotate buyer access without changing the underlying property data.
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
  expiresAt,
  loading,
  error,
  onRefresh,
}: {
  vaultUrl: string;
  copiedUrl: boolean;
  onCopy: () => void;
  expiresAt: string | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold tracking-normal text-slate-500">
        Temporary Shareable Link
      </label>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <p className="break-all text-sm text-slate-700">{vaultUrl}</p>
        {expiresLabel && (
          <p className="mt-1 text-xs text-slate-500">Expires {expiresLabel}</p>
        )}
        {error && (
          <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-600">{error}</p>
        )}
        <div className="mt-2 flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Refresh
          </button>
          <button
            type="button"
            onClick={onCopy}
            disabled={loading}
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
