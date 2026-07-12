import { CheckCircle2 } from 'lucide-react';

const ANSWERS = [
  ['Can I still claim my roof warranty?', 'Yes. Coverage expires May 2042.'],
  ['When was my HVAC last serviced?', 'March 2026. Next service due in 3 months.'],
  ['How much have I invested in this home?', '$18,420 across 4 years.'],
  ['Who painted the kitchen?', 'Bright Home Painting. Invoice, warranty, and photos attached.'],
  ['Can this home save money this year?', '$1,140 estimated from rebates and tax credits.'],
  ['Is my insurance still right for this home?', 'Review recommended before the September renewal.'],
  ['What needs attention next?', 'Gutter cleaning in 18 days. Roof inspection this fall.'],
  ['Could I sell with complete records?', '96% complete. Two documents still needed.'],
];

export default function HomeKnowledge() {
  return (
    <section className="bg-white px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="mb-2 text-xs font-semibold text-brand-700">Complete context, ready when you need it</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">What your home knows</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">Your home should be able to answer important questions instantly.</p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {ANSWERS.map(([question, answer]) => (
            <article key={question} className="rounded-2xl border border-slate-200/80 bg-slate-50 p-5">
              <h3 className="text-sm font-semibold text-slate-900">{question}</h3>
              <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-slate-600">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{answer}</span>
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
