import Link from 'next/link';
import { ArrowDown, CheckCircle2 } from 'lucide-react';
import { resolveIconByToken } from '@/lib/icons';

const STORIES = [
  {
    title: 'The roof remembers',
    iconToken: 'shield-check',
    items: ['Inspection', 'Warranty', 'Repair', 'Insurance claim', 'Replacement', 'Buyer history'],
  },
  {
    title: 'Every project keeps its context',
    iconToken: 'wrench',
    items: ['Estimate', 'Contractor', 'Materials', 'Invoice', 'Photos', 'Home value'],
  },
  {
    title: 'Care becomes guidance',
    iconToken: 'calendar',
    items: ['Last service', 'Parts replaced', 'Cost history', 'Next service', 'Risk avoided', 'Savings found'],
  },
];

export default function Features() {
  return (
    <section id="features" className="bg-slate-50 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 text-center">
          <p className="mb-2 text-xs font-semibold text-brand-700">One connected home</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">One memory. Every part of your home.</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">Each record adds meaning to everything that came before it.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {STORIES.map((story) => {
            const StoryIcon = resolveIconByToken(story.iconToken);
            return (
              <article key={story.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><StoryIcon className="h-5 w-5" /></span>
                  <h3 className="mb-0 text-base font-semibold text-slate-900">{story.title}</h3>
                </div>
                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-3">
                  {story.items.map((item, index) => (
                    <div key={item} className="contents">
                      <div className={`rounded-xl border px-3 py-2 text-center text-xs font-medium ${index === story.items.length - 1 ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                        {index === story.items.length - 1 ? <CheckCircle2 className="mx-auto mb-1 h-3.5 w-3.5" /> : null}{item}
                      </div>
                      {index % 2 === 0 && index < story.items.length - 1 ? <span className="text-brand-400" aria-hidden="true">→</span> : null}
                      {index % 2 === 1 && index < story.items.length - 1 ? <ArrowDown className="col-span-3 mx-auto h-3.5 w-3.5 text-brand-400" aria-hidden="true" /> : null}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <Link href="/signup" className="inline-flex min-h-[44px] items-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700">Start your home&apos;s history</Link>
        </div>
      </div>
    </section>
  );
}
