import { DollarSign, FileText, Users, Wrench } from 'lucide-react';

const CATEGORIES = [
  {
    icon: FileText,
    title: 'Records and history',
    description: 'Documents, closing records, warranties, home timeline',
  },
  {
    icon: Wrench,
    title: 'Care and planning',
    description: 'Maintenance, seasonal planning, repairs, projects',
  },
  {
    icon: DollarSign,
    title: 'Money and value',
    description: 'Budgets, insurance, home value, savings and rebates',
  },
  {
    icon: Users,
    title: 'People and place',
    description: 'Trusted providers, neighborhood, local recommendations',
  },
];

export default function HomePhilosophy() {
  return (
    <section className="border-b border-slate-200/70 bg-slate-50 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-2 text-sm font-semibold text-blue-600">everything your home knows, connected</p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">One memory. Every part of your home.</h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((category) => (
            <article key={category.title} className="rounded-2xl border border-slate-200 bg-white p-5">
              <category.icon className="h-6 w-6 text-slate-900" strokeWidth={1.75} />
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{category.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{category.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
