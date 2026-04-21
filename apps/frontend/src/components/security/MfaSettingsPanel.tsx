'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MfaRecoveryCodesResponse, MfaStatusResponse } from '@/types';

function extractApiData<T>(payload: any): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data as T;
  }
  return payload as T;
}

export function MfaSettingsPanel({ className }: { className?: string }) {
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<MfaStatusResponse>({ mfaEnabled: false, recoveryCodesRemaining: 0 });
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [setupSecret, setSetupSecret] = useState<{ base32Secret: string; otpauthUri: string } | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [regenerateCode, setRegenerateCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const hasFreshRecoveryCodes = useMemo(() => recoveryCodes.length > 0, [recoveryCodes]);

  const loadStatus = useCallback(async () => {
    try {
      setLoadingStatus(true);
      const response = await api.getMfaStatus();
      if (!response.success) {
        throw new Error(response.message || 'Failed to load MFA status.');
      }
      const data = extractApiData<MfaStatusResponse>(response.data);
      setStatus(data);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Failed to load MFA status.' });
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const beginSetup = async () => {
    try {
      setWorking(true);
      setMessage(null);
      const response = await api.setupMfa();
      if (!response.success) {
        throw new Error(response.message || 'Unable to start MFA setup.');
      }
      const data = extractApiData<{ base32Secret: string; otpauthUri: string }>(response.data);
      setSetupSecret(data);
      setRecoveryCodes([]);
      setMessage({
        type: 'success',
        text: 'MFA setup started. Add the secret to your authenticator app and verify with a code.',
      });
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Unable to start MFA setup.' });
    } finally {
      setWorking(false);
    }
  };

  const confirmSetup = async () => {
    if (!setupCode.trim()) return;
    try {
      setWorking(true);
      setMessage(null);
      const response = await api.verifyMfaSetup(setupCode.trim());
      if (!response.success) {
        throw new Error(response.message || 'Invalid authenticator code.');
      }
      const data = extractApiData<{ message: string; recoveryCodes: string[] }>(response.data);
      setRecoveryCodes(data.recoveryCodes || []);
      setSetupSecret(null);
      setSetupCode('');
      await refreshUser();
      await loadStatus();
      setMessage({
        type: 'success',
        text: 'MFA enabled. Save these recovery codes now; they will not be shown again.',
      });
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Failed to verify setup code.' });
    } finally {
      setWorking(false);
    }
  };

  const regenerateRecoveryCodes = async () => {
    if (!regenerateCode.trim()) return;
    try {
      setWorking(true);
      setMessage(null);
      const response = await api.regenerateMfaRecoveryCodes(regenerateCode.trim());
      if (!response.success) {
        throw new Error(response.message || 'Unable to regenerate recovery codes.');
      }
      const data = extractApiData<MfaRecoveryCodesResponse>(response.data);
      setRecoveryCodes(data.recoveryCodes || []);
      setRegenerateCode('');
      await loadStatus();
      setMessage({
        type: 'success',
        text: 'Recovery codes regenerated. Save the new set now; old codes are invalid.',
      });
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Unable to regenerate recovery codes.' });
    } finally {
      setWorking(false);
    }
  };

  const disableMfa = async () => {
    if (!disableCode.trim()) return;
    try {
      setWorking(true);
      setMessage(null);
      const response = await api.disableMfa(disableCode.trim());
      if (!response.success) {
        throw new Error(response.message || 'Unable to disable MFA.');
      }
      setDisableCode('');
      setRecoveryCodes([]);
      setSetupSecret(null);
      setSetupCode('');
      setRegenerateCode('');
      await refreshUser();
      await loadStatus();
      setMessage({ type: 'success', text: 'MFA disabled successfully.' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Unable to disable MFA.' });
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className={className}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Two-Factor Authentication</h3>
        {loadingStatus ? (
          <span className="text-xs text-gray-500">Loading...</span>
        ) : (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              status.mfaEnabled
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border border-gray-200 bg-gray-50 text-gray-600'
            }`}
          >
            {status.mfaEnabled ? 'Enabled' : 'Disabled'}
          </span>
        )}
      </div>

      {message ? (
        <div
          className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="space-y-3">
        {status.mfaEnabled ? (
          <>
            <p className="text-xs text-gray-600">
              You have {status.recoveryCodesRemaining} unused recovery code{status.recoveryCodesRemaining === 1 ? '' : 's'}.
            </p>

            <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-700">Regenerate recovery codes</p>
              <Input
                value={regenerateCode}
                onChange={(e) => setRegenerateCode(e.target.value)}
                placeholder="Enter current 6-digit authenticator code"
                inputMode="numeric"
                maxLength={6}
              />
              <Button type="button" onClick={() => void regenerateRecoveryCodes()} disabled={working || regenerateCode.trim().length < 6}>
                {working ? 'Generating...' : 'Generate new recovery codes'}
              </Button>
            </div>

            <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs font-medium text-rose-800">Disable MFA</p>
              <Input
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                placeholder="Enter current 6-digit authenticator code"
                inputMode="numeric"
                maxLength={6}
              />
              <Button
                type="button"
                variant="destructive"
                onClick={() => void disableMfa()}
                disabled={working || disableCode.trim().length < 6}
              >
                {working ? 'Disabling...' : 'Disable MFA'}
              </Button>
            </div>
          </>
        ) : (
          <>
            {!setupSecret ? (
              <Button type="button" onClick={() => void beginSetup()} disabled={working || loadingStatus}>
                {working ? 'Starting setup...' : 'Set up MFA'}
              </Button>
            ) : (
              <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-700">Authenticator setup</p>
                <p className="text-xs text-gray-600">
                  Use this secret in your authenticator app:
                </p>
                <code className="block break-all rounded bg-white px-2 py-1 text-xs text-gray-800">{setupSecret.base32Secret}</code>
                <p className="text-[11px] text-gray-500 break-all">URI: {setupSecret.otpauthUri}</p>
                <Input
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value)}
                  placeholder="Enter 6-digit code from authenticator app"
                  inputMode="numeric"
                  maxLength={6}
                />
                <div className="flex gap-2">
                  <Button type="button" onClick={() => void confirmSetup()} disabled={working || setupCode.trim().length < 6}>
                    {working ? 'Verifying...' : 'Enable MFA'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSetupSecret(null);
                      setSetupCode('');
                    }}
                    disabled={working}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {hasFreshRecoveryCodes ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-800">Save these recovery codes now</p>
            <p className="mt-1 text-[11px] text-amber-700">
              Each code can be used only once to sign in when you lose authenticator access.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {recoveryCodes.map((code) => (
                <code key={code} className="rounded bg-white px-2 py-1 text-xs text-gray-800">
                  {code}
                </code>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
