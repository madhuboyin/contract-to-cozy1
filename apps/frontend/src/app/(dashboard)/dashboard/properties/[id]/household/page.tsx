'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, UserPlus, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import type { HouseholdInvite, HouseholdMember, HouseholdNotificationPrefs } from '@/types';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import MemberList from '@/components/features/household/MemberList';
import InviteMemberSheet from '@/components/features/household/InviteMemberSheet';
import { formatRelativeTime, ROLE_LABELS } from '@/components/features/household/HouseholdUtils';

const NOTIF_PREFS: { key: keyof HouseholdNotificationPrefs; label: string }[] = [
  { key: 'notifyOnRiskChange', label: 'Risk level changes' },
  { key: 'notifyOnTaskDue', label: 'Tasks due' },
  { key: 'notifyOnTaskAssigned', label: 'Tasks assigned to me' },
  { key: 'notifyOnIncident', label: 'New incidents' },
  { key: 'notifyOnGuidanceUpdate', label: 'Guidance updates' },
  { key: 'notifyOnHomeEvent', label: 'Home events' },
  { key: 'notifyOnAlerts', label: 'Smart home alerts' },
];

export default function HouseholdPage() {
  const { id: propertyId } = useParams<{ id: string }>();
  const router = useRouter();

  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [invites, setInvites] = useState<HouseholdInvite[]>([]);
  const [myMembership, setMyMembership] = useState<HouseholdMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const [invitesExpanded, setInvitesExpanded] = useState(false);
  const [notifsExpanded, setNotifsExpanded] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, me] = await Promise.all([
        api.listHouseholdMembers(propertyId),
        api.getMyHouseholdMembership(propertyId),
      ]);
      setMembers(m);
      setMyMembership(me);
      if (me.role === 'OWNER') {
        const inv = await api.listHouseholdInvites(propertyId);
        setInvites(inv);
      }
    } catch {
      toast({ title: 'Failed to load household data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  const pendingInvites = invites.filter((i) => i.status === 'PENDING');
  const isOwner = myMembership?.role === 'OWNER';

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await api.revokeHouseholdInvite(propertyId, inviteId);
      await load();
    } catch {
      toast({ title: 'Failed to revoke invite', variant: 'destructive' });
    }
  };

  const handleToggleNotif = async (key: keyof HouseholdNotificationPrefs, value: boolean) => {
    if (!myMembership) return;
    setMyMembership((prev) => prev ? { ...prev, [key]: value } : prev);
    setSavingPrefs(true);
    try {
      await api.updateMyNotificationPreferences(propertyId, { [key]: value });
    } catch {
      // Revert on failure
      setMyMembership((prev) => prev ? { ...prev, [key]: !value } : prev);
      toast({ title: 'Failed to update preference', variant: 'destructive' });
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Household Members</h1>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Members */}
            <section className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Members ({members.length})
              </h2>
              <MemberList
                propertyId={propertyId}
                members={members}
                myMemberId={myMembership?.id ?? ''}
                isOwner={isOwner}
                onChanged={load}
              />
            </section>

            {/* Pending invites (OWNER only) */}
            {isOwner && (
              <section className="bg-white rounded-2xl p-4 shadow-sm">
                <button
                  className="w-full flex items-center justify-between"
                  onClick={() => setInvitesExpanded((p) => !p)}
                >
                  <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Pending Invites {pendingInvites.length > 0 && `(${pendingInvites.length})`}
                  </h2>
                  {invitesExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {invitesExpanded && (
                  <div className="mt-3 space-y-2">
                    {pendingInvites.length === 0 ? (
                      <p className="text-sm text-gray-400">No pending invites.</p>
                    ) : (
                      pendingInvites.map((invite) => (
                        <div key={invite.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{invite.inviteeEmail}</p>
                            <p className="text-xs text-gray-500">
                              {ROLE_LABELS[invite.role]} · expires {formatRelativeTime(invite.expiresAt)}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 text-xs flex-shrink-0"
                            onClick={() => handleRevokeInvite(invite.id)}
                          >
                            Revoke
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Notification preferences */}
            {myMembership && (
              <section className="bg-white rounded-2xl p-4 shadow-sm">
                <button
                  className="w-full flex items-center justify-between"
                  onClick={() => setNotifsExpanded((p) => !p)}
                >
                  <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                    <Bell className="w-3.5 h-3.5" />
                    My Notifications
                  </h2>
                  {notifsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {notifsExpanded && (
                  <div className="mt-3 space-y-3">
                    {NOTIF_PREFS.map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{label}</span>
                        <Switch
                          checked={myMembership[key] as boolean}
                          onCheckedChange={(v) => handleToggleNotif(key, v)}
                          disabled={savingPrefs}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3">
              {isOwner && (
                <Button className="w-full" onClick={() => setInviteSheetOpen(true)}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Invite Someone
                </Button>
              )}
              <Link
                href={`/dashboard/properties/${propertyId}/household/activity`}
                className="text-sm text-center text-blue-600 hover:text-blue-800"
              >
                View activity feed →
              </Link>
            </div>
          </>
        )}
      </div>

      {isOwner && (
        <InviteMemberSheet
          propertyId={propertyId}
          open={inviteSheetOpen}
          onOpenChange={setInviteSheetOpen}
          onInviteSent={load}
        />
      )}
    </div>
  );
}
