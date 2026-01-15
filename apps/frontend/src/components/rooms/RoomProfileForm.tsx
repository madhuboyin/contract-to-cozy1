// apps/frontend/src/components/rooms/RoomProfileForm.tsx
'use client';

import React, { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type RoomProfile = {
  // shared
  style?: string;
  flooring?: string;

  // kitchen
  countertops?: string;
  cabinets?: string;
  backsplash?: string;
  ventHood?: string;

  // living
  seatingCapacity?: number;
  primaryUse?: string;
  tvMount?: string;
  lighting?: string;
};

type RoomTypeUI = 'KITCHEN' | 'LIVING' | 'OTHER';

interface Props {
  profile: RoomProfile | Record<string, any>;
  roomType: RoomTypeUI;
  saving: boolean;
  onChange: (profile: any) => void;
  onSave: (profile: any) => Promise<void>;
}

export default function RoomProfileForm({ profile, roomType, saving, onChange, onSave }: Props) {
  const updateField = useCallback(
    (key: string, value: any) => {
      onChange({ ...(profile || {}), [key]: value });
    },
    [onChange, profile]
  );

  const saveProfile = useCallback(async () => {
    await onSave(profile || {});
  }, [onSave, profile]);

  function onKeyDownSave(e: React.KeyboardEvent) {
    // Cmd+Enter (mac) or Ctrl+Enter (win/linux)
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!saving) saveProfile();
    }
  }

  return (
    <div className="lg:col-span-2 rounded-2xl border border-black/10 bg-white p-5" onKeyDown={onKeyDownSave}>
      <div className="text-sm font-semibold">Room questionnaire</div>
      <div className="text-xs opacity-70 mt-1">
        Lightweight inputs. Stored in <span className="font-mono">InventoryRoom.profile</span>.
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Common fields */}
        <div>
          <Label>Primary style</Label>
          <Input
            value={(profile as any)?.style || ''}
            onChange={(e) => updateField('style', e.target.value)}
            placeholder="Modern / Transitional / Traditional…"
          />
        </div>

        <div>
          <Label>Flooring</Label>
          <Input
            value={(profile as any)?.flooring || ''}
            onChange={(e) => updateField('flooring', e.target.value)}
            placeholder="Wood / Tile / Vinyl…"
          />
        </div>

        {/* Kitchen-specific */}
        {roomType === 'KITCHEN' && (
          <>
            <div>
              <Label>Countertops</Label>
              <Input
                value={(profile as any)?.countertops || ''}
                onChange={(e) => updateField('countertops', e.target.value)}
                placeholder="Quartz / Granite / Laminate…"
              />
            </div>

            <div>
              <Label>Cabinet finish</Label>
              <Input
                value={(profile as any)?.cabinets || ''}
                onChange={(e) => updateField('cabinets', e.target.value)}
                placeholder="White / Walnut / Painted…"
              />
            </div>

            <div>
              <Label>Backsplash</Label>
              <Input
                value={(profile as any)?.backsplash || ''}
                onChange={(e) => updateField('backsplash', e.target.value)}
                placeholder="Subway tile / Stone…"
              />
            </div>

            <div>
              <Label>Vent hood type</Label>
              <Input
                value={(profile as any)?.ventHood || ''}
                onChange={(e) => updateField('ventHood', e.target.value)}
                placeholder="Microwave hood / Chimney / Under-cabinet…"
              />
            </div>
          </>
        )}

        {/* Living-specific */}
        {roomType === 'LIVING' && (
          <>
            <div>
              <Label>Seating capacity</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={Number.isFinite((profile as any)?.seatingCapacity) ? String((profile as any)?.seatingCapacity) : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  updateField('seatingCapacity', v === '' ? undefined : Number(v));
                }}
                placeholder="e.g., 5"
              />
            </div>

            <div>
              <Label>Primary use</Label>
              <Input
                value={(profile as any)?.primaryUse || ''}
                onChange={(e) => updateField('primaryUse', e.target.value)}
                placeholder="Family / Entertaining / TV…"
              />
            </div>

            <div>
              <Label>TV mount</Label>
              <Input
                value={(profile as any)?.tvMount || ''}
                onChange={(e) => updateField('tvMount', e.target.value)}
                placeholder="Wall / Stand / None"
              />
            </div>

            <div>
              <Label>Lighting</Label>
              <Input
                value={(profile as any)?.lighting || ''}
                onChange={(e) => updateField('lighting', e.target.value)}
                placeholder="Recessed / Floor lamps / Pendant…"
              />
            </div>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={saveProfile} disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </Button>
        <div className="text-xs opacity-60">Tip: Cmd/Ctrl + Enter to save.</div>
      </div>
    </div>
  );
}
