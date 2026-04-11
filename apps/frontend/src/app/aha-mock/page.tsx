'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
} from 'lucide-react';
import styles from './aha-mock.module.css';

type Persona = 'HOMEOWNER' | 'PROVIDER';
type VisitMode = 'FIRST_LOGIN' | 'RETURNING_VISIT';

type Snapshot = {
  heroTitle: string;
  heroDetail: string;
  impactPill: string;
  primaryAction: {
    title: string;
    detail: string;
    eta: string;
    impact: string;
    cta: string;
  };
  changes: string[];
  confidence: string[];
  moments: string[];
};

const MOCK: Record<Persona, Record<VisitMode, Snapshot>> = {
  HOMEOWNER: {
    FIRST_LOGIN: {
      heroTitle: 'Welcome back, Madhu. Your home could save $420 this month.',
      heroDetail:
        'We found one insurance optimization, one maintenance risk, and one quick action to improve your HomeScore in under 3 minutes.',
      impactPill: '+6 HomeScore Opportunity',
      primaryAction: {
        title: 'Run Coverage Gap Check for Maple Street',
        detail: 'Your deductible is out of sync with current weather-risk profile.',
        eta: '2 min',
        impact: '$280 annual upside',
        cta: 'Start Guided Check',
      },
      changes: [
        'Roof risk moved from Moderate to Elevated after local hail advisory.',
        'Water-heater maintenance is now overdue by 12 days.',
        'Provider pricing in your zip dropped 9% for annual HVAC tune-up.',
      ],
      confidence: [
        'Data refreshed 8 minutes ago from policy + task + weather feeds.',
        'Recommendation confidence: 91%',
        'One-click rollback available for every automated suggestion.',
      ],
      moments: [
        'Login transition: “Preparing your personalized home brief…”',
        'Hero reveal with one decisive recommendation',
        'Completion micro-celebration after first action',
      ],
    },
    RETURNING_VISIT: {
      heroTitle: 'Great momentum. You reduced projected risk exposure by 14%.',
      heroDetail:
        'Last action worked. We now recommend one follow-up task to lock in savings before the weekend.',
      impactPill: 'Risk -14% This Week',
      primaryAction: {
        title: 'Book Preventive Plumbing Inspection',
        detail: 'Recent pressure anomaly suggests minor leak risk in utility zone.',
        eta: '90 sec',
        impact: 'Avoid ~ $1,200 potential repair',
        cta: 'Book Recommended Provider',
      },
      changes: [
        'Daily pulse streak reached 5 days.',
        'HomeScore improved from 73 to 79.',
        'Three open actions reduced to one high-impact next step.',
      ],
      confidence: [
        'Forecast uses your property history and neighborhood trends.',
        'No unresolved critical alerts today.',
        'Action queue is prioritized by financial impact first.',
      ],
      moments: [
        'Personal progress badge appears instantly on load',
        '“Since last visit” strip confirms concrete progress',
        'Focused CTA keeps the visit outcome-driven',
      ],
    },
  },
  PROVIDER: {
    FIRST_LOGIN: {
      heroTitle: 'Welcome back. You have 3 requests likely to convert today.',
      heroDetail:
        'We prioritized jobs by conversion probability, travel efficiency, and revenue fit so you can act fast.',
      impactPill: 'Est. $1,120 Pipeline Today',
      primaryAction: {
        title: 'Respond to Home Inspection Request (92% fit)',
        detail: 'Closest route match and highest review alignment in your queue.',
        eta: '1 min',
        impact: '$340 expected revenue',
        cta: 'Send Fast Quote',
      },
      changes: [
        'Your response time improved by 22% this week.',
        'Two homeowners favorited your profile overnight.',
        'Calendar has one high-value opening this afternoon.',
      ],
      confidence: [
        'Lead scoring calibrated with your completed booking history.',
        'Route and availability conflicts pre-checked.',
        'Suggested pricing within your configured range.',
      ],
      moments: [
        'Login lands on “highest-converting lead” first',
        'Quick actions adapt to real booking context',
        'Post-quote feedback celebrates speed + expected value',
      ],
    },
    RETURNING_VISIT: {
      heroTitle: 'Strong day so far. You are 1 response away from full schedule.',
      heroDetail:
        'One pending request is still warm. Claiming it now likely completes your target utilization for today.',
      impactPill: 'Utilization at 84%',
      primaryAction: {
        title: 'Reply to Minor Repair Request (sent 43 min ago)',
        detail: 'Lead intent is high and there is no competing provider response yet.',
        eta: '45 sec',
        impact: '$210 expected revenue',
        cta: 'Reply Now',
      },
      changes: [
        'Average rating moved from 4.7 to 4.8.',
        'Cancellation risk is down to low for all confirmed bookings.',
        'Projected week revenue up 11% versus last week.',
      ],
      confidence: [
        'Predictions combine acceptance rates + distance + schedule fit.',
        'No calendar collisions detected.',
        'All active jobs include next-step reminders.',
      ],
      moments: [
        'Returning users see momentum and one clear next move',
        'Context-rich CTA removes decision fatigue',
        'Outcome feedback reinforces business progress',
      ],
    },
  },
};

const personaButtonClass =
  'inline-flex min-h-[42px] items-center rounded-full border px-4 py-2 text-sm font-semibold transition-colors';

const sectionShellClass =
  'rounded-2xl border border-slate-200/80 bg-white/85 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]';

export default function AhaMockPage() {
  const [persona, setPersona] = useState<Persona>('HOMEOWNER');
  const [visitMode, setVisitMode] = useState<VisitMode>('FIRST_LOGIN');

  const snapshot = useMemo(() => MOCK[persona][visitMode], [persona, visitMode]);

  return (
    <main className={styles.canvas}>
      <div className="relative overflow-hidden">
        <div className={`${styles.orb} ${styles.orbA}`} />
        <div className={`${styles.orb} ${styles.orbB}`} />

        <section className="relative px-4 pb-6 pt-10 sm:px-6 lg:px-8 lg:pt-14">
          <div className="mx-auto max-w-7xl">
            <div className={`${styles.reveal} grid gap-6 lg:grid-cols-[1.2fr_0.8fr]`}>
              <div>
                <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-teal-800">
                  <Sparkles className="h-3.5 w-3.5" />
                  Aha Experience Mock
                </p>
                <h1 className="max-w-4xl text-balance font-heading text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.85rem]">
                  {snapshot.heroTitle}
                </h1>
                <p className="mt-3 max-w-3xl text-pretty text-base text-slate-600 sm:text-lg">
                  {snapshot.heroDetail}
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPersona('HOMEOWNER')}
                    aria-pressed={persona === 'HOMEOWNER'}
                    className={`${personaButtonClass} ${
                      persona === 'HOMEOWNER'
                        ? 'border-teal-600 bg-teal-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-teal-300'
                    }`}
                  >
                    Homeowner View
                  </button>
                  <button
                    type="button"
                    onClick={() => setPersona('PROVIDER')}
                    aria-pressed={persona === 'PROVIDER'}
                    className={`${personaButtonClass} ${
                      persona === 'PROVIDER'
                        ? 'border-cyan-700 bg-cyan-700 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-cyan-300'
                    }`}
                  >
                    Provider View
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisitMode('FIRST_LOGIN')}
                    aria-pressed={visitMode === 'FIRST_LOGIN'}
                    className={`${personaButtonClass} ${
                      visitMode === 'FIRST_LOGIN'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'
                    }`}
                  >
                    First Login
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisitMode('RETURNING_VISIT')}
                    aria-pressed={visitMode === 'RETURNING_VISIT'}
                    className={`${personaButtonClass} ${
                      visitMode === 'RETURNING_VISIT'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'
                    }`}
                  >
                    Returning Visit
                  </button>
                </div>
              </div>

              <aside className={`${sectionShellClass} h-fit`}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Instant Brief
                </p>
                <div className={`${styles.shimmer} mb-4 rounded-xl px-3 py-2 text-sm font-semibold text-white`}>
                  {snapshot.impactPill}
                </div>
                <div className="space-y-2 text-sm text-slate-600">
                  <p className="inline-flex items-center gap-2">
                    <Timer className="h-4 w-4 text-slate-500" />
                    Time-to-value target: under 10 seconds
                  </p>
                  <p className="inline-flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-slate-500" />
                    Primary KPI visible before any scroll
                  </p>
                  <p className="inline-flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-slate-500" />
                    Every recommendation includes confidence context
                  </p>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </div>

      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[1.25fr_1fr_1fr]">
          <article className={`${sectionShellClass} ${styles.reveal}`}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Highest-Impact Next Step
            </p>
            <h2 className="mb-2 text-2xl font-semibold leading-tight text-slate-900">
              {snapshot.primaryAction.title}
            </h2>
            <p className="mb-4 text-sm text-slate-600">{snapshot.primaryAction.detail}</p>
            <div className="mb-5 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
                ETA {snapshot.primaryAction.eta}
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                Impact {snapshot.primaryAction.impact}
              </span>
            </div>
            <button
              type="button"
              className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
            >
              {snapshot.primaryAction.cta}
              <ArrowRight className="h-4 w-4" />
            </button>
          </article>

          <article className={`${sectionShellClass} ${styles.reveal}`}>
            <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              <CalendarClock className="h-3.5 w-3.5" />
              Since Last Visit
            </p>
            <ul className="space-y-2 text-sm text-slate-700">
              {snapshot.changes.map((item) => (
                <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </article>

          <article className={`${sectionShellClass} ${styles.reveal}`}>
            <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              <CircleDollarSign className="h-3.5 w-3.5" />
              Trust & Confidence
            </p>
            <ul className="space-y-2 text-sm text-slate-700">
              {snapshot.confidence.map((item) => (
                <li key={item} className="rounded-lg border border-teal-100 bg-teal-50/70 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </article>
        </div>

        <div className={`${styles.reveal} mx-auto mt-4 max-w-7xl rounded-2xl border border-slate-200 bg-white/90 p-5`}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Experience Moments in This Mock
          </p>
          <div className="grid gap-2 md:grid-cols-3">
            {snapshot.moments.map((moment, index) => (
              <div
                key={moment}
                className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3 text-sm text-slate-700"
              >
                <p className="mb-1 text-xs font-semibold text-slate-400">Moment {index + 1}</p>
                {moment}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
