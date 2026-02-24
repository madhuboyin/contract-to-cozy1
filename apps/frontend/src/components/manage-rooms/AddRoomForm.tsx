'use client';

import { Loader2, Plus } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ROOM_CONFIG, getRoomConfig } from '@/lib/config/roomConfig';

import { MANAGE_ROOM_TYPE_VALUES, type ManageRoomType, getRoomTypeLabel } from './types';

type AddRoomFormProps = {
  roomType: ManageRoomType | '';
  customLabel: string;
  isAdding: boolean;
  onRoomTypeChange: (value: ManageRoomType) => void;
  onCustomLabelChange: (value: string) => void;
  onAddRoom: () => void;
};

export function AddRoomForm({
  roomType,
  customLabel,
  isAdding,
  onRoomTypeChange,
  onCustomLabelChange,
  onAddRoom,
}: AddRoomFormProps) {
  const selectedLabel = roomType ? getRoomTypeLabel(roomType) : '';

  return (
    <div className="mb-5 rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <Plus className="h-4 w-4 text-teal-600" />
        <h2 className="text-sm font-semibold text-gray-800">Add a room</h2>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="min-w-0 flex-1">
          <label className="mb-1.5 block text-xs font-semibold text-gray-600">Room type</label>
          <Select value={roomType || undefined} onValueChange={(value) => onRoomTypeChange(value as ManageRoomType)}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Select a room type" />
            </SelectTrigger>
            <SelectContent>
              {MANAGE_ROOM_TYPE_VALUES.map((value) => {
                const config = ROOM_CONFIG[value] ?? getRoomConfig(value);
                const Icon = config.icon;
                return (
                  <SelectItem key={value} value={value}>
                    <span className="flex items-center gap-2">
                      <Icon className={`h-3.5 w-3.5 ${config.iconColor}`} />
                      {getRoomTypeLabel(value)}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0 flex-1">
          <label className="mb-1.5 block text-xs font-semibold text-gray-600">
            Label
            <span className="ml-1 font-normal text-gray-400">(optional)</span>
          </label>
          <Input
            type="text"
            value={customLabel}
            onChange={(event) => onCustomLabelChange(event.target.value)}
            placeholder={roomType ? `Default: "${selectedLabel}"` : 'e.g., "Kids Bathroom"'}
            className="bg-white"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onAddRoom();
              }
            }}
          />
        </div>

        <button
          onClick={onAddRoom}
          disabled={!roomType || isAdding}
          className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isAdding ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Add room
            </>
          )}
        </button>
      </div>

      <p className="mt-2.5 text-xs text-gray-400">Leave label blank to use the room type as the name.</p>
    </div>
  );
}
