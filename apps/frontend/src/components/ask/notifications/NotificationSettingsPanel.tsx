'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import type { AskNotificationCategorySetting, AskNotificationSettings } from '@/features/ask/types';
import { askFailureCode, askServiceIsPaused } from '../workspace/support';
import { SNOOZE_CHOICES, formatNotificationDate } from './notificationPresentation';

/**
 * The central notification settings (FR-NOTIF-003/004): what each channel does, per-category email on, muted or snoozed, quiet hours,
 * the consent a financial category needs, and where each tool's own settings live. The server decides what is allowed and delivered;
 * this only reads and sends the person's choices, and shows the server's refusal when one is not allowed.
 */
export function NotificationSettingsPanel({ propertyId }: { propertyId: string | undefined }) {
  const router = useRouter();
  const [settings, setSettings] = useState<AskNotificationSettings | null>(null);
  const [status, setStatus] = useState<'LOADING' | 'READY' | 'ERROR' | 'PAUSED'>('LOADING');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quiet, setQuiet] = useState({ start: '', end: '' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('LOADING');
    api.getAskNotificationSettings({ signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (!response.success || !response.data) throw new Error(response.message || 'Could not load settings.');
        setSettings(response.data);
        setQuiet({ start: response.data.quietHours.start ?? '', end: response.data.quietHours.end ?? '' });
        setStatus('READY');
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setStatus(askServiceIsPaused(caught) ? 'PAUSED' : 'ERROR');
      });
    return () => controller.abort();
  }, [attempt]);

  const replaceCategory = (next: AskNotificationCategorySetting) => setSettings((current) => (current ? { ...current, categories: current.categories.map((entry) => (entry.category === next.category ? next : entry)) } : current));

  const run = async (key: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (caught) {
      const code = askFailureCode(caught);
      setError(caught instanceof Error && code ? caught.message : 'That could not be saved. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const chooseMode = (category: AskNotificationCategorySetting, value: string) => run(category.category, async () => {
    const snooze = SNOOZE_CHOICES.find((choice) => choice.id === value);
    const update = snooze
      ? { mode: 'SNOOZED' as const, snoozedUntil: new Date(Date.now() + snooze.days * 86_400_000).toISOString() }
      : { mode: value as 'ON' | 'MUTED' };
    const response = await api.updateAskNotificationCategory(category.category, update);
    if (!response.success || !response.data) throw new Error(response.message || 'Could not change that.');
    replaceCategory(response.data);
  });

  const toggleConsent = (category: AskNotificationCategorySetting) => run(`consent:${category.category}`, async () => {
    const response = await api.setAskNotificationConsent(category.category, !category.consent.granted);
    if (!response.success || !response.data) throw new Error(response.message || 'Could not change that.');
    setAttempt((value) => value + 1);
  });

  const saveQuiet = () => run('quiet', async () => {
    const blank = !quiet.start && !quiet.end;
    const response = await api.updateAskNotificationQuietHours({ start: blank ? null : quiet.start, end: blank ? null : quiet.end, timezone: settings?.quietHours.timezone && settings.quietHours.timezone !== 'UTC' ? settings.quietHours.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
    if (!response.success || !response.data) throw new Error(response.message || 'Could not save quiet hours.');
    setSettings((current) => (current ? { ...current, quietHours: response.data as AskNotificationSettings['quietHours'] } : current));
  });

  if (status === 'LOADING') return <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-5 py-6 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading settings…</div>;
  if (status === 'PAUSED') return <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">Settings are temporarily unavailable. Your choices are unchanged.</p>;
  if (status === 'ERROR' || !settings) return <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" role="status">Settings could not be loaded. <button type="button" onClick={() => setAttempt((value) => value + 1)} className="font-semibold underline">Try again</button></p>;

  return (
    <div className="space-y-6" data-notification-settings>
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}

      <section aria-labelledby="notif-channels-title">
        <h3 id="notif-channels-title" className="text-sm font-semibold text-slate-950">How you are notified</h3>
        <ul className="mt-2 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {settings.channels.map((channel) => (
            <li key={channel.channel} className="px-4 py-3 text-sm"><span className="font-semibold text-slate-950">{channel.channel === 'IN_APP' ? 'In the app' : 'Email'}</span><span className="ml-2 text-xs text-slate-500">{channel.configurable ? 'You choose' : 'Always on'}</span><p className="mt-1 text-slate-600">{channel.disclosure}</p></li>
          ))}
          {settings.unavailableChannels.map((channel) => <li key={channel.channel} className="px-4 py-3 text-sm text-slate-500"><span className="font-semibold">{channel.channel === 'PUSH' ? 'Push' : channel.channel === 'SMS' ? 'Text message' : 'WhatsApp'}</span>: {channel.reason}</li>)}
        </ul>
      </section>

      <section aria-labelledby="notif-quiet-title">
        <h3 id="notif-quiet-title" className="text-sm font-semibold text-slate-950">Quiet hours for email</h3>
        <p className="mt-1 text-sm text-slate-600">Email that is not urgent waits until quiet hours end. Leave both blank for none.</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-slate-600">Start<input type="time" value={quiet.start} onChange={(event) => setQuiet((current) => ({ ...current, start: event.target.value }))} className="mt-1 block min-h-11 rounded-xl border border-slate-300 px-3 text-sm font-normal text-slate-900" /></label>
          <label className="text-xs font-semibold text-slate-600">End<input type="time" value={quiet.end} onChange={(event) => setQuiet((current) => ({ ...current, end: event.target.value }))} className="mt-1 block min-h-11 rounded-xl border border-slate-300 px-3 text-sm font-normal text-slate-900" /></label>
          <button type="button" disabled={busy === 'quiet'} onClick={() => void saveQuiet()} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60">Save quiet hours</button>
        </div>
      </section>

      <section aria-labelledby="notif-categories-title">
        <h3 id="notif-categories-title" className="text-sm font-semibold text-slate-950">Email by kind of notification</h3>
        <ul className="mt-2 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {settings.categories.filter((category) => category.category !== 'ALL').map((category) => {
            const until = formatNotificationDate(category.email.snoozedUntil);
            const needsConsent = category.consent.required && !category.consent.granted;
            return (
              <li key={category.category} className="px-4 py-3" data-notification-category={category.category}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">{category.label}</p>
                    <p className="text-xs text-slate-600">{category.description}{category.email.mode === 'SNOOZED' && until ? ` Snoozed until ${until}.` : ''}</p>
                  </div>
                  {category.canPause ? (
                    <label className="shrink-0 text-xs font-semibold text-slate-600">
                      <span className="sr-only">Email for {category.label}</span>
                      <select aria-label={`Email for ${category.label}`} disabled={busy === category.category} value={category.email.mode === 'SNOOZED' ? 'SNOOZED' : category.email.mode} onChange={(event) => void chooseMode(category, event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900">
                        <option value="ON" disabled={needsConsent}>On</option>
                        <option value="MUTED">Muted</option>
                        {category.email.mode === 'SNOOZED' && <option value="SNOOZED" disabled>Snoozed</option>}
                        {SNOOZE_CHOICES.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
                      </select>
                    </label>
                  ) : <span className="shrink-0 text-xs font-semibold text-slate-600">Always sent</span>}
                </div>
                {category.consent.required && (
                  <div className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-700" data-consent-for={category.category}>
                    <p>{category.consent.disclosure}</p>
                    <button type="button" disabled={busy === `consent:${category.category}`} onClick={() => void toggleConsent(category)} className="mt-2 min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60">{category.consent.granted ? 'Withdraw my consent' : 'I agree to email for this'}</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="notif-tools-title">
        <h3 id="notif-tools-title" className="text-sm font-semibold text-slate-950">Settings that live in a tool</h3>
        <ul className="mt-2 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {settings.capabilitySettings.map((capability) => (
            <li key={capability.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="text-sm font-semibold text-slate-950">{capability.label}</p><p className="text-xs text-slate-600">{capability.description}</p></div>
              <button type="button" onClick={() => router.push(buildAskWorkspaceHref({ propertyId, question: capability.question, from: 'notification' }))} className="min-h-11 shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50">Open in Ask</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
