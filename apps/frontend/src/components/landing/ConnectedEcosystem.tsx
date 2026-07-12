const BENEFITS = ['Better recommendations', 'Better maintenance knowledge', 'Trusted relationships', 'Neighborhood insight', 'Clearer homeowner guidance'];

export default function ConnectedEcosystem() {
  return (
    <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center shadow-sm sm:p-8">
        <p className="text-xs font-semibold text-brand-700">A better future for homeownership</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">One connected home. An entire ecosystem.</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">When homes preserve their knowledge, homeowners make better decisions. Professionals arrive with context. Neighborhoods learn from what came before.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {BENEFITS.map((benefit) => <span key={benefit} className="rounded-full border border-brand-100 bg-white px-3 py-1.5 text-xs font-medium text-brand-700">{benefit}</span>)}
        </div>
      </div>
    </section>
  );
}
