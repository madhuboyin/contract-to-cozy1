import { ArrowDown, CheckCircle2 } from 'lucide-react';

const PHILOSOPHY = [
  { title: 'Organize', description: 'Bring every record, responsibility, project, and decision into one connected home.' },
  { title: 'Understand', description: 'Know what happened, what matters now, and what your home will need next.' },
  { title: 'Act', description: 'Maintain, improve, protect, save, and prepare with the full story in front of you.' },
];

export default function HomePhilosophy() {
  return (
    <section className="border-b border-slate-200/70 bg-white px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-2 text-xs font-semibold text-brand-700">Homeownership gets more complicated every year</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Your home should not depend on your memory.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">The longer you own a home, the more its story spreads across inboxes, folders, notes, and conversations. Contract to Cozy brings that story back together—and makes it useful.</p>
        </div>
        <div className="mt-9 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
          {PHILOSOPHY.map((item, index) => (
            <div key={item.title} className="contents">
              <article className="rounded-2xl border border-slate-200/80 bg-slate-50 p-5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white"><CheckCircle2 className="h-4 w-4" /></span>
                <h3 className="mt-3 text-lg font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.description}</p>
              </article>
              {index < PHILOSOPHY.length - 1 ? <ArrowDown className="mx-auto h-5 w-5 text-brand-500 md:-rotate-90" aria-hidden="true" /> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
