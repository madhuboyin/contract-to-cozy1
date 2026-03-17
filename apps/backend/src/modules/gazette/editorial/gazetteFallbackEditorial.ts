// apps/backend/src/modules/gazette/editorial/gazetteFallbackEditorial.ts
// Deterministic template-based editorial copy generation.
// Pure functions — no AI, no Prisma, no side effects.

// ---------------------------------------------------------------------------
// Headline templates per category
// ---------------------------------------------------------------------------

const HEADLINE_TEMPLATES: Record<string, (tag?: string, entityType?: string) => string> = {
  MAINTENANCE: (tag, entityType) =>
    tag ? `Your ${tag.toLowerCase()} needs attention` : 'Maintenance action required at your property',
  INCIDENT: () => 'Active incident detected at your property',
  CLAIMS: (tag) => (tag ? `Your ${tag.toLowerCase()} claim needs follow-up` : 'Insurance claim requires your attention'),
  INSURANCE: (tag) => (tag ? `Your ${tag.toLowerCase()} policy is expiring soon` : 'Insurance policy expiring soon'),
  WARRANTY: (tag) => (tag ? `Your ${tag.toLowerCase()} warranty is expiring` : 'Warranty expiring — act before coverage ends'),
  FINANCIAL: () => 'Financial update for your property',
  REFINANCE: () => 'Refinance opportunity: potential savings detected',
  NEIGHBORHOOD: (tag) => (tag ? `Neighborhood update: ${tag.toLowerCase()}` : 'New neighborhood activity near your property'),
  SEASONAL: (tag) => (tag ? `Seasonal task: ${tag.toLowerCase()}` : 'Seasonal home maintenance recommended'),
  SCORE: () => 'Your Home Score has been updated',
  DIGITAL_TWIN: () => 'Your Digital Twin data has new insights',
  RISK: () => 'Risk update for your property',
  GENERAL: () => 'Important update for your property',
};

/**
 * Build a deterministic fallback headline for a story.
 */
export function buildFallbackHeadline(
  category: string,
  storyTag?: string,
  entityType?: string,
): string {
  const template = HEADLINE_TEMPLATES[category];
  if (template) {
    return template(storyTag, entityType);
  }
  return `Update: ${category.charAt(0) + category.slice(1).toLowerCase()} activity at your property`;
}

// ---------------------------------------------------------------------------
// Summary templates per category
// ---------------------------------------------------------------------------

/**
 * Build a deterministic fallback summary (main body prose) for a story.
 */
export function buildFallbackSummary(
  category: string,
  supportingFacts: Record<string, unknown>,
): string {
  switch (category) {
    case 'MAINTENANCE': {
      const title = (supportingFacts.title as string) || 'maintenance task';
      const dueDate = supportingFacts.nextDueDate
        ? ` It is due by ${new Date(supportingFacts.nextDueDate as string).toLocaleDateString()}.`
        : '';
      const priority = supportingFacts.priority
        ? ` Priority: ${String(supportingFacts.priority).toLowerCase()}.`
        : '';
      return `A maintenance task requires your attention: "${title}".${dueDate}${priority} Keeping up with maintenance protects your home's value and prevents costly repairs.`;
    }
    case 'INCIDENT': {
      const severity = supportingFacts.severity
        ? ` (Severity: ${String(supportingFacts.severity).toLowerCase()})`
        : '';
      const description = (supportingFacts.description as string) || 'An incident has been reported at your property';
      return `${description}${severity}. Please review the incident details and take appropriate action to protect your home and ensure safety.`;
    }
    case 'CLAIMS': {
      const claimType = (supportingFacts.claimType as string) || 'insurance';
      const status = (supportingFacts.status as string) || 'open';
      return `Your ${claimType.toLowerCase()} claim is currently ${status.toLowerCase()}. Timely follow-up can help expedite resolution and ensure you receive the coverage you're entitled to.`;
    }
    case 'INSURANCE': {
      const policyType = (supportingFacts.policyType as string) || 'insurance policy';
      const daysUntil = supportingFacts.daysUntilExpiry as number | undefined;
      const days = daysUntil !== undefined ? ` in ${daysUntil} days` : '';
      return `Your ${policyType.toLowerCase()} policy is expiring${days}. Review your coverage options now to ensure uninterrupted protection for your home.`;
    }
    case 'WARRANTY': {
      const itemName = (supportingFacts.itemName as string) || 'appliance';
      const daysUntil = supportingFacts.daysUntilExpiry as number | undefined;
      const days = daysUntil !== undefined ? ` in ${daysUntil} days` : '';
      return `The warranty for your ${itemName.toLowerCase()} expires${days}. Consider whether extended coverage or a replacement plan makes sense before coverage lapses.`;
    }
    case 'REFINANCE': {
      const savings = supportingFacts.monthlySavings as number | undefined;
      const savingsText = savings ? ` You could save approximately $${Math.round(savings)}/month.` : '';
      return `Market conditions may present a refinancing opportunity for your mortgage.${savingsText} Review current rates to see if refinancing could reduce your monthly costs.`;
    }
    case 'SCORE': {
      const score = supportingFacts.score as number | undefined;
      const scoreText = score !== undefined ? ` Your current score is ${score}.` : '';
      return `Your Home Health Score has been updated.${scoreText} A higher score reflects better maintenance, financial health, and overall property condition.`;
    }
    case 'NEIGHBORHOOD': {
      const eventType = (supportingFacts.eventType as string) || 'activity';
      return `There is new ${eventType.toLowerCase()} in your neighborhood. Stay informed about local developments that may impact your property value or community.`;
    }
    case 'SEASONAL': {
      const season = (supportingFacts.season as string) || 'seasonal';
      return `It's time for your ${season.toLowerCase()} home maintenance checklist. Completing these tasks on schedule helps prevent damage and keeps your home in top condition.`;
    }
    case 'RISK': {
      const riskType = (supportingFacts.riskType as string) || 'risk factor';
      return `A ${riskType.toLowerCase()} risk has been identified for your property. Addressing this promptly can prevent escalation and protect your home's value.`;
    }
    case 'DIGITAL_TWIN': {
      return 'Your home\'s digital twin has been updated with new data. Review the latest insights to understand your property\'s condition and maintenance needs.';
    }
    case 'FINANCIAL': {
      return 'A financial update is available for your property. Review the latest information to stay on top of your home\'s financial health.';
    }
    default: {
      return 'An important update is available for your property. Please review the details to stay informed about your home.';
    }
  }
}

// ---------------------------------------------------------------------------
// Dek (sub-headline) templates per category
// ---------------------------------------------------------------------------

const DEK_TEMPLATES: Record<string, string> = {
  MAINTENANCE: 'Schedule this now to avoid costly repairs and protect your home value.',
  INCIDENT: 'Review the details and take action to ensure your home\'s safety.',
  CLAIMS: 'Follow up to keep your claim moving toward resolution.',
  INSURANCE: 'Ensure continuous coverage by reviewing your options before expiry.',
  WARRANTY: 'Check your options before coverage ends — extend or replace as needed.',
  FINANCIAL: 'Stay on top of your property\'s financial health.',
  REFINANCE: 'Lower your monthly payment — see if you qualify for a better rate.',
  NEIGHBORHOOD: 'Stay informed about what\'s happening near your home.',
  SEASONAL: 'Keep your home in top shape with timely seasonal maintenance.',
  SCORE: 'See how your home\'s health score has changed and what you can improve.',
  DIGITAL_TWIN: 'Your property data has been updated with new insights.',
  RISK: 'Act now to reduce risk and protect your home.',
  GENERAL: 'Review this update to stay informed about your property.',
};

/**
 * Build a deterministic fallback dek (sub-headline / supporting sentence).
 */
export function buildFallbackDek(category: string): string {
  return DEK_TEMPLATES[category] ?? 'Stay informed and take action to protect your home.';
}

// ---------------------------------------------------------------------------
// Ticker and edition-level copy
// ---------------------------------------------------------------------------

/**
 * Build a single ticker item string for the edition ticker bar.
 */
export function buildEditionTickerItem(headline: string, category: string): string {
  const categoryLabel = category.charAt(0) + category.slice(1).toLowerCase();
  return `[${categoryLabel}] ${headline}`;
}

/**
 * Build the edition-level summary headline.
 */
export function buildEditionSummaryHeadline(selectedCount: number, topCategory: string): string {
  const categoryLabel = topCategory.charAt(0) + topCategory.slice(1).toLowerCase();
  if (selectedCount === 1) {
    return `Your Weekly Home Gazette — 1 ${categoryLabel} Update`;
  }
  if (selectedCount <= 3) {
    return `Your Weekly Home Gazette — ${selectedCount} Updates Including ${categoryLabel}`;
  }
  return `Your Weekly Home Gazette — ${selectedCount} Things To Know About Your Property`;
}

/**
 * Build the edition-level summary deck.
 */
export function buildEditionSummaryDeck(selectedCount: number): string {
  if (selectedCount === 0) {
    return 'No significant updates this week — your home is in good shape.';
  }
  if (selectedCount === 1) {
    return 'One update needs your attention this week.';
  }
  if (selectedCount <= 4) {
    return `${selectedCount} updates curated for your property this week. Review and take action where needed.`;
  }
  return `${selectedCount} property updates this week — from maintenance to finances and neighborhood news. Stay ahead of what matters most.`;
}
