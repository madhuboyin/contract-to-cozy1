import { FileText, ReceiptText, Users, Wrench } from 'lucide-react';
import { landingStyles } from './landingStyles';

const CATEGORIES = [
  { icon: FileText, title: 'Records and documents', detail: 'Reports, warranties, receipts, and closing records' },
  { icon: Wrench, title: 'Repairs and maintenance', detail: 'Service history, recurring care, and replacement planning' },
  { icon: ReceiptText, title: 'Costs and improvements', detail: 'Project proof, expenses, and long-term value context' },
  { icon: Users, title: 'Providers and decisions', detail: 'Trusted relationships, recommendations, and prior choices' },
];

export default function PermanentHomeMemory() {
  return <section className={`bg-slate-50 ${landingStyles.section}`}>
    <div className={landingStyles.container}>
      <div className="mx-auto max-w-2xl text-center"><p className={landingStyles.eyebrow}>How ContractToCozy gets smarter</p><h2 className={landingStyles.heading}>Your home builds a permanent, useful memory</h2><p className={`mt-3 ${landingStyles.body}`}>Documents, inspections, repairs, warranties, projects, provider visits, and major decisions stay tied to the property—so future guidance has the full context.</p></div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{CATEGORIES.map(({ icon: Icon, title, detail }) => <article key={title} className={landingStyles.featureCard}><Icon className="h-5 w-5 text-slate-800" aria-hidden="true"/><h3 className="mb-0 mt-4 text-base font-semibold text-slate-900">{title}</h3><p className="mb-0 mt-2 text-sm leading-6 text-slate-600">{detail}</p></article>)}</div>
    </div>
  </section>;
}
