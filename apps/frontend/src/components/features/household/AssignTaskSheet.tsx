'use client';

import { useEffect, useState } from 'react';
import type { HouseholdMember } from '@/types';
import { api } from '@/lib/api/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/components/ui/use-toast';
import { getMemberDisplayName, ROLE_LABELS } from './HouseholdUtils';

interface Props {
  propertyId: string;
  taskId: string;
  taskType: 'MAINTENANCE' | 'SEASONAL' | 'BUYER';
  taskTitle: string;
  currentAssigneeId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned: (assigneeUserId: string | null) => void;
}

export default function AssignTaskSheet({
  propertyId, taskId, taskType, taskTitle,
  currentAssigneeId, open, onOpenChange, onAssigned,
}: Props) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.listHouseholdMembers(propertyId)
      .then(setMembers)
      .finally(() => setLoading(false));
  }, [open, propertyId]);

  const assign = async (userId: string | null) => {
    setAssigning(userId ?? '__unassign__');
    try {
      await api.assignTask(propertyId, taskId, taskType, userId);
      onAssigned(userId);
      onOpenChange(false);
    } catch {
      toast({ title: 'Failed to assign task', variant: 'destructive' });
    } finally {
      setAssigning(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle>Assign Task</SheetTitle>
          <p className="text-sm text-gray-500 truncate">{taskTitle}</p>
        </SheetHeader>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {members.map((member) => {
              const name = getMemberDisplayName(member);
              const isAssigned = member.userId === currentAssigneeId;
              const initials = `${member.user.firstName[0]}${member.user.lastName[0]}`.toUpperCase();
              return (
                <button
                  key={member.id}
                  onClick={() => assign(isAssigned ? null : member.userId)}
                  disabled={assigning !== null}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${
                    isAssigned ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs font-semibold text-gray-700 flex-shrink-0">
                    {member.user.avatar ? (
                      <img src={member.user.avatar} alt={name} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                    <p className="text-xs text-gray-500">{ROLE_LABELS[member.role]}</p>
                  </div>
                  {isAssigned && (
                    <span className="text-xs text-blue-600 font-medium flex-shrink-0">Assigned — tap to remove</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
