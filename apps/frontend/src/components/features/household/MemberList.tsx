'use client';

import { useState } from 'react';
import type { HouseholdMember, HouseholdRole } from '@/types';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { getMemberDisplayName, ROLE_BADGE_COLORS, ROLE_LABELS, formatRelativeTime } from './HouseholdUtils';

interface Props {
  propertyId: string;
  members: HouseholdMember[];
  myMemberId: string;
  isOwner: boolean;
  onChanged: () => void;
}

const CHANGEABLE_ROLES: HouseholdRole[] = ['OWNER', 'CONTRIBUTOR', 'VIEWER'];

export default function MemberList({ propertyId, members, myMemberId, isOwner, onChanged }: Props) {
  const [removing, setRemoving] = useState<string | null>(null);

  const handleRoleChange = async (member: HouseholdMember, newRole: HouseholdRole) => {
    try {
      await api.updateHouseholdMemberRole(propertyId, member.id, { role: newRole });
      onChanged();
    } catch {
      toast({ title: 'Failed to update role', variant: 'destructive' });
    }
  };

  const handleRemove = async (member: HouseholdMember) => {
    if (!confirm(`Remove ${getMemberDisplayName(member)} from this household?`)) return;
    setRemoving(member.id);
    try {
      await api.removeHouseholdMember(propertyId, member.id);
      onChanged();
    } catch {
      toast({ title: 'Failed to remove member', variant: 'destructive' });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-3">
      {members.map((member) => {
        const name = getMemberDisplayName(member);
        const initials = `${member.user.firstName[0]}${member.user.lastName[0]}`.toUpperCase();
        const isMe = member.id === myMemberId;
        const canEdit = isOwner && !isMe && !member.isPrimaryOwner;

        return (
          <div key={member.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-sm font-semibold text-gray-700">
              {member.user.avatar ? (
                <img src={member.user.avatar} alt={name} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-900 truncate">{name}</span>
                {isMe && <span className="text-xs text-gray-400">(you)</span>}
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_BADGE_COLORS[member.role]}`}>
                  {ROLE_LABELS[member.role]}
                </span>
                {member.isPrimaryOwner && (
                  <span className="text-xs text-gray-400">Primary</span>
                )}
              </div>
              <p className="text-xs text-gray-500 truncate">{member.user.email}</p>
              {member.user.lastLoginAt && (
                <p className="text-xs text-gray-400">Active {formatRelativeTime(member.user.lastLoginAt)}</p>
              )}
            </div>
            {canEdit && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <Select
                  value={member.role}
                  onValueChange={(v) => handleRoleChange(member, v as HouseholdRole)}
                >
                  <SelectTrigger className="h-7 text-xs w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANGEABLE_ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="text-xs">
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-700 h-7 px-2 text-xs"
                  onClick={() => handleRemove(member)}
                  disabled={removing === member.id}
                >
                  {removing === member.id ? '…' : 'Remove'}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
