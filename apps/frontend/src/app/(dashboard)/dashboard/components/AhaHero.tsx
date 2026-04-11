'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import styles from './AhaHero.module.css';

type AhaHeroProps = {
  propertyLabel: string;
  title: string;
  subtitle: string;
  briefLabel: string;
  briefValue: string;
  briefDetail: string;
  doNowLabel: string;
  waitRiskLabel: string;
  ctaHref: string;
  ctaLabel: string;
  onCtaClick?: () => void;
  etaLabel: string;
  impactLabel: string;
  confidenceLabel: string;
  feed: string[];
};

export default function AhaHero({
  propertyLabel,
  title,
  subtitle,
  briefLabel,
  briefValue,
  briefDetail,
  doNowLabel,
  waitRiskLabel,
  ctaHref,
  ctaLabel,
  onCtaClick,
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
            <Link href={ctaHref} className={styles.cta} onClick={onCtaClick}>
              {ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <span className={styles.pill}>{etaLabel}</span>
            <span className={styles.pill}>{impactLabel}</span>
            <span className={styles.pill}>{confidenceLabel}</span>
          </div>
        </div>

        <aside className={styles.brief}>
          <p className={styles.briefLabel}>{briefLabel}</p>
          <p className={styles.briefValue}>{briefValue}</p>
          <p className={styles.briefDetail}>{briefDetail}</p>
          <div className={styles.deltaGrid}>
            <div className={styles.deltaItem}>
              <span className={styles.deltaTitle}>Do now</span>
              <span className={styles.deltaText}>{doNowLabel}</span>
            </div>
            <div className={styles.deltaItem}>
              <span className={styles.deltaTitle}>Wait 30 days</span>
              <span className={styles.deltaText}>{waitRiskLabel}</span>
            </div>
          </div>
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
