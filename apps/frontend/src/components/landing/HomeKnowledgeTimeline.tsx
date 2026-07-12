const YEARS = [
  { year: 'Purchase', title: 'Inspection' },
  { year: 'Move in', title: 'Warranties' },
  { year: 'Remodel', title: 'Kitchen' },
  { year: 'Claim', title: 'Insurance' },
  { year: 'Replace', title: 'Roof' },
  { year: 'Next owner', title: 'Complete history' },
];

export default function HomeKnowledgeTimeline() {
  return (
    <section className="bg-slate-50 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-2 text-xs font-semibold text-brand-700">Knowledge compounds</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Every year, your home knows more.</h2>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {YEARS.map((item, index) => (
            <article key={item.year} className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-bold text-brand-700">{item.year}</span>
              <h3 className="mt-2 text-sm font-semibold text-slate-900">{item.title}</h3>
              {index < YEARS.length - 1 ? <span className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 text-lg text-brand-300 lg:block">→</span> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
