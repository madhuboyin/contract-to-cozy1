'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import styles from './AhaHero.module.css';

type AhaHeroProps = {
  userFirstName: string;
  propertyLabel: string;
  isReturningVisitor: boolean;
  title: string;
  subtitle: string;
  ctaHref: string;
  ctaLabel: string;
  etaLabel: string;
  impactLabel: string;
  confidenceLabel: string;
  feed: string[];
};

export default function AhaHero({
  userFirstName,
  propertyLabel,
  isReturningVisitor,
  title,
  subtitle,
  ctaHref,
  ctaLabel,
  etaLabel,
  impactLabel,
  confidenceLabel,
  feed,
}: AhaHeroProps) {
  return (
    <section className={styles.hero}>
      <div className={styles.grid}>
        <div>
          <p className={styles.eyebrow}>
            {isReturningVisitor ? 'Momentum Brief' : 'Personalized Home Brief'}
          </p>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.subtitle}>
            {subtitle} <span className="text-slate-300">For {propertyLabel}.</span>
          </p>

          <div className={styles.ctaRow}>
            <Link href={ctaHref} className={styles.cta}>
              {ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <span className={styles.pill}>{etaLabel}</span>
            <span className={styles.pill}>{impactLabel}</span>
            <span className={styles.pill}>{confidenceLabel}</span>
          </div>
        </div>

        <aside className={styles.brief}>
          <p className={styles.briefLabel}>{isReturningVisitor ? 'Welcome Back' : 'First-Visit Focus'}</p>
          <p className={styles.briefValue}>
            {isReturningVisitor ? `Good to see you, ${userFirstName}.` : `Welcome, ${userFirstName}.`}
          </p>
          <p className={styles.briefDetail}>
            {isReturningVisitor
              ? 'We prioritized one high-impact move so this visit ends with measurable progress.'
              : 'Start with one focused action to unlock immediate value before exploring the full dashboard.'}
          </p>
        </aside>
      </div>

      <div className={styles.feed}>
        <p className={styles.feedTitle}>Since Last Refresh</p>
        <div className={styles.feedGrid}>
          {feed.map((item) => (
            <div key={item} className={styles.feedItem}>
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
