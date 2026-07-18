import { CalendarClock, CircleDollarSign, ShieldAlert, Wrench } from 'lucide-react';
import { landingStyles } from './landingStyles';

const ITEMS = [
  { icon: Wrench, label: 'Maintenance', text: 'HVAC service due this month' },
  { icon: ShieldAlert, label: 'Renewal', text: 'Home insurance renewal approaching' },
  { icon: CircleDollarSign, label: 'Savings', text: 'Property may qualify for a local rebate' },
  { icon: CalendarClock, label: 'Planning', text: 'Roof inspection recommended based on age' },
];

export default function HomeBriefPreview() {
  return <section className={`bg-white ${landingStyles.section}`}>
    <div className={landingStyles.container}>
      <div className="mx-auto max-w-2xl text-center">
        <p className={landingStyles.eyebrow}>Personalized to your home</p>
        <h2 className={landingStyles.heading}>Know what needs your attention now</h2>
        <p className={`mt-3 ${landingStyles.body}`}>ContractToCozy continuously turns your home&apos;s information into timely actions, savings, reminders, and recommendations.</p>
      </div>
      <div className={`mx-auto mt-8 max-w-3xl overflow-hidden ${landingStyles.productCard}`}>
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3"><p className="mb-0 text-xs font-semibold text-brand-700">EXAMPLE HOME BRIEF</p></div>
        <div className="divide-y divide-slate-200">
          {ITEMS.map(({ icon: Icon, label, text }) => <div key={text} className="flex items-center gap-4 px-5 py-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-4 w-4" aria-hidden="true" /></span><div><p className="mb-0 text-xs font-semibold text-slate-500">{label}</p><p className="mb-0 mt-0.5 text-sm font-semibold text-slate-900">{text}</p></div></div>)}
        </div>
      </div>
    </div>
  </section>;
}
