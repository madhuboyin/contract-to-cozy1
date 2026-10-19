import Link from 'next/link';
import { buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import type { AskRecordRoomRow } from '@/features/ask/types';
import { AskCompactRow } from '../presentation/AskLayoutPrimitives';

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function RecordRoomRow({ room, propertyId }: { room: AskRecordRoomRow; propertyId: string }) {
  const facts = [
    room.type,
    room.floorLevel === null ? 'Floor not recorded' : `Level ${room.floorLevel}`,
    `${room.itemCount} ${room.itemCount === 1 ? 'item' : 'items'}`,
    `Updated ${dateFormat.format(new Date(room.updatedAt))}`,
  ].filter(Boolean);
  return (
    <AskCompactRow className="border-b border-slate-200 last:border-b-0" data-record-row={room.id}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{room.name}</p>
        <p className="mt-0.5 text-xs text-slate-500">{facts.join(' · ')}</p>
        {room.openTaskCount > 0 && <p className="mt-1 text-xs font-semibold text-amber-800">{room.openTaskCount} open {room.openTaskCount === 1 ? 'task' : 'tasks'}</p>}
      </div>
      <Link href={buildAskWorkspaceHref({ propertyId, question: room.askQuestion, from: 'record', backTo: '/dashboard/ask/record?section=rooms' })} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-emerald-900/20 px-3 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" aria-label={`Open ${room.name}`}>
        Open
      </Link>
    </AskCompactRow>
  );
}
