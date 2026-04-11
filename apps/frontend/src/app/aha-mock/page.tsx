'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Clock3,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import styles from './aha-mock.module.css';

type Persona = 'HOMEOWNER' | 'PROVIDER';
type VisitMode = 'FIRST_LOGIN' | 'RETURNING_VISIT';

type Snapshot = {
  heroEyebrow: string;
  headline: string;
  subhead: string;
  ctaLabel: string;
  heroPills: string[];
  confidence: number;
  briefNotes: string[];
  metrics: Array<{ label: string; value: string; delta: string }>;
  feed: string[];
  steps: string[];
};

const MOCK: Record<Persona, Record<VisitMode, Snapshot>> = {
  HOMEOWNER: {
    FIRST_LOGIN: {
      heroEyebrow: 'Personalized Home Brief',
      headline: 'You could save $420 this month. Start with one 2-minute move.',
      subhead:
        'We ranked your next action by impact, urgency, and confidence so your first click feels immediately valuable.',
      ctaLabel: 'Start Guided Check',
      heroPills: ['ETA 2 min', 'Projected upside $280/yr', 'Confidence 91%'],
      confidence: 91,
      briefNotes: [
        'Coverage gap detected after recent weather-risk shift.',
        'One maintenance item moved to overdue and now affects risk score.',
        'Provider pricing in your area dropped this week.',
      ],
      metrics: [
        { label: 'HomeScore Opportunity', value: '+6', delta: 'Most impact from coverage action' },
        { label: 'Projected Risk Exposure', value: '$8,300', delta: '14% reduction possible this week' },
        { label: 'Active Decisions', value: '1', delta: 'Everything else can wait for now' },
      ],
      feed: [
        'Roof risk moved from Moderate to Elevated after hail advisory.',
        'Water-heater maintenance overdue by 12 days.',
        'HVAC tune-up market rates are down 9% in your zip code.',
      ],
      steps: [
        'Open recommended action and review impact preview.',
        'Confirm one-click recommendation in less than 2 minutes.',
        'See immediate score and savings delta update on dashboard.',
      ],
    },
    RETURNING_VISIT: {
      heroEyebrow: 'Momentum Snapshot',
      headline: 'Great progress. Risk exposure is already down 14% this week.',
      subhead:
        'You have one high-impact follow-up left. Finishing it now likely locks in this week’s savings and stabilizes your score.',
      ctaLabel: 'Book Recommended Provider',
      heroPills: ['ETA 90 sec', 'Potential loss avoided ~$1,200', 'Confidence 88%'],
      confidence: 88,
      briefNotes: [
        'Daily pulse streak reached 5 days.',
        'HomeScore improved from 73 to 79.',
        'Only one urgent item remains in your queue.',
      ],
      metrics: [
        { label: 'HomeScore Change', value: '+6', delta: 'Strong upward momentum since last visit' },
        { label: 'Current Weekly Savings', value: '$94', delta: 'Estimated from completed actions' },
        { label: 'Urgent Actions', value: '1', delta: 'Single recommended next move' },
      ],
      feed: [
        'Leak anomaly now low risk after your prior update.',
        'Insurance optimization review is still pending confirmation.',
        'Weather severity forecast softened for next 72 hours.',
      ],
      steps: [
        'Review one pending high-impact recommendation.',
        'Schedule preventive task with one tap.',
        'Return tomorrow to verify score stabilization.',
      ],
    },
  },
  PROVIDER: {
    FIRST_LOGIN: {
      heroEyebrow: 'Revenue Pulse',
      headline: 'Three warm leads today. One is a 92% fit and ready now.',
      subhead:
        'We prioritized your queue by conversion probability, travel efficiency, and schedule alignment so you can win the next booking quickly.',
      ctaLabel: 'Send Fast Quote',
      heroPills: ['ETA 1 min', 'Expected value $340', 'Lead fit 92%'],
      confidence: 92,
      briefNotes: [
        'Best-fit inspection request is 4.2 miles away.',
        'No schedule conflict detected for this job window.',
        'Response speed historically lifts conversion for this lead type.',
      ],
      metrics: [
        { label: 'Pipeline Today', value: '$1,120', delta: 'From top-ranked active opportunities' },
        { label: 'Utilization Forecast', value: '84%', delta: 'One acceptance from full target day' },
        { label: 'Priority Leads', value: '3', delta: 'Ranked by fit and expected value' },
      ],
      feed: [
        'Two homeowners favorited your profile overnight.',
        'Your average response time improved by 22% this week.',
        'One afternoon slot has highest expected revenue density.',
      ],
      steps: [
        'Open top-ranked lead and preview quick quote guidance.',
        'Send response using one-click template.',
        'Watch utilization and revenue forecast update in real time.',
      ],
    },
    RETURNING_VISIT: {
      heroEyebrow: 'Operator Mode',
      headline: 'You are one response away from a fully optimized day.',
      subhead:
        'The remaining request is warm, nearby, and still uncontested. Reply now to maximize today’s schedule and expected revenue.',
      ctaLabel: 'Reply Now',
      heroPills: ['ETA 45 sec', 'Expected value $210', 'Lead heat High'],
      confidence: 89,
      briefNotes: [
        'Last incoming request arrived 43 minutes ago.',
        'No competing provider response yet.',
        'Calendar remains collision-free for this slot.',
      ],
      metrics: [
        { label: 'Week Revenue Trend', value: '+11%', delta: 'Compared with prior week pace' },
        { label: 'Current Rating', value: '4.8', delta: 'Up from 4.7 after recent completions' },
        { label: 'Unclaimed Warm Leads', value: '1', delta: 'Highest leverage action right now' },
      ],
      feed: [
        'Cancellation risk is low across confirmed bookings.',
        'Portfolio view rate increased 18% this week.',
        'Fast response behavior remains your best conversion lever.',
      ],
      steps: [
        'Send response to remaining warm request.',
        'Confirm appointment and auto-sync calendar.',
        'Review refreshed utilization forecast for tomorrow.',
      ],
    },
  },
};

export default function AhaMockPage() {
  const [persona, setPersona] = useState<Persona>('HOMEOWNER');
  const [visitMode, setVisitMode] = useState<VisitMode>('FIRST_LOGIN');
  const snapshot = useMemo(() => MOCK[persona][visitMode], [persona, visitMode]);

  return (
    <main className={styles.canvas}>
      <section className={styles.hero}>
        <div className={styles.heroBackdrop} />
        <div className={styles.gridLines} />

        <div className={styles.heroInner}>
          <div className={styles.topBar}>
            <div className={styles.brand}>
              <span className={styles.brandMark}>C2</span>
              <span className={styles.brandText}>Aha Experience v2 Mock</span>
            </div>

            <div className={styles.modeCluster}>
              <ModeButton
                active={persona === 'HOMEOWNER'}
                onClick={() => setPersona('HOMEOWNER')}
                label="Homeowner"
              />
              <ModeButton
                active={persona === 'PROVIDER'}
                onClick={() => setPersona('PROVIDER')}
                label="Provider"
              />
              <ModeButton
                active={visitMode === 'FIRST_LOGIN'}
                onClick={() => setVisitMode('FIRST_LOGIN')}
                label="First Login"
              />
              <ModeButton
                active={visitMode === 'RETURNING_VISIT'}
                onClick={() => setVisitMode('RETURNING_VISIT')}
                label="Returning"
              />
            </div>
          </div>

          <div className={`${styles.heroGrid} ${styles.reveal}`}>
            <div>
              <p className={styles.eyebrow}>{snapshot.heroEyebrow}</p>
              <h1 className={styles.headline}>{snapshot.headline}</h1>
              <p className={styles.subhead}>{snapshot.subhead}</p>

              <div className={styles.primaryRail}>
                <button type="button" className={styles.mainCta}>
                  {snapshot.ctaLabel}
                  <ArrowRight className="h-4 w-4" />
                </button>
                {snapshot.heroPills.map((pill) => (
                  <span key={pill} className={styles.pill}>
                    {pill}
                  </span>
                ))}
              </div>
            </div>

            <aside className={styles.briefPanel}>
              <p className={styles.briefHeader}>Live Brief Confidence</p>
              <div className={styles.confidenceRing}>{snapshot.confidence}%</div>
              <div className={styles.briefList}>
                {snapshot.briefNotes.map((note) => (
                  <p key={note} className={styles.briefItem}>
                    {note}
                  </p>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className={`${styles.metricsRail} ${styles.reveal}`}>
        {snapshot.metrics.map((metric) => (
          <div key={metric.label} className={styles.metricCell}>
            <p className={styles.metricLabel}>{metric.label}</p>
            <p className={styles.metricValue}>{metric.value}</p>
            <p className={styles.metricDelta}>{metric.delta}</p>
          </div>
        ))}
      </section>

      <section className={styles.body}>
        <div className={`${styles.feedShell} ${styles.reveal}`}>
          <h2 className={styles.feedTitle}>Since Last Visit</h2>
          <div className={styles.feedGrid}>
            {snapshot.feed.map((item) => (
              <div key={item} className={styles.feedItem}>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className={`${styles.storyboard} ${styles.reveal}`}>
          <h2 className={styles.storyboardTitle}>Aha Flow Storyboard</h2>
          <div className={styles.steps}>
            {snapshot.steps.map((step, index) => (
              <div key={step} className={styles.step}>
                <span className={styles.stepIndex}>{index + 1}</span>
                <p className={styles.stepText}>{step}</p>
              </div>
            ))}
          </div>
          <p className={styles.footerNote}>
            This mock is intentionally cinematic and focused on one decisive action so each visit feels outcome-first, not dashboard-first.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            Designed to create immediate emotional impact.
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-4 w-4 text-cyan-300" />
            Time-to-value visible in first viewport.
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-cyan-300" />
            Trust context included with every recommendation.
          </span>
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-cyan-300" />
            Progress and momentum shown before detail.
          </span>
        </div>
      </section>
    </main>
  );
}

type ModeButtonProps = {
  active: boolean;
  onClick: () => void;
  label: string;
};

function ModeButton({ active, onClick, label }: ModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${styles.modeButton} ${active ? styles.modeButtonActive : ''}`}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}
