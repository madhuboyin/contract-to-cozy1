// apps/frontend/src/app/(dashboard)/dashboard/components/verification/HomeHealthNudge.tsx
'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Shield, Camera, Edit3, ArrowRight, AlertCircle, Home, Droplets, Flame } from 'lucide-react';
import { api } from '@/lib/api/client';
import {
  getHomeHealthNudge,
  verifyItem,
  getMissingFields,
  StreakUpdateDTO,
} from './verificationApi';
import LabelOcrModal from '../inventory/LabelOcrModal';
import InventoryItemDrawer from '../inventory/InventoryItemDrawer';
import { InsuranceGapNudge } from './InsuranceGapNudge';
import { HomeEquityNudge } from './HomeEquityNudge';
import { useSnoozeManager } from './useSnoozeManager';
import {
  ocrLabelToDraft,
  confirmInventoryDraft,
  getInventoryItem,
  listInventoryRooms,
} from '../../inventory/inventoryApi';
import { InventoryItem, InventoryRoom } from '@/types';
import { useToast } from '@/components/ui/use-toast';

interface HomeHealthNudgeProps {
  propertyId: string | undefined;
}

const HOME_NUDGE_QUERY_KEY = 'home-health-nudge';
const INSURANCE_PROTECTION_GAP_QUERY_KEY = 'insurance-protection-gap';
const HOME_EQUITY_QUERY_KEY = 'home-equity-summary';
const PROPERTY_QUERY_KEY = 'property';
const PROPERTIES_QUERY_KEY = 'properties';
const CONFETTI_SCRIPT_ID = 'ctc-canvas-confetti';
const CONFETTI_CDN_SRC =
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';

export function HomeHealthNudge({ propertyId }: HomeHealthNudgeProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { getExclusionList, snoozeNudge, snoozeVersion } = useSnoozeManager();
  const [labelOpen, setLabelOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [resilienceChoiceSaving, setResilienceChoiceSaving] = useState<string | null>(null);
  const [utilitySaving, setUtilitySaving] = useState(false);
  const [insuranceUploading, setInsuranceUploading] = useState(false);
  const [insuranceConfirming, setInsuranceConfirming] = useState(false);
  const [insuranceExtracted, setInsuranceExtracted] = useState<{
    personalPropertyLimitCents: number | null;
    deductibleCents: number | null;
  } | null>(null);
  const [equityPriceDollars, setEquityPriceDollars] = useState('');
  const [equityPurchaseDate, setEquityPurchaseDate] = useState('');
  const [equitySaving, setEquitySaving] = useState(false);
  const [showSuccessFlash, setShowSuccessFlash] = useState(false);
  const insuranceFileRef = useRef<HTMLInputElement | null>(null);

  // Edit drawer state (asset verification path)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<InventoryItem | null>(null);
  const [drawerRooms, setDrawerRooms] = useState<InventoryRoom[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const { data: nudge, isLoading } = useQuery({
    queryKey: [HOME_NUDGE_QUERY_KEY, propertyId, snoozeVersion],
    queryFn: () => getHomeHealthNudge(propertyId!, getExclusionList()),
    enabled: !!propertyId,
    staleTime: 60 * 1000,
  });

  const invalidateAfterNudgeAction = useCallback(async () => {
    if (!propertyId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [HOME_NUDGE_QUERY_KEY, propertyId] }),
      queryClient.invalidateQueries({ queryKey: [PROPERTY_QUERY_KEY, propertyId] }),
      queryClient.invalidateQueries({ queryKey: [PROPERTIES_QUERY_KEY] }),
    ]);
  }, [propertyId, queryClient]);

  const triggerMilestoneCelebration = useCallback(async (multiplier: number) => {
    async function getConfettiFn() {
      if (typeof window === 'undefined') return null;
      const existing = (window as any).confetti;
      if (typeof existing === 'function') return existing;

      await new Promise<void>((resolve, reject) => {
        const existingScript = document.getElementById(CONFETTI_SCRIPT_ID) as HTMLScriptElement | null;
        if (existingScript) {
          existingScript.addEventListener('load', () => resolve(), { once: true });
          existingScript.addEventListener(
            'error',
            () => reject(new Error('Failed to load confetti script')),
            { once: true }
          );
          return;
        }

        const script = document.createElement('script');
        script.id = CONFETTI_SCRIPT_ID;
        script.src = CONFETTI_CDN_SRC;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load confetti script'));
        document.head.appendChild(script);
      });

      return typeof (window as any).confetti === 'function' ? (window as any).confetti : null;
    }

    try {
      const confetti = await getConfettiFn();
      if (!confetti) throw new Error('Confetti function unavailable');
      confetti({
        particleCount: 180,
        spread: 100,
        startVelocity: 45,
        origin: { y: 0.6 },
      });
    } catch (err) {
      console.error('Confetti effect unavailable:', err);
    }

    toast({
      title: 'Streak Milestone!',
      description: `Your Home Health Multiplier is now ${multiplier.toFixed(2)}x.`,
    });
  }, [toast]);

  const triggerSuccessFeedback = useCallback(
    async (streak: StreakUpdateDTO | null | undefined) => {
      setShowSuccessFlash(true);
      window.setTimeout(() => setShowSuccessFlash(false), 700);

      if (!streak) return;
      if (!streak.milestoneReached) return;
      await triggerMilestoneCelebration(streak.bonusMultiplier);
    },
    [triggerMilestoneCelebration]
  );

  const deriveStreakFromPatchedProperty = useCallback(
    (patchedProperty: any): StreakUpdateDTO | null => {
      const nextStreak = Number(patchedProperty?.currentStreak);
      const nextLongest = Number(patchedProperty?.longestStreak);
      const nextBonus = Number(patchedProperty?.bonusMultiplier);
      const previousStreak = Number(nudge?.currentStreak ?? 0);

      if (!Number.isFinite(nextStreak) || !Number.isFinite(nextLongest) || !Number.isFinite(nextBonus)) {
        return null;
      }

      return {
        currentStreak: nextStreak,
        longestStreak: nextLongest,
        bonusMultiplier: nextBonus,
        lastActivityDate: typeof patchedProperty?.lastActivityDate === 'string'
          ? patchedProperty.lastActivityDate
          : null,
        milestoneReached: nextStreak > previousStreak && nextStreak % 3 === 0,
      };
    },
    [nudge?.currentStreak]
  );

  const streakBadge = (
    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
      <Flame className="h-3.5 w-3.5" />
      {nudge ? `🔥 ${nudge.currentStreak} Task Streak` : '🔥 0 Task Streak'}
    </div>
  );

  useEffect(() => {
    if (nudge?.type !== 'INSURANCE') {
      setInsuranceExtracted(null);
      setInsuranceUploading(false);
      setInsuranceConfirming(false);
    }
  }, [nudge?.type]);

  useEffect(() => {
    if (nudge?.type !== 'EQUITY') {
      setEquityPriceDollars('');
      setEquityPurchaseDate('');
      setEquitySaving(false);
      return;
    }

    setEquityPriceDollars(
      typeof nudge.purchasePriceCents === 'number' ? String(nudge.purchasePriceCents / 100) : ''
    );
    setEquityPurchaseDate(nudge.purchaseDate ? nudge.purchaseDate.slice(0, 10) : '');
  }, [nudge]);

  const handleSnooze = useCallback(async () => {
    if (!propertyId || !nudge?.id) return;
    snoozeNudge(nudge.id);
    await invalidateAfterNudgeAction();
  }, [propertyId, nudge?.id, invalidateAfterNudgeAction, snoozeNudge]);

  const handleOcrCapture = useCallback(
    async (file: File) => {
      if (!propertyId || nudge?.type !== 'ASSET') return;
      setOcrLoading(true);
      try {
        const draft = await ocrLabelToDraft(propertyId, file);
        if (draft?.draftId) {
          await confirmInventoryDraft(propertyId, draft.draftId);
        }
        const verifyResponse = await verifyItem(propertyId, nudge.item.id, { source: 'OCR_LABEL' });
        await triggerSuccessFeedback(verifyResponse.data?.streak);
        await Promise.all([
          invalidateAfterNudgeAction(),
          queryClient.invalidateQueries({
            queryKey: [HOME_EQUITY_QUERY_KEY, propertyId],
          }),
        ]);
      } catch (err) {
        console.error('OCR verification failed:', err);
      } finally {
        setOcrLoading(false);
        setLabelOpen(false);
      }
    },
    [propertyId, nudge, queryClient, invalidateAfterNudgeAction, triggerSuccessFeedback]
  );

  const handleAddDetails = useCallback(async () => {
    if (!propertyId || nudge?.type !== 'ASSET') return;
    setDrawerLoading(true);
    try {
      const [item, rooms] = await Promise.all([
        getInventoryItem(propertyId, nudge.item.id),
        listInventoryRooms(propertyId),
      ]);
      setDrawerItem(item);
      setDrawerRooms(rooms);
      setDrawerOpen(true);
    } catch (err) {
      console.error('Failed to load item details:', err);
    } finally {
      setDrawerLoading(false);
    }
  }, [propertyId, nudge]);

  const handleDrawerSaved = useCallback(async () => {
    if (propertyId && drawerItem?.id) {
      try {
        const verifyResponse = await verifyItem(propertyId, drawerItem.id, { source: 'MANUAL' });
        await triggerSuccessFeedback(verifyResponse.data?.streak);
      } catch (err) {
        console.error('Failed to mark item verified:', err);
      }
    }
    setDrawerOpen(false);
    setDrawerItem(null);
    await Promise.all([
      invalidateAfterNudgeAction(),
      queryClient.invalidateQueries({
        queryKey: [HOME_EQUITY_QUERY_KEY, propertyId],
      }),
    ]);
  }, [propertyId, drawerItem, invalidateAfterNudgeAction, queryClient, triggerSuccessFeedback]);

  const handleResilienceChoice = useCallback(
    async (value: boolean | null, choiceKey: string) => {
      if (!propertyId) return;
      setResilienceChoiceSaving(choiceKey);
      try {
        const response = await api.patch(`/api/properties/${propertyId}`, {
          hasSumpPumpBackup: value,
          isResilienceVerified: true,
        });
        await triggerSuccessFeedback(deriveStreakFromPatchedProperty(response.data));
        await invalidateAfterNudgeAction();
      } catch (err) {
        console.error('Failed to save resilience answer:', err);
      } finally {
        setResilienceChoiceSaving(null);
      }
    },
    [propertyId, triggerSuccessFeedback, deriveStreakFromPatchedProperty, invalidateAfterNudgeAction]
  );

  const handleUtilitySelect = useCallback(
    async (value: string) => {
      if (!propertyId || !value) return;
      setUtilitySaving(true);
      try {
        const payload =
          value === '__NOT_SURE__'
            ? { primaryHeatingFuel: null, isUtilityVerified: true }
            : { primaryHeatingFuel: value, isUtilityVerified: true };
        const response = await api.patch(`/api/properties/${propertyId}`, payload);
        await triggerSuccessFeedback(deriveStreakFromPatchedProperty(response.data));
        await invalidateAfterNudgeAction();
      } catch (err) {
        console.error('Failed to save utility setup:', err);
      } finally {
        setUtilitySaving(false);
      }
    },
    [propertyId, triggerSuccessFeedback, deriveStreakFromPatchedProperty, invalidateAfterNudgeAction]
  );

  const handleInsuranceFileSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!propertyId || nudge?.type !== 'INSURANCE') return;
      const file = event.target.files?.[0];
      if (!file) return;

      setInsuranceUploading(true);
      try {
        const res = await api.extractInsuranceDeclaration(propertyId, nudge.policyId, file);
        if (res.success) {
          setInsuranceExtracted({
            personalPropertyLimitCents: res.data.extracted.personalPropertyLimitCents,
            deductibleCents: res.data.extracted.deductibleCents,
          });
        }
      } catch (err) {
        console.error('Failed to process insurance OCR:', err);
      } finally {
        setInsuranceUploading(false);
        event.target.value = '';
      }
    },
    [propertyId, nudge]
  );

  const handleInsuranceConfirm = useCallback(async () => {
    if (!propertyId || nudge?.type !== 'INSURANCE' || !insuranceExtracted) return;

    setInsuranceConfirming(true);
    try {
      const response = await api.confirmInsuranceDeclaration(propertyId, nudge.policyId, {
        personalPropertyLimitCents: insuranceExtracted.personalPropertyLimitCents,
        deductibleCents: insuranceExtracted.deductibleCents,
      });
      const streak = response.success ? response.data.streak : null;
      await triggerSuccessFeedback(streak);
      setInsuranceExtracted(null);
      await Promise.all([
        invalidateAfterNudgeAction(),
        queryClient.invalidateQueries({
          queryKey: [INSURANCE_PROTECTION_GAP_QUERY_KEY, propertyId],
        }),
      ]);
    } catch (err) {
      console.error('Failed to confirm insurance OCR values:', err);
    } finally {
      setInsuranceConfirming(false);
    }
  }, [propertyId, nudge, insuranceExtracted, invalidateAfterNudgeAction, queryClient, triggerSuccessFeedback]);

  const handleEquitySubmit = useCallback(async () => {
    if (!propertyId || nudge?.type !== 'EQUITY') return;
    const normalizedPrice = Number(equityPriceDollars);

    if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0 || !equityPurchaseDate) {
      return;
    }

    setEquitySaving(true);
    try {
      const purchasePriceCents = Math.round(normalizedPrice * 100);
      const response = await api.patch(`/api/properties/${propertyId}`, {
        purchasePriceCents,
        purchaseDate: equityPurchaseDate,
        isEquityVerified: true,
      });
      await triggerSuccessFeedback(deriveStreakFromPatchedProperty(response.data));
      await Promise.all([
        invalidateAfterNudgeAction(),
        queryClient.invalidateQueries({
          queryKey: [HOME_EQUITY_QUERY_KEY, propertyId],
        }),
      ]);
    } catch (err) {
      console.error('Failed to save equity baseline:', err);
    } finally {
      setEquitySaving(false);
    }
  }, [
    propertyId,
    nudge,
    equityPriceDollars,
    equityPurchaseDate,
    invalidateAfterNudgeAction,
    queryClient,
    triggerSuccessFeedback,
    deriveStreakFromPatchedProperty,
  ]);

  if (isLoading || !propertyId) return null;

  if (!nudge) {
    return (
      <div className="w-full rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-100 p-2 shrink-0">
            <Shield className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">You&apos;re all caught up</h3>
            <p className="mt-1 text-sm text-gray-700">
              Keep improving your insights by verifying more assets or updating your equity details.
            </p>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Link
                href={`/dashboard/properties/${propertyId}/inventory`}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-blue-300 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
              >
                Verify Assets
              </Link>
              <Link
                href={`/dashboard/properties/${propertyId}/edit`}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Update Property Details
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (nudge.type === 'RESILIENCE') {
    return (
      <div
        className={`
          w-full rounded-xl shadow-sm
          bg-gradient-to-r from-cyan-50 to-blue-50
          border-2 border-cyan-200 border-l-4 border-l-cyan-600
          px-5 py-4
          hover:shadow-md transition-shadow
          ${showSuccessFlash ? 'ring-2 ring-emerald-300 animate-pulse' : ''}
        `}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 bg-cyan-100 rounded-lg shrink-0">
            <Droplets className="w-5 h-5 text-cyan-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">{nudge.title}</h3>
            {streakBadge}
            <p className="text-sm text-gray-700 mt-1">{nudge.description}</p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                onClick={() => handleResilienceChoice(true, 'yes')}
                disabled={!!resilienceChoiceSaving}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-cyan-300 px-3 py-1.5 text-sm font-medium text-cyan-700 transition-colors hover:bg-cyan-100 disabled:opacity-50"
              >
                {resilienceChoiceSaving === 'yes' ? 'Saving...' : 'Yes'}
              </button>
              <button
                onClick={() => handleResilienceChoice(false, 'no')}
                disabled={!!resilienceChoiceSaving}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-cyan-300 px-3 py-1.5 text-sm font-medium text-cyan-700 transition-colors hover:bg-cyan-100 disabled:opacity-50"
              >
                {resilienceChoiceSaving === 'no' ? 'Saving...' : 'No'}
              </button>
              <button
                onClick={() => handleResilienceChoice(null, 'not-sure')}
                disabled={!!resilienceChoiceSaving}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                {resilienceChoiceSaving === 'not-sure' ? 'Saving...' : 'Not Sure'}
              </button>
              <button
                type="button"
                onClick={() => void handleSnooze()}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Snooze 24h
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (nudge.type === 'UTILITY') {
    return (
      <div
        className={`
          w-full rounded-xl shadow-sm
          bg-gradient-to-r from-amber-50 to-orange-50
          border-2 border-amber-200 border-l-4 border-l-amber-600
          px-5 py-4
          hover:shadow-md transition-shadow
          ${showSuccessFlash ? 'ring-2 ring-emerald-300 animate-pulse' : ''}
        `}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-100 rounded-lg shrink-0">
            <Home className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">{nudge.title}</h3>
            {streakBadge}
            <p className="text-sm text-gray-700 mt-1">{nudge.description}</p>
            <div className="mt-3">
              <select
                className="min-h-[44px] w-full max-w-sm rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60"
                defaultValue=""
                disabled={utilitySaving}
                onChange={(event) => void handleUtilitySelect(event.target.value)}
              >
                <option value="" disabled>
                  Select heating fuel
                </option>
                {nudge.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                <option value="__NOT_SURE__">Not sure</option>
              </select>
              <button
                type="button"
                onClick={() => void handleSnooze()}
                className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Snooze 24h
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (nudge.type === 'INSURANCE') {
    return (
      <>
        <input
          ref={insuranceFileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleInsuranceFileSelected}
        />
        <InsuranceGapNudge
          nudge={nudge}
          insuranceUploading={insuranceUploading}
          insuranceConfirming={insuranceConfirming}
          insuranceExtracted={insuranceExtracted}
          onUploadClick={() => insuranceFileRef.current?.click()}
          onConfirm={() => void handleInsuranceConfirm()}
          onSnooze={() => void handleSnooze()}
          showSuccessFlash={showSuccessFlash}
        />
      </>
    );
  }

  if (nudge.type === 'EQUITY') {
    return (
      <HomeEquityNudge
        title={nudge.title}
        description={nudge.description}
        purchasePriceDollars={equityPriceDollars}
        purchaseDate={equityPurchaseDate}
        isSaving={equitySaving}
        currentStreak={nudge.currentStreak}
        showSuccessFlash={showSuccessFlash}
        onPurchasePriceChange={setEquityPriceDollars}
        onPurchaseDateChange={setEquityPurchaseDate}
        onSubmit={() => void handleEquitySubmit()}
        onSnooze={() => void handleSnooze()}
      />
    );
  }

  const { item, totalUnverified, totalItems } = nudge;
  const verified = totalItems - totalUnverified;
  const percentVerified = totalItems > 0 ? Math.round((verified / totalItems) * 100) : 0;
  const missingFields = getMissingFields(item);

  return (
    <>
      <div
        className={`
          w-full rounded-xl shadow-sm
          bg-gradient-to-r from-blue-50 to-indigo-50
          border-2 border-blue-200 border-l-4 border-l-blue-500
          px-5 py-4
          hover:shadow-md transition-shadow
          ${showSuccessFlash ? 'ring-2 ring-emerald-300 animate-pulse' : ''}
        `}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg shrink-0">
            <Shield className="w-5 h-5 text-blue-600" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">
              Complete details for {item.name}
            </h3>
            {streakBadge}

            <p className="text-sm text-gray-600 mt-0.5">
              {nudge.description}
            </p>

            {missingFields.length > 0 && (
              <div className="mt-2 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">
                  <span className="font-medium">Missing:</span>{' '}
                  {missingFields.join(', ')}
                </p>
              </div>
            )}

            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{verified} of {totalItems} items verified</span>
                <span>{percentVerified}%</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${percentVerified}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                onClick={() => setLabelOpen(true)}
                disabled={ocrLoading}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-blue-300 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                {ocrLoading ? 'Scanning...' : 'Scan Label'}
              </button>

              <button
                onClick={handleAddDetails}
                disabled={drawerLoading}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50"
              >
                <Edit3 className="w-4 h-4" />
                {drawerLoading ? 'Loading...' : 'Add Missing Details'}
              </button>

              <button
                type="button"
                onClick={() => void handleSnooze()}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Snooze 24h
              </button>

              {totalUnverified > 1 && (
                <Link
                  href={`/dashboard/properties/${propertyId}/inventory`}
                  className="inline-flex items-center gap-1 ml-auto text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  View all {totalUnverified} unverified
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <LabelOcrModal
        open={labelOpen}
        onClose={() => setLabelOpen(false)}
        onCaptured={handleOcrCapture}
      />

      <InventoryItemDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerItem(null);
        }}
        propertyId={propertyId}
        rooms={drawerRooms}
        initialItem={drawerItem}
        onSaved={() => void handleDrawerSaved()}
      />
    </>
  );
}
