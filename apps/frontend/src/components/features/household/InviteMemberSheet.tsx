'use client';

import { useState } from 'react';
import type { HouseholdRole } from '@/types';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from './HouseholdUtils';

interface Props {
  propertyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInviteSent: () => void;
}

const INVITABLE_ROLES: HouseholdRole[] = ['CONTRIBUTOR', 'VIEWER'];

export default function InviteMemberSheet({ propertyId, open, onOpenChange, onInviteSent }: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<HouseholdRole>('CONTRIBUTOR');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await api.sendHouseholdInvite(propertyId, { email: email.trim(), role });
      toast({ title: 'Invite sent', description: `An invite has been sent to ${email}.` });
      setEmail('');
      setRole('CONTRIBUTOR');
      onInviteSent();
      onOpenChange(false);
    } catch {
      toast({ title: 'Failed to send invite', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle>Invite Someone</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="partner@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as HouseholdRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVITABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">{ROLE_DESCRIPTIONS[role]}</p>
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send Invite'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
