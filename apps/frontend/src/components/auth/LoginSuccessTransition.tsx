'use client';

import { UserRole } from '@/types';
import styles from './LoginSuccessTransition.module.css';

type LoginSuccessTransitionProps = {
  role: UserRole;
  firstName?: string | null;
};

const COPY: Record<UserRole, { eyebrow: string; subtitle: string; steps: string[] }> = {
  HOMEOWNER: {
    eyebrow: 'Preparing Home Brief',
    subtitle: 'We are prioritizing your most valuable next home action.',
    steps: [
      'Syncing weather + maintenance + coverage signals',
      'Ranking one high-impact action for this visit',
      'Loading your personalized dashboard brief',
    ],
  },
  PROVIDER: {
    eyebrow: 'Preparing Provider Pulse',
    subtitle: 'We are ranking warm leads and today’s highest-converting booking move.',
    steps: [
      'Matching lead fit with your availability',
      'Prioritizing near-term revenue opportunities',
      'Loading your provider command center',
    ],
  },
  ADMIN: {
    eyebrow: 'Preparing Admin Workspace',
    subtitle: 'Loading analytics and operational controls.',
    steps: [
      'Refreshing system metrics',
      'Syncing queues and status checks',
      'Loading admin dashboard',
    ],
  },
};

export default function LoginSuccessTransition({ role, firstName }: LoginSuccessTransitionProps) {
  const copy = COPY[role];
  const namePrefix = firstName?.trim() ? `${firstName}, ` : '';

  return (
    <main className={styles.screen} aria-live="polite" aria-busy="true">
      <section className={styles.card}>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h1 className={styles.title}>Welcome back. {namePrefix}your personalized experience is loading.</h1>
        <p className={styles.subtitle}>{copy.subtitle}</p>
        <div className={styles.barShell}>
          <div className={styles.barFill} />
        </div>
        <div className={styles.steps}>
          {copy.steps.map((step) => (
            <p key={step} className={styles.step}>
              {step}
            </p>
          ))}
        </div>
      </section>
    </main>
  );
}
