// apps/frontend/src/components/rooms/RoomProfileForm.tsx
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  profile: any;
  roomType: 'KITCHEN' | 'LIVING' | 'BEDROOM' | 'DINING' | 'LAUNDRY' | 'GARAGE' | 'OFFICE' | 'OTHER';
  saving: boolean;
  onChange: (profile: any) => void;
  onSave: (profile: any) => Promise<void>;
}

type BedroomKind = 'MASTER' | 'KIDS' | 'GUEST';
type YesNo = 'YES' | 'NO';

function safeObj(v: any) {
  return v && typeof v === 'object' ? v : {};
}

function Divider() {
  return <div className="h-px bg-black/10" />;
}

function Row({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="px-4 py-3">
      <Label className="text-xs font-medium text-black/70">{label}</Label>
      <div className="mt-1">{children}</div>
      {hint ? <div className="mt-1 text-[11px] text-black/50">{hint}</div> : null}
    </div>
  );
}

export default function RoomProfileForm({ profile, roomType, saving, onChange, onSave }: Props) {
  const p = safeObj(profile);

  function updateField(key: string, value: any) {
    onChange({ ...p, [key]: value });
  }

  async function saveProfile() {
    await onSave(p);
  }

  const bedroomKind = (p?.bedroomKind || '') as '' | BedroomKind;

  return (
    <div className="lg:col-span-2 rounded-2xl border border-black/10 bg-white shadow-sm">
      <div className="p-5">
        <div className="text-sm font-semibold">Room questionnaire</div>
        <div className="text-xs text-black/50 mt-1">
          Lightweight inputs stored in <span className="font-mono">InventoryRoom.profile</span>.
        </div>
      </div>

      <Divider />

      <div className="p-5 pt-0">
        <div className="rounded-xl border border-black/10 bg-black/[0.02] overflow-hidden">
          {/* Bedroom kind selector */}
          {roomType === 'BEDROOM' && (
            <>
              <Row label="Bedroom type" hint="Drives insights + suggested checklist defaults (no DB enum changes).">
                <Select value={bedroomKind} onValueChange={(v) => updateField('bedroomKind', v)}>
                  <SelectTrigger className="h-10 rounded-xl border-black/10 bg-white">
                    <SelectValue placeholder="Select bedroom type…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MASTER">Master bedroom</SelectItem>
                    <SelectItem value="KIDS">Kids bedroom</SelectItem>
                    <SelectItem value="GUEST">Guest bedroom</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Divider />
            </>
          )}

          {/* Common fields */}
          <Row label="Primary style">
            <Input
              value={p.style || ''}
              onChange={(e) => updateField('style', e.target.value)}
              placeholder="Modern / Transitional / Traditional…"
              className="h-10 rounded-xl border-black/10 bg-white"
            />
          </Row>
          <Divider />
          <Row label="Flooring">
            <Input
              value={p.flooring || ''}
              onChange={(e) => updateField('flooring', e.target.value)}
              placeholder="Wood / Tile / Vinyl…"
              className="h-10 rounded-xl border-black/10 bg-white"
            />
          </Row>

          {/* Kitchen */}
          {roomType === 'KITCHEN' && (
            <>
              <Divider />
              <Row label="Countertops">
                <Input
                  value={p.countertops || ''}
                  onChange={(e) => updateField('countertops', e.target.value)}
                  placeholder="Quartz / Granite / Laminate…"
                  className="h-10 rounded-xl border-black/10 bg-white"
                />
              </Row>
              <Divider />
              <Row label="Cabinet finish">
                <Input
                  value={p.cabinets || ''}
                  onChange={(e) => updateField('cabinets', e.target.value)}
                  placeholder="White / Walnut / Painted…"
                  className="h-10 rounded-xl border-black/10 bg-white"
                />
              </Row>
              <Divider />
              <Row label="Backsplash">
                <Input
                  value={p.backsplash || ''}
                  onChange={(e) => updateField('backsplash', e.target.value)}
                  placeholder="Subway tile / Stone…"
                  className="h-10 rounded-xl border-black/10 bg-white"
                />
              </Row>
              <Divider />
              <Row label="Vent hood type">
                <Input
                  value={p.ventHood || ''}
                  onChange={(e) => updateField('ventHood', e.target.value)}
                  placeholder="Microwave hood / Chimney / Under-cabinet…"
                  className="h-10 rounded-xl border-black/10 bg-white"
                />
              </Row>
            </>
          )}

          {/* Living */}
          {roomType === 'LIVING' && (
            <>
              <Divider />
              <Row label="Seating capacity">
                <Input
                  value={p.seatingCapacity || ''}
                  onChange={(e) => updateField('seatingCapacity', e.target.value)}
                  placeholder="e.g., 5"
                  className="h-10 rounded-xl border-black/10 bg-white"
                />
              </Row>
              <Divider />
              <Row label="Primary use">
                <Input
                  value={p.primaryUse || ''}
                  onChange={(e) => updateField('primaryUse', e.target.value)}
                  placeholder="Family / Entertaining / TV…"
                  className="h-10 rounded-xl border-black/10 bg-white"
                />
              </Row>
              <Divider />
              <Row label="TV mount">
                <Input
                  value={p.tvMount || ''}
                  onChange={(e) => updateField('tvMount', e.target.value)}
                  placeholder="Wall / Stand / None"
                  className="h-10 rounded-xl border-black/10 bg-white"
                />
              </Row>
              <Divider />
              <Row label="Lighting">
                <Input
                  value={p.lighting || ''}
                  onChange={(e) => updateField('lighting', e.target.value)}
                  placeholder="Recessed / Floor lamps / Pendant…"
                  className="h-10 rounded-xl border-black/10 bg-white"
                />
              </Row>
            </>
          )}

          {/* Dining */}
          {roomType === 'DINING' && (
            <>
              <Divider />
              <Row label="Seating capacity">
                <Input
                  value={p.seatingCapacity || ''}
                  onChange={(e) => updateField('seatingCapacity', e.target.value)}
                  placeholder="e.g., 6"
                  className="h-10 rounded-xl border-black/10 bg-white"
                />
              </Row>
              <Divider />
              <Row label="Table material">
                <Input
                  value={p.tableMaterial || ''}
                  onChange={(e) => updateField('tableMaterial', e.target.value)}
                  placeholder="Wood / Glass / Marble…"
                  className="h-10 rounded-xl border-black/10 bg-white"
                />
              </Row>
              <Divider />
              <Row label="Lighting">
                <Select value={(p.lighting || '') as string} onValueChange={(v) => updateField('lighting', v)}>
                  <SelectTrigger className="h-10 rounded-xl border-black/10 bg-white">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CHANDELIER">Chandelier</SelectItem>
                    <SelectItem value="PENDANT">Pendant</SelectItem>
                    <SelectItem value="RECESSED">Recessed</SelectItem>
                    <SelectItem value="MIXED">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Divider />
              <Row label="High chair use (optional)">
                <Select value={(p.highChairUse || '') as '' | YesNo} onValueChange={(v) => updateField('highChairUse', v)}>
                  <SelectTrigger className="h-10 rounded-xl border-black/10 bg-white">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YES">Yes</SelectItem>
                    <SelectItem value="NO">No</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            </>
          )}

          {/* Laundry */}
          {roomType === 'LAUNDRY' && (
            <>
              <Divider />
              <Row label="Washer type">
                <Select value={(p.washerType || '') as string} onValueChange={(v) => updateField('washerType', v)}>
                  <SelectTrigger className="h-10 rounded-xl border-black/10 bg-white">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FRONT_LOAD">Front-load</SelectItem>
                    <SelectItem value="TOP_LOAD">Top-load</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Divider />
              <Row label="Dryer type">
                <Select value={(p.dryerType || '') as string} onValueChange={(v) => updateField('dryerType', v)}>
                  <SelectTrigger className="h-10 rounded-xl border-black/10 bg-white">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ELECTRIC">Electric</SelectItem>
                    <SelectItem value="GAS">Gas</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Divider />
              <Row label="Venting type">
                <Input
                  value={p.ventingType || ''}
                  onChange={(e) => updateField('ventingType', e.target.value)}
                  placeholder="Rigid / Semi-rigid / Flex…"
                  className="h-10 rounded-xl border-black/10 bg-white"
                />
              </Row>
              <Divider />
              <Row label="Floor drain">
                <Select value={(p.floorDrain || '') as '' | YesNo} onValueChange={(v) => updateField('floorDrain', v)}>
                  <SelectTrigger className="h-10 rounded-xl border-black/10 bg-white">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YES">Yes</SelectItem>
                    <SelectItem value="NO">No</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Divider />
              <Row label="Leak pan">
                <Select value={(p.leakPan || '') as '' | YesNo} onValueChange={(v) => updateField('leakPan', v)}>
                  <SelectTrigger className="h-10 rounded-xl border-black/10 bg-white">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YES">Yes</SelectItem>
                    <SelectItem value="NO">No</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            </>
          )}

          {/* Garage */}
          {roomType === 'GARAGE' && (
            <>
              <Divider />
              <Row label="Car capacity">
                <Input
                  value={p.carCapacity || ''}
                  onChange={(e) => updateField('carCapacity', e.target.value)}
                  placeholder="e.g., 2"
                  className="h-10 rounded-xl border-black/10 bg-white"
                />
              </Row>
              <Divider />
              <Row label="Door type">
                <Select value={(p.doorType || '') as string} onValueChange={(v) => updateField('doorType', v)}>
                  <SelectTrigger className="h-10 rounded-xl border-black/10 bg-white">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTO">Automatic opener</SelectItem>
                    <SelectItem value="MANUAL">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Divider />
              <Row label="Storage type">
                <Select value={(p.storageType || '') as string} onValueChange={(v) => updateField('storageType', v)}>
                  <SelectTrigger className="h-10 rounded-xl border-black/10 bg-white">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SHELVES">Shelves</SelectItem>
                    <SelectItem value="CABINETS">Cabinets</SelectItem>
                    <SelectItem value="MIXED">Mixed</SelectItem>
                    <SelectItem value="NONE">None</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Divider />
              <Row label="Water heater located here">
                <Select
                  value={(p.waterHeaterLocatedHere || '') as '' | YesNo}
                  onValueChange={(v) => updateField('waterHeaterLocatedHere', v)}
                >
                  <SelectTrigger className="h-10 rounded-xl border-black/10 bg-white">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YES">Yes</SelectItem>
                    <SelectItem value="NO">No</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Divider />
              <Row label="Fire extinguisher present">
                <Select
                  value={(p.fireExtinguisherPresent || '') as '' | YesNo}
                  onValueChange={(v) => updateField('fireExtinguisherPresent', v)}
                >
                  <SelectTrigger className="h-10 rounded-xl border-black/10 bg-white">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YES">Yes</SelectItem>
                    <SelectItem value="NO">No</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            </>
          )}

          {/* Office */}
          {roomType === 'OFFICE' && (
            <>
              <Divider />
              <Row label="Primary use">
                <Select value={(p.primaryUse || '') as string} onValueChange={(v) => updateField('primaryUse', v)}>
                  <SelectTrigger className="h-10 rounded-xl border-black/10 bg-white">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WFH">Work from home</SelectItem>
                    <SelectItem value="STUDY">Study</SelectItem>
                    <SelectItem value="GAMING">Gaming</SelectItem>
                    <SelectItem value="MIXED">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Divider />
              <Row label="Monitor count">
                <Input
                  value={p.monitorCount || ''}
                  onChange={(e) => updateField('monitorCount', e.target.value)}
                  placeholder="e.g., 2"
                  className="h-10 rounded-xl border-black/10 bg-white"
                />
              </Row>
              <Divider />
              <Row label="Cable management">
                <Input
                  value={p.cableManagement || ''}
                  onChange={(e) => updateField('cableManagement', e.target.value)}
                  placeholder="Under-desk tray / clips / none…"
                  className="h-10 rounded-xl border-black/10 bg-white"
                />
              </Row>
              <Divider />
              <Row label="Ergonomic setup">
                <Select
                  value={(p.ergonomicSetup || '') as '' | YesNo}
                  onValueChange={(v) => updateField('ergonomicSetup', v)}
                >
                  <SelectTrigger className="h-10 rounded-xl border-black/10 bg-white">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YES">Yes</SelectItem>
                    <SelectItem value="NO">No</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Divider />
              <Row label="Surge protection">
                <Select
                  value={(p.surgeProtection || '') as '' | YesNo}
                  onValueChange={(v) => updateField('surgeProtection', v)}
                >
                  <SelectTrigger className="h-10 rounded-xl border-black/10 bg-white">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YES">Yes</SelectItem>
                    <SelectItem value="NO">No</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            </>
          )}

          {/* Bedroom base fields */}
          {roomType === 'BEDROOM' && (
            <>
              <Divider />
              <Row label="Bed size">
                <Input
                  value={p.bedSize || ''}
                  onChange={(e) => updateField('bedSize', e.target.value)}
                  placeholder="King / Queen / Twin…"
                  className="h-10 rounded-xl border-black/10 bg-white"
                />
              </Row>
              <Divider />
              <Row label="Night lighting">
                <Input
                  value={p.nightLighting || ''}
                  onChange={(e) => updateField('nightLighting', e.target.value)}
                  placeholder="Lamps / Sconces / None…"
                  className="h-10 rounded-xl border-black/10 bg-white"
                />
              </Row>

              {bedroomKind === 'MASTER' && (
                <>
                  <Divider />
                  <Row label="Mattress type">
                    <Input
                      value={p.mattressType || ''}
                      onChange={(e) => updateField('mattressType', e.target.value)}
                      placeholder="Memory foam / Hybrid / Innerspring…"
                      className="h-10 rounded-xl border-black/10 bg-white"
                    />
                  </Row>
                  <Divider />
                  <Row label="Noise level">
                    <Input
                      value={p.noiseLevel || ''}
                      onChange={(e) => updateField('noiseLevel', e.target.value)}
                      placeholder="Quiet / Moderate / Noisy…"
                      className="h-10 rounded-xl border-black/10 bg-white"
                    />
                  </Row>
                  <Divider />
                  <Row label="Storage">
                    <Input
                      value={p.storage || ''}
                      onChange={(e) => updateField('storage', e.target.value)}
                      placeholder="Walk-in closet / Dresser / Under-bed…"
                      className="h-10 rounded-xl border-black/10 bg-white"
                    />
                  </Row>
                </>
              )}

              {bedroomKind === 'KIDS' && (
                <>
                  <Divider />
                  <Row label="Age range">
                    <Input
                      value={p.ageRange || ''}
                      onChange={(e) => updateField('ageRange', e.target.value)}
                      placeholder="e.g., 3–6"
                      className="h-10 rounded-xl border-black/10 bg-white"
                    />
                  </Row>
                  <Divider />
                  <Row label="Toy storage">
                    <Input
                      value={p.toyStorage || ''}
                      onChange={(e) => updateField('toyStorage', e.target.value)}
                      placeholder="Bins / Shelves / Closet…"
                      className="h-10 rounded-xl border-black/10 bg-white"
                    />
                  </Row>
                  <Divider />
                  <Row label="Furniture anchored">
                    <Select
                      value={(p.anchorFurniture || '') as '' | YesNo}
                      onValueChange={(v) => updateField('anchorFurniture', v)}
                    >
                      <SelectTrigger className="h-10 rounded-xl border-black/10 bg-white">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="YES">Yes</SelectItem>
                        <SelectItem value="NO">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </Row>
                  <Divider />
                  <Row label="Window safety">
                    <Select
                      value={(p.windowSafety || '') as '' | YesNo}
                      onValueChange={(v) => updateField('windowSafety', v)}
                    >
                      <SelectTrigger className="h-10 rounded-xl border-black/10 bg-white">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="YES">Yes</SelectItem>
                        <SelectItem value="NO">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </Row>
                </>
              )}

              {bedroomKind === 'GUEST' && (
                <>
                  <Divider />
                  <Row label="Blackout curtains">
                    <Select value={(p.blackout || '') as '' | YesNo} onValueChange={(v) => updateField('blackout', v)}>
                      <SelectTrigger className="h-10 rounded-xl border-black/10 bg-white">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="YES">Yes</SelectItem>
                        <SelectItem value="NO">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </Row>
                  <Divider />
                  <Row label="Charging setup">
                    <Input
                      value={p.charging || ''}
                      onChange={(e) => updateField('charging', e.target.value)}
                      placeholder="USB outlet / Charger on nightstand…"
                      className="h-10 rounded-xl border-black/10 bg-white"
                    />
                  </Row>
                  <Divider />
                  <Row label="Linens / towels">
                    <Input
                      value={p.linens || ''}
                      onChange={(e) => updateField('linens', e.target.value)}
                      placeholder="Spare sheets / Towels stored where…"
                      className="h-10 rounded-xl border-black/10 bg-white"
                    />
                  </Row>
                </>
              )}
            </>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button onClick={saveProfile} disabled={saving} className="rounded-xl">
            {saving ? 'Saving…' : 'Save profile'}
          </Button>
          <div className="text-xs text-black/50">Tip: keep this quick. Defaults + insights adapt to the room.</div>
        </div>
      </div>
    </div>
  );
}
