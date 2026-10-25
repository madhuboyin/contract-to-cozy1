import type { AskPresentationBlock } from '@/features/ask/types';

type SummaryBullet = NonNullable<Extract<AskPresentationBlock, { type: 'SUMMARY' }>['bullets']>[number];

export function SummaryBullets({ bullets }: { bullets: SummaryBullet[] }) {
  return (
    <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700" aria-label="Key points">
      {bullets.map((bullet, index) => (
        <li key={`${bullet.label ?? 'point'}-${index}`} className="flex items-start gap-2.5">
          <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" />
          <span>
            {bullet.label && <strong className="font-semibold text-slate-900">{bullet.label}: </strong>}
            {bullet.body}
          </span>
        </li>
      ))}
    </ul>
  );
}
