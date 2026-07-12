const YEARS = [
  { year: 'Purchase', title: 'The first chapter', detail: 'Inspection, warranties, closing records' },
  { year: 'Move in', title: 'The home becomes yours', detail: 'Appliances, utilities, service plans' },
  { year: 'Remodel', title: 'The home improves', detail: 'Kitchen choices, contractor, receipts' },
  { year: 'Claim', title: 'The history protects you', detail: 'Damage, photos, insurance resolution' },
  { year: 'New roof', title: 'Value is preserved', detail: 'Permit, installer, 20-year warranty' },
  { year: 'Next owner', title: 'Nothing starts over', detail: 'Complete history transfers with the home' },
];

export default function HomeKnowledgeTimeline() {
  return (
    <section className="bg-slate-50 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-2 text-xs font-semibold text-brand-700">Knowledge compounds</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Every year, your home knows more.</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">Every chapter makes the next decision easier.</p>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {YEARS.map((item, index) => (
            <article key={item.year} className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-bold text-brand-700">{item.year}</span>
              <h3 className="mt-2 text-sm font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.detail}</p>
              {index < YEARS.length - 1 ? <span className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 text-lg text-brand-300 lg:block">→</span> : null}
            </article>
          ))}
        </div>
        <p className="mx-auto mt-7 max-w-3xl text-center text-base font-semibold text-slate-900">The history grows. The value compounds.</p>
      </div>
    </section>
  );
}
