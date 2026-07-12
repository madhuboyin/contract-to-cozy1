import { FileText, Home, ReceiptText, ShieldCheck, Users, Wrench } from 'lucide-react';

const CONNECTIONS = [
  { label: 'Warranty', detail: 'Roof · expires 2042', icon: ShieldCheck },
  { label: 'Repairs', detail: '12 events preserved', icon: Wrench },
  { label: 'Records', detail: 'Inspection · permits', icon: FileText },
  { label: 'People', detail: '7 trusted relationships', icon: Users },
  { label: 'Expenses', detail: '$18,420 invested', icon: ReceiptText },
];

export default function HeroMemoryVisual() {
  return (
    <div className="relative min-h-[390px] overflow-hidden rounded-[22px] border border-slate-200 bg-slate-50 p-4 shadow-[0_28px_55px_-35px_rgba(15,23,42,0.65)] sm:p-6">
      <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-100 bg-brand-50/50" />
      <div className="absolute left-1/2 top-1/2 h-px w-[82%] -translate-x-1/2 bg-brand-200" />
      <div className="absolute left-1/2 top-1/2 h-[78%] w-px -translate-y-1/2 bg-brand-200" />

      <div className="relative grid min-h-[340px] grid-cols-2 grid-rows-3 items-center gap-4">
        {CONNECTIONS.map((item, index) => {
          const Icon = item.icon;
          const position = [
            'self-start justify-self-start',
            'self-start justify-self-end',
            'col-span-2 self-center justify-self-center mt-20',
            'self-end justify-self-start',
            'self-end justify-self-end',
          ][index];
          return (
            <div key={item.label} className={`relative z-10 flex max-w-[170px] items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm ${position}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon className="h-4 w-4" /></span>
              <div><p className="mb-0 text-[11px] font-semibold text-slate-900">{item.label}</p><p className="mb-0 mt-0.5 text-[9px] text-slate-500">{item.detail}</p></div>
            </div>
          );
        })}

        <div className="absolute left-1/2 top-1/2 z-20 w-40 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-brand-200 bg-white p-4 text-center shadow-[0_18px_38px_-25px_rgba(15,23,42,0.65)]">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white"><Home className="h-5 w-5" /></span>
          <p className="mb-0 mt-3 text-[10px] font-semibold text-brand-700">14 MAPLE STREET</p>
          <p className="mb-0 mt-1 text-sm font-semibold text-slate-950">Permanent memory</p>
          <p className="mb-0 mt-1 text-[9px] text-slate-500">Everything connected</p>
        </div>
      </div>

      <div className="relative z-20 -mt-1 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-600 shadow-sm">
        <span>History</span><span className="text-brand-400">→</span><span>Context</span><span className="text-brand-400">→</span><span>Knowledge</span><span className="text-brand-400">→</span><span className="text-brand-700">Better decisions</span>
      </div>
    </div>
  );
}
