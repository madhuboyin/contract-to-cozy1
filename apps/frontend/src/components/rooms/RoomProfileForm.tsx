// apps/frontend/src/components/rooms/RoomProfileForm.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Plus, X } from 'lucide-react';

import { titleCase } from '@/lib/utils/string';

type RoomType =
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

interface Props {
  profile: Record<string, any>;
  roomType: RoomType;
  saving: boolean;
  onChange: (profile: Record<string, any>) => void;
  onSave: (profile: Record<string, any>) => Promise<void>;
}

type ChipOption = {
  value: string;
  label: string;
};

type FieldConfig = {
  key: string;
  label: string;
  options: ChipOption[];
  allowCustom?: boolean;
};

export const ROOM_SUBTITLE: Record<string, string> = {
  KITCHEN: 'Tell us about your kitchen to get personalized maintenance tips.',
  BEDROOM: 'Tell us about your bedroom to get personalized care tips.',
  BATHROOM: 'Tell us about your bathroom to unlock targeted maintenance advice.',
  LAUNDRY: 'Tell us about your laundry room for appliance care insights.',
  LIVING: 'Tell us about your living room to track wear and maintenance.',
  GARAGE: 'Tell us about your garage for storage and system insights.',
  OFFICE: 'Tell us about your home office for equipment care tips.',
  DINING: 'Tell us about your dining room to keep it guest-ready year-round.',
  BASEMENT: 'Tell us about your basement for moisture and safety insights.',
  DEFAULT: 'Tell us about this room to get personalized maintenance tips.',
};

function toOptions(values: string[]): ChipOption[] {
  return values.map((value) => ({
    value,
    label: titleCase(value.replace(/_/g, ' ')),
  }));
}

const COMMON_FIELDS: FieldConfig[] = [
  {
    key: 'style',
    label: 'Primary style',
    options: toOptions(['TRADITIONAL', 'MODERN', 'TRANSITIONAL', 'MINIMALIST', 'INDUSTRIAL', 'COASTAL']),
  },
  {
    key: 'flooring',
    label: 'Flooring',
    options: toOptions(['HARDWOOD', 'TILE', 'VINYL', 'LAMINATE', 'CARPET', 'CONCRETE']),
  },
];

const ROOM_PROFILE_FIELDS: Record<RoomType, FieldConfig[]> = {
  KITCHEN: [
    ...COMMON_FIELDS,
    { key: 'countertops', label: 'Countertops', options: toOptions(['GRANITE', 'QUARTZ', 'MARBLE', 'LAMINATE', 'BUTCHER_BLOCK', 'CONCRETE']) },
    { key: 'cabinets', label: 'Cabinet finish', options: toOptions(['WHITE', 'OAK', 'MAPLE', 'WALNUT', 'PAINTED', 'LAMINATE']) },
    { key: 'backsplash', label: 'Backsplash', options: toOptions(['TILE', 'GLASS', 'STONE', 'PAINT', 'NONE']) },
    { key: 'ventHood', label: 'Vent hood type', options: toOptions(['CHIMNEY', 'UNDER_CABINET', 'ISLAND', 'MICROWAVE', 'NONE']) },
  ],
  LIVING: [
    ...COMMON_FIELDS,
    { key: 'seatingCapacity', label: 'Seating capacity', options: toOptions(['2', '3', '4', '5', '6', '8']) },
    { key: 'primaryUse', label: 'Primary use', options: toOptions(['FAMILY_TIME', 'ENTERTAINING', 'TV', 'MULTIPURPOSE']) },
    { key: 'tvMount', label: 'TV mount', options: toOptions(['WALL', 'STAND', 'NONE']) },
    { key: 'lighting', label: 'Lighting', options: toOptions(['RECESSED', 'LAMPS', 'PENDANT', 'MIXED']) },
  ],
  BEDROOM: [
    ...COMMON_FIELDS,
    {
      key: 'bedroomKind',
      label: 'Bedroom type',
      options: [
        { value: 'MASTER', label: 'Master' },
        { value: 'KIDS', label: 'Kids' },
        { value: 'GUEST', label: 'Guest' },
      ],
      allowCustom: false,
    },
    { key: 'bedSize', label: 'Bed size', options: toOptions(['TWIN', 'FULL', 'QUEEN', 'KING']) },
    { key: 'nightLighting', label: 'Night lighting', options: toOptions(['LAMPS', 'SCONCES', 'NONE']) },
  ],
  BATHROOM: [
    ...COMMON_FIELDS,
    { key: 'bathroomType', label: 'Bathroom type', options: toOptions(['FULL', 'HALF', 'PRIMARY']) },
    { key: 'showerType', label: 'Shower / tub type', options: toOptions(['SHOWER_ONLY', 'TUB_ONLY', 'SHOWER_TUB', 'NONE']) },
    { key: 'exhaustFan', label: 'Exhaust fan present', options: toOptions(['YES', 'NO']), allowCustom: false },
    { key: 'gfciPresent', label: 'GFCI outlets present', options: toOptions(['YES', 'NO']), allowCustom: false },
    { key: 'shutoffAccessible', label: 'Shutoff access is easy', options: toOptions(['YES', 'NO']), allowCustom: false },
  ],
  DINING: [
    ...COMMON_FIELDS,
    { key: 'seatingCapacity', label: 'Seating capacity', options: toOptions(['4', '6', '8', '10']) },
    { key: 'tableMaterial', label: 'Table material', options: toOptions(['WOOD', 'GLASS', 'MARBLE', 'METAL']) },
    { key: 'lighting', label: 'Lighting', options: toOptions(['CHANDELIER', 'PENDANT', 'RECESSED', 'MIXED']) },
    { key: 'highChairUse', label: 'High chair use', options: toOptions(['YES', 'NO']), allowCustom: false },
  ],
  LAUNDRY: [
    ...COMMON_FIELDS,
    { key: 'washerType', label: 'Washer type', options: toOptions(['FRONT_LOAD', 'TOP_LOAD']) },
    { key: 'dryerType', label: 'Dryer type', options: toOptions(['ELECTRIC', 'GAS']) },
    { key: 'ventingType', label: 'Venting type', options: toOptions(['RIGID', 'SEMI_RIGID', 'FLEX']) },
    { key: 'floorDrain', label: 'Floor drain', options: toOptions(['YES', 'NO']), allowCustom: false },
    { key: 'leakPan', label: 'Leak pan', options: toOptions(['YES', 'NO']), allowCustom: false },
  ],
  GARAGE: [
    ...COMMON_FIELDS,
    { key: 'carCapacity', label: 'Car capacity', options: toOptions(['1', '2', '3']) },
    { key: 'doorType', label: 'Door type', options: toOptions(['AUTO', 'MANUAL']) },
    { key: 'storageType', label: 'Storage type', options: toOptions(['SHELVES', 'CABINETS', 'MIXED', 'NONE']) },
    { key: 'waterHeaterLocatedHere', label: 'Water heater located here', options: toOptions(['YES', 'NO']), allowCustom: false },
    { key: 'fireExtinguisherPresent', label: 'Fire extinguisher present', options: toOptions(['YES', 'NO']), allowCustom: false },
  ],
  OFFICE: [
    ...COMMON_FIELDS,
    { key: 'primaryUse', label: 'Primary use', options: toOptions(['WFH', 'STUDY', 'GAMING', 'MIXED']) },
    { key: 'monitorCount', label: 'Monitor count', options: toOptions(['1', '2', '3', '4']) },
    { key: 'cableManagement', label: 'Cable management', options: toOptions(['TRAY', 'CLIPS', 'SLEEVES', 'NONE']) },
    { key: 'ergonomicSetup', label: 'Ergonomic setup', options: toOptions(['YES', 'NO']), allowCustom: false },
    { key: 'surgeProtection', label: 'Surge protection', options: toOptions(['YES', 'NO']), allowCustom: false },
  ],
  BASEMENT: [
    ...COMMON_FIELDS,
    { key: 'basementType', label: 'Basement type', options: toOptions(['FINISHED', 'UNFINISHED', 'PARTIAL']) },
    { key: 'humidityControl', label: 'Humidity control', options: toOptions(['DEHUMIDIFIER', 'HVAC', 'SENSOR_ONLY', 'NONE']) },
    { key: 'sumpPump', label: 'Sump pump present', options: toOptions(['YES', 'NO']), allowCustom: false },
    { key: 'floorDrain', label: 'Floor drain present', options: toOptions(['YES', 'NO']), allowCustom: false },
    { key: 'egressWindow', label: 'Egress window', options: toOptions(['YES', 'NO']), allowCustom: false },
  ],
  OTHER: [...COMMON_FIELDS],
};

function formatDisplayValue(value: string): string {
  return titleCase(String(value || '').replace(/_/g, ' '));
}

function normalizeValue(savedValue: string, options: ChipOption[]): string {
  const raw = String(savedValue || '').trim();
  if (!raw) return '';

  const normalized = raw.toLowerCase();
  const match = options.find((option) => {
    const optionValue = String(option.value || '').toLowerCase();
    const optionLabel = String(option.label || '').toLowerCase();
    return normalized === optionValue || normalized === optionLabel;
  });

  return match?.value ?? raw;
}

function ChipSelector({
  label,
  options,
  value,
  onChange,
  allowCustom = true,
}: {
  label: string;
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
  allowCustom?: boolean;
}) {
  const [customInput, setCustomInput] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const normalizedValue = String(value || '').trim().toLowerCase();
  const isSelected = (option: ChipOption) => {
    const optionValue = String(option.value || '').toLowerCase();
    const optionLabel = String(option.label || '').toLowerCase();
    return Boolean(normalizedValue) && (normalizedValue === optionValue || normalizedValue === optionLabel);
  };
  const isCustomValue = Boolean(value) && !options.some((option) => isSelected(option));

  return (
    <div className="space-y-0">
      <div className="mb-3 flex items-center gap-3">
        <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-widest text-gray-500">{label}</span>
        <div className="h-px flex-1 bg-gray-100" />
      </div>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              onChange(isSelected(option) ? '' : option.value);
              setShowCustom(false);
              setCustomInput('');
            }}
            className={[
              'rounded-full border px-3 py-1.5 text-sm transition-all duration-150',
              isSelected(option)
                ? 'border-teal-600 bg-teal-600 font-semibold text-white shadow-sm'
                : 'border-gray-200 bg-white text-gray-600 hover:border-teal-300 hover:bg-teal-50/50 hover:text-teal-700',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}

        {allowCustom && !showCustom ? (
          <button
            type="button"
            onClick={() => setShowCustom(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-400 transition-colors hover:border-gray-400 hover:text-gray-600"
          >
            <Plus className="h-3 w-3" />
            Other
          </button>
        ) : null}

        {allowCustom && showCustom ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customInput}
              onChange={(event) => setCustomInput(event.target.value)}
              placeholder="Type value..."
              className="w-36 rounded-full border border-teal-400 px-3 py-1.5 text-sm outline-none ring-1 ring-teal-300"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && customInput.trim()) {
                  onChange(customInput.trim());
                  setShowCustom(false);
                  setCustomInput('');
                }
                if (event.key === 'Escape') {
                  setShowCustom(false);
                  setCustomInput('');
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                setShowCustom(false);
                setCustomInput('');
              }}
              className="text-gray-400 transition-colors hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      {isCustomValue ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[11px] text-gray-400">Custom:</span>
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700">
            {formatDisplayValue(value)}
          </span>
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-gray-300 transition-colors hover:text-red-400"
            aria-label="Clear custom value"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function RoomProfileForm({ profile, roomType, saving, onChange, onSave }: Props) {
  const p = useMemo(() => (profile && typeof profile === 'object' ? profile : {}), [profile]);
  const [savedRecently, setSavedRecently] = useState(false);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const fields = ROOM_PROFILE_FIELDS[roomType] ?? ROOM_PROFILE_FIELDS.OTHER;
  const subtitle = ROOM_SUBTITLE[roomType] ?? ROOM_SUBTITLE.DEFAULT;

  function queueAutoSave(nextProfile: Record<string, any>) {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await onSave(nextProfile);
        setSavedRecently(true);
        window.setTimeout(() => setSavedRecently(false), 1400);
      } catch (error) {
        console.error('Profile auto-save failed:', error);
      }
    }, 320);
  }

  function updateProfileField(fieldKey: string, fieldValue: string) {
    const nextProfile = { ...p, [fieldKey]: fieldValue };
    onChange(nextProfile);
    setSavedRecently(false);
    queueAutoSave(nextProfile);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="px-5 pb-4 pt-5">
        <h3 className="text-sm font-semibold text-gray-800">Room Profile</h3>
        <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
      </div>

      <div className="divide-y divide-gray-100">
        {fields.map((field) => (
          <div key={field.key} className="px-5 py-4">
            <ChipSelector
              label={field.label}
              options={field.options}
              value={normalizeValue(String(p[field.key] || ''), field.options)}
              onChange={(value) => updateProfileField(field.key, value)}
              allowCustom={field.allowCustom !== false}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between bg-gray-50/50 px-5 py-3">
        <p className="text-xs text-gray-400">Changes save automatically when you select a chip.</p>

        {saving ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-teal-600">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving...
          </span>
        ) : savedRecently ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
            <CheckCircle2 className="h-3 w-3" />
            Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}
