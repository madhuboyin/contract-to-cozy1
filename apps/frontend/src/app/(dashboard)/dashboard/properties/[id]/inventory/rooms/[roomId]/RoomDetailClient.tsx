// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/rooms/[roomId]/RoomDetailClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Package, Sparkles } from 'lucide-react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';

import {
  createRoomChecklistItem,
  getDraftsCsvExportUrl,
  getRoomInsights,
  getRoomTimeline,
  listInventoryRooms,
  listRoomChecklistItems,
  listRoomScanSessions,
  updateInventoryRoomProfile,
  type RoomChecklistItemDTO,
} from '../../../../../inventory/inventoryApi';

import AnimatedTabPanel from '@/components/rooms/AnimatedTabPanel';
import QuickInsightsPanel, { type RoomInsight } from '@/components/rooms/QuickInsightsPanel';
import RoomChecklistPanel from '@/components/rooms/RoomChecklistPanel';
import RoomProfileForm from '@/components/rooms/RoomProfileForm';
import RoomTimeline from '@/components/rooms/RoomTimeline';
import ScanHistoryCollapsible from '@/components/rooms/ScanHistoryCollapsible';
import RoomScanModal from '@/app/(dashboard)/dashboard/components/inventory/RoomScanModal';
import { getHealthOverlay, getRoomConfig, getScoreColorHex, getStatusColor, getStatusLabel } from '@/components/rooms/roomVisuals';
import { humanizeLabel } from '@/lib/utils/string';

type Tab = 'profile' | 'checklist' | 'timeline';

type RoomBase =
  | 'KITCHEN'
  | 'LIVING'
  | 'BEDROOM'
  | 'BATHROOM'
  | 'DINING'
  | 'LAUNDRY'
  | 'GARAGE'
  | 'OFFICE'
  | 'BASEMENT'
  | 'OTHER';

type BedroomKind = 'MASTER' | 'KIDS' | 'GUEST' | null;

type RoomTimelineEventDTO = {
  type: 'TASK' | 'INCIDENT';
  id: string;
  title: string;
  status: string;
  at: string;
  meta?: any;
};

function normalizeBedroomKind(value: any): BedroomKind {
  if (value === 'MASTER' || value === 'KIDS' || value === 'GUEST') return value;
  return null;
}

function resolveRoomBaseFromType(type?: string | null): RoomBase | null {
  if (!type) return null;
  switch (type) {
    case 'KITCHEN':
      return 'KITCHEN';
    case 'LIVING_ROOM':
      return 'LIVING';
    case 'BEDROOM':
      return 'BEDROOM';
    case 'BATHROOM':
      return 'BATHROOM';
    case 'DINING':
      return 'DINING';
    case 'LAUNDRY':
      return 'LAUNDRY';
    case 'GARAGE':
      return 'GARAGE';
    case 'OFFICE':
      return 'OFFICE';
    case 'BASEMENT':
      return 'BASEMENT';
    default:
      return 'OTHER';
  }
}

function resolveRoomBaseFromName(name: string): RoomBase {
  const text = (name || '').toLowerCase();

  if (text.includes('kitchen')) return 'KITCHEN';
  if (text.includes('living') || text.includes('family') || text.includes('great')) return 'LIVING';
  if (text.includes('bed') || text.includes('master') || text.includes('guest') || text.includes('kids') || text.includes('nursery')) return 'BEDROOM';
  if (text.includes('dining') || text.includes('breakfast') || text.includes('eat')) return 'DINING';
  if (text.includes('laundry') || text.includes('utility') || text.includes('washer') || text.includes('dryer')) return 'LAUNDRY';
  if (text.includes('garage')) return 'GARAGE';
  if (text.includes('office') || text.includes('study') || text.includes('den')) return 'OFFICE';
  if (text.includes('bath') || text.includes('toilet') || text.includes('powder') || text.includes('wc')) return 'BATHROOM';
  if (text.includes('basement') || text.includes('cellar') || text.includes('lower level') || text.includes('lower-level')) return 'BASEMENT';

  return 'OTHER';
}

function resolveRoomBase(room: any): RoomBase {
  const byType = resolveRoomBaseFromType(room?.type);
  if (byType) return byType;
  return resolveRoomBaseFromName(room?.name || '');
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

const PROFILE_COMPLETION_KEYS: Record<RoomBase, string[]> = {
  KITCHEN: ['style', 'countertops', 'cabinets', 'ventHood', 'flooring'],
  LIVING: ['style', 'seatingCapacity', 'primaryUse', 'tvMount', 'lighting', 'flooring'],
  BEDROOM: ['style', 'bedroomKind', 'bedSize', 'nightLighting', 'flooring'],
  BATHROOM: ['style', 'bathroomType', 'showerType', 'exhaustFan', 'gfciPresent', 'flooring'],
  DINING: ['style', 'seatingCapacity', 'tableMaterial', 'lighting', 'flooring'],
  LAUNDRY: ['style', 'washerType', 'dryerType', 'ventingType', 'leakPan', 'floorDrain'],
  GARAGE: ['style', 'carCapacity', 'doorType', 'storageType', 'fireExtinguisherPresent'],
  OFFICE: ['style', 'primaryUse', 'monitorCount', 'cableManagement', 'ergonomicSetup', 'surgeProtection'],
  BASEMENT: ['style', 'basementType', 'humidityControl', 'sumpPump', 'floorDrain', 'egressWindow', 'flooring'],
  OTHER: ['style', 'flooring'],
};

function computeHealthScore(roomBase: RoomBase, profile: any, insights: any): number {
  const stats = insights?.stats || {};
  const itemCount = Number(stats.itemCount || 0);
  const docs = Number(stats.docsLinkedCount || 0);
  const gaps = Number(stats.coverageGapsCount || 0);

  let score = 55;
  score += Math.min(20, itemCount * 2);
  score += Math.min(20, docs * 5);
  score -= Math.min(30, gaps * 8);

  const missing = insights?.kitchen?.missingAppliances?.length || 0;
  if (roomBase === 'KITCHEN') score -= Math.min(20, missing * 6);

  const hint = insights?.livingRoom?.comfortScoreHint;
  if (roomBase === 'LIVING') {
    if (hint === 'HIGH') score += 6;
    if (hint === 'LOW') score -= 6;
  }

  const keys = PROFILE_COMPLETION_KEYS[roomBase] || [];
  const filled = keys.filter((key) => {
    const value = profile?.[key];
    return value !== null && value !== undefined && String(value).trim() !== '';
  }).length;

  if (keys.length > 0) {
    score += Math.min(8, Math.round((filled / keys.length) * 8));
  }

  if (roomBase === 'LAUNDRY') {
    if (profile?.leakPan === 'YES') score += 2;
    if (profile?.floorDrain === 'YES') score += 1;
    if (profile?.ventingType) score += 1;
  }

  if (roomBase === 'GARAGE') {
    if (profile?.fireExtinguisherPresent === 'YES') score += 3;
    if (profile?.doorType === 'AUTO') score += 1;
  }

  if (roomBase === 'OFFICE') {
    if (profile?.surgeProtection === 'YES') score += 3;
    if (profile?.ergonomicSetup === 'YES') score += 1;
    if (profile?.cableManagement) score += 1;
  }

  if (roomBase === 'BATHROOM') {
    if (profile?.exhaustFan === 'YES') score += 2;
    if (profile?.gfciPresent === 'YES') score += 2;
    if (profile?.shutoffAccessible === 'YES') score += 1;
  }

  if (roomBase === 'BASEMENT') {
    if (profile?.humidityControl && profile.humidityControl !== 'NONE') score += 3;
    if (profile?.sumpPump === 'YES') score += 2;
    if (profile?.floorDrain === 'YES') score += 1;
  }

  return clampScore(score);
}

function unwrapChecklist(raw: any): RoomChecklistItemDTO[] {
  const data = (raw as any)?.data ?? raw;
  return (Array.isArray(data) ? data : []).filter(Boolean);
}

function unwrapTimeline(raw: any): RoomTimelineEventDTO[] {
  if (Array.isArray(raw)) return raw as RoomTimelineEventDTO[];
  if (raw?.timeline && Array.isArray(raw.timeline)) return raw.timeline as RoomTimelineEventDTO[];
  if (raw?.data?.timeline && Array.isArray(raw.data.timeline)) return raw.data.timeline as RoomTimelineEventDTO[];
  return [];
}

function formatRelativeDate(dateString?: string | null): string {
  if (!dateString) return 'No events';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'No events';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

const STATUS_LABELS: Record<string, string> = {
  HEALTHY: 'Healthy',
  GOOD: 'Good',
  'NEEDS ATTENTION': 'Needs attention',
  NEEDS_ATTENTION: 'Needs attention',
  'AT RISK': 'At risk',
  AT_RISK: 'At risk',
  CRITICAL: 'Critical',
};

const staggerParent = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: 'easeOut' as const },
  },
};

export default function RoomDetailClient() {
  const params = useParams<{ id: string; roomId: string }>();
  const router = useRouter();

  const propertyId = params.id;
  const roomId = params.roomId;

  const [tab, setTab] = useState<Tab>('profile');
  const [room, setRoom] = useState<any>(null);
  const [profile, setProfile] = useState<Record<string, any>>({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [insights, setInsights] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [checklistPreview, setChecklistPreview] = useState<RoomChecklistItemDTO[]>([]);
  const [timelinePreview, setTimelinePreview] = useState<RoomTimelineEventDTO[]>([]);

  const [scanOpen, setScanOpen] = useState(false);
  const [scanSessions, setScanSessions] = useState<any[]>([]);
  const [scanSessionsLoading, setScanSessionsLoading] = useState(false);
  const [historySessionId, setHistorySessionId] = useState<string | null>(null);

  const roomBase = useMemo<RoomBase>(() => (room ? resolveRoomBase(room) : 'OTHER'), [room]);
  const bedroomKind = useMemo<BedroomKind>(() => normalizeBedroomKind(profile?.bedroomKind), [profile?.bedroomKind]);

  const healthScore = useMemo(() => computeHealthScore(roomBase, profile, insights), [roomBase, profile, insights]);

  const completionKeys = PROFILE_COMPLETION_KEYS[roomBase] || [];
  const profileFieldsTotal = completionKeys.length;
  const profileFieldsFilled = completionKeys.filter((key) => {
    const value = profile?.[key];
    return value !== null && value !== undefined && String(value).trim() !== '';
  }).length;
  const profileCompleteness = profileFieldsTotal > 0 ? Math.round((profileFieldsFilled / profileFieldsTotal) * 100) : 0;

  const pendingTaskCount = checklistPreview.filter((item) => item.status !== 'DONE').length;
  const lastEventDate = timelinePreview
    .slice()
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .at(0)?.at;

  const stats = insights?.stats || {};
  const itemCount = Number(stats.itemCount || 0);
  const docCount = Number(stats.docsLinkedCount || 0);
  const gapCount = Number(stats.coverageGapsCount || 0);

  const roomConfig = getRoomConfig(room?.type || roomBase);
  const RoomIcon = roomConfig.icon;
  const scoreColor = getScoreColorHex(healthScore);
  const statusLabelRaw = getStatusLabel(healthScore);
  const statusLabel = STATUS_LABELS[statusLabelRaw] ?? humanizeLabel(statusLabelRaw);
  const statusColor = getStatusColor(healthScore);

  async function loadRoom() {
    const rooms = await listInventoryRooms(propertyId);
    const currentRoom = rooms.find((candidate: any) => candidate.id === roomId);
    setRoom(currentRoom || null);
    setProfile((currentRoom as any)?.profile || {});
  }

  async function loadSummary() {
    setSummaryLoading(true);
    try {
      const data = await getRoomInsights(propertyId, roomId);
      setInsights((data as any)?.data ?? data);
    } catch {
      setInsights(null);
    } finally {
      setSummaryLoading(false);
    }
  }

  async function loadChecklistPreview() {
    try {
      const raw = await listRoomChecklistItems(propertyId, roomId);
      setChecklistPreview(unwrapChecklist(raw));
    } catch {
      setChecklistPreview([]);
    }
  }

  async function loadTimelinePreview() {
    try {
      const raw = await getRoomTimeline(propertyId, roomId);
      setTimelinePreview(unwrapTimeline(raw));
    } catch {
      setTimelinePreview([]);
    }
  }

  async function loadScanSessions() {
    setScanSessionsLoading(true);
    try {
      const sessions = await listRoomScanSessions(propertyId, roomId, 8);
      setScanSessions(Array.isArray(sessions) ? sessions : []);
    } catch {
      setScanSessions([]);
    } finally {
      setScanSessionsLoading(false);
    }
  }

  useEffect(() => {
    if (!propertyId || !roomId) return;

    void Promise.all([
      loadRoom(),
      loadSummary(),
      loadChecklistPreview(),
      loadTimelinePreview(),
      loadScanSessions(),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, roomId]);

  async function saveProfile(nextProfile: Record<string, any>) {
    setSavingProfile(true);
    try {
      await updateInventoryRoomProfile(propertyId, roomId, nextProfile);
      setProfile(nextProfile);
      await loadSummary();
    } finally {
      setSavingProfile(false);
    }
  }

  async function addInsightAsTask(insight: RoomInsight) {
    if (!insight.action) return;

    const title = insight.text.replace(/\.$/, '');
    const frequency = insight.frequency || 'ONCE';

    await createRoomChecklistItem(propertyId, roomId, {
      title,
      frequency,
    });

    await loadChecklistPreview();
  }

  function openMaintenanceComposer() {
    router.push(`/dashboard/maintenance?propertyId=${propertyId}`);
  }

  if (!room) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-black/10 p-4">Loading room...</div>
      </div>
    );
  }

  const tabMeta = {
    profile: {
      label: 'Profile',
      badge: profileCompleteness < 100 ? `${profileFieldsFilled}/${profileFieldsTotal} complete` : 'Complete',
      badgeColor: profileCompleteness === 100 ? 'text-emerald-600' : 'text-amber-500',
    },
    checklist: {
      label: 'Checklist',
      badge: pendingTaskCount > 0 ? `${pendingTaskCount} due` : 'All done',
      badgeColor: pendingTaskCount > 0 ? 'text-amber-500' : 'text-emerald-600',
    },
    timeline: {
      label: 'Timeline',
      badge: lastEventDate ? `Last: ${formatRelativeDate(lastEventDate)}` : 'No events',
      badgeColor: lastEventDate ? 'text-gray-500' : 'text-gray-400',
    },
  } as const;

  return (
    <motion.div
      className="space-y-4 p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-6"
      variants={staggerParent}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        variants={staggerItem}
        className="overflow-hidden rounded-2xl border border-gray-200 bg-white/80 shadow-xl shadow-slate-900/5 backdrop-blur-md"
      >
        <header
          className={[
            'relative border-b px-6 py-5',
            `bg-gradient-to-br ${roomConfig.gradient}`,
            roomConfig.borderColor,
          ].join(' ')}
        >
          <div className={`pointer-events-none absolute inset-0 ${getHealthOverlay(healthScore)}`} />

          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-4">
              <div className={`rounded-2xl border bg-white/70 p-3 shadow-sm backdrop-blur-sm ${roomConfig.borderColor}`}>
                <RoomIcon className={`h-6 w-6 ${roomConfig.iconColor}`} />
              </div>

              <div>
                <h1 className="text-2xl font-display font-bold text-gray-900">{room.name}</h1>
                <p className="mt-0.5 text-sm text-gray-500">
                  {itemCount} items tracked · Profile {profileCompleteness}% complete · {pendingTaskCount} task
                  {pendingTaskCount !== 1 ? 's' : ''} this month
                </p>
              </div>
            </div>

            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
              <button
                type="button"
                onClick={() => router.push(`/dashboard/properties/${propertyId}/inventory/rooms`)}
                className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white/70 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Rooms
              </button>

              <button
                type="button"
                onClick={() => router.push(`/dashboard/properties/${propertyId}/rooms/${roomId}`)}
                className="inline-flex min-h-[42px] items-center justify-center rounded-lg border border-gray-200 bg-white/70 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800"
              >
                View room page
              </button>

              <button
                type="button"
                onClick={() => router.push(`/dashboard/properties/${propertyId}/inventory?roomId=${roomId}`)}
                className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white/70 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800"
              >
                <Package className="h-3.5 w-3.5" />
                Manage items
              </button>

              <button
                type="button"
                onClick={() => setScanOpen(true)}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-teal-500 bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-teal-600/20 transition-colors hover:bg-teal-700"
              >
                <Sparkles className="h-4 w-4" />
                AI Scan
              </button>
            </div>
          </div>
        </header>

        <div className="border-b border-gray-100 px-6 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="h-14 w-14 flex-shrink-0">
              <CircularProgressbar
                value={healthScore}
                text={`${healthScore}`}
                strokeWidth={9}
                styles={buildStyles({
                  textSize: '28px',
                  textColor: '#111827',
                  pathColor: scoreColor,
                  trailColor: '#e5e7eb',
                  pathTransitionDuration: 0.6,
                })}
              />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Room Health</span>
                <span className={`text-sm font-bold ${statusColor}`}>{statusLabel}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-400">
                {itemCount} items · {docCount} docs · {gapCount} gaps
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">Profile</span>
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-teal-500 transition-all duration-700" style={{ width: `${profileCompleteness}%` }} />
              </div>
              <span className="w-10 text-right text-xs font-semibold text-gray-700">{profileCompleteness}%</span>
            </div>
          </div>
        </div>

        <div className="border-b border-gray-100 bg-white px-6 py-4">
          <div className="flex w-fit items-center gap-1 rounded-xl bg-gray-100 p-1">
            {(['profile', 'checklist', 'timeline'] as const).map((tabKey) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setTab(tabKey)}
                className={[
                  'flex min-w-[120px] flex-col items-center rounded-lg px-5 py-2 transition-all duration-150 hover:scale-[1.02]',
                  tab === tabKey ? 'bg-white shadow-sm' : 'hover:bg-white/60',
                ].join(' ')}
              >
                <span className={`text-sm font-semibold ${tab === tabKey ? 'text-gray-900' : 'text-gray-500'}`}>{tabMeta[tabKey].label}</span>
                <span className={`text-[10px] font-medium ${tab === tabKey ? tabMeta[tabKey].badgeColor : 'text-gray-400'}`}>
                  {tabMeta[tabKey].badge}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-gray-50 px-6 pb-6 pt-4">
          <AnimatedTabPanel tabKey={tab}>
            {tab === 'profile' ? (
              <motion.div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]" variants={staggerParent} initial="hidden" animate="visible">
                <motion.div variants={staggerItem}>
                  <RoomProfileForm
                    profile={profile}
                    roomType={roomBase}
                    saving={savingProfile}
                    onChange={setProfile}
                    onSave={saveProfile}
                  />
                </motion.div>

                <motion.div variants={staggerItem} className="lg:sticky lg:top-4 lg:self-start">
                  <QuickInsightsPanel roomType={roomBase} profileData={profile} onAddInsightTask={addInsightAsTask} />
                </motion.div>
              </motion.div>
            ) : null}

            {tab === 'checklist' ? (
              <RoomChecklistPanel
                propertyId={propertyId}
                roomId={roomId}
                roomType={roomBase}
                bedroomKind={bedroomKind}
                onMutated={loadChecklistPreview}
              />
            ) : null}

            {tab === 'timeline' ? (
              <RoomTimeline
                propertyId={propertyId}
                roomId={roomId}
                roomType={roomBase}
                onAddEvent={openMaintenanceComposer}
              />
            ) : null}
          </AnimatedTabPanel>

          <ScanHistoryCollapsible
            scans={scanSessions}
            loading={scanSessionsLoading}
            onRefresh={loadScanSessions}
            onReopen={(sessionId) => {
              setHistorySessionId(sessionId);
              setScanOpen(true);
            }}
            getExportUrl={(sessionId) => getDraftsCsvExportUrl({ propertyId, scanSessionId: sessionId })}
            onStartScan={() => setScanOpen(true)}
          />
        </div>
      </motion.div>

      <RoomScanModal
        open={scanOpen}
        onClose={() => {
          setScanOpen(false);
          setHistorySessionId(null);
          void loadScanSessions();
        }}
        propertyId={propertyId}
        roomId={roomId}
        roomName={room?.name}
        initialSessionId={historySessionId}
      />

      {summaryLoading ? <p className="px-1 text-xs text-gray-500">Updating room data...</p> : null}
    </motion.div>
  );
}
