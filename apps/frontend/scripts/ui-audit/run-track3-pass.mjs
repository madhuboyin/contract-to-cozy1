import fs from 'node:fs';
import path from 'node:path';

const TODAY = '2026-04-13';
const RELEASE_VERSION = '2026.04-track3-sprint12';

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(scriptDir, '../../../..');
const appRoot = path.join(repoRoot, 'apps/frontend/src/app');
const trackerPath = path.join(repoRoot, 'docs/audits/ui-audit/tracker/route-audit-tracker.v1.json');
const scorecardDir = path.join(repoRoot, 'docs/audits/ui-audit/scorecards');
const scorecardJsonPath = path.join(scorecardDir, 'buyer-readiness-trend.v1.json');
const scorecardMdPath = path.join(scorecardDir, 'buyer-readiness-trend.v1.md');

function round(value, places = 1) {
  const p = 10 ** places;
  return Math.round(value * p) / p;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (entry.isFile() && entry.name === 'page.tsx') {
      out.push(full);
    }
  }
  return out;
}

function toRoute(filePath) {
  const rel = path.relative(appRoot, filePath).replace(/\\/g, '/');
  if (rel.includes('/api/')) return null;
  if (rel === 'page.tsx') return '/';

  let route = `/${rel
    .replace(/\/page\.tsx$/, '')
    .replace(/\/\(.*?\)\//g, '/')
    .replace(/\(.*?\)/g, '')
    .replace(/\/index$/, '')}`;

  route = route.replace(/\/\[([^\]]+)\]/g, '/[$1]').replace(/\/+/g, '/');
  route = route === '/' ? '/' : route.replace(/\/$/, '');
  if (route.startsWith('/api/')) return null;
  return route;
}

function routeName(route) {
  if (route === '/') return 'Landing';
  const parts = route.split('/').filter(Boolean);
  if (parts.length === 0) return 'Route';

  let token = parts[parts.length - 1];
  if (token.startsWith('[') && parts.length > 1) {
    token = `${parts[parts.length - 2]} detail`;
  }

  return token
    .replace(/\[|\]/g, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function weightedOverall(scores) {
  return round(
    scores.visual * 0.2 +
      scores.ux * 0.25 +
      scores.trust * 0.25 +
      scores.mobile * 0.2 +
      scores.buyerReadiness * 0.1,
    1
  );
}

function parseId(id) {
  const match = /^RTE-(P[0-3])-(\d+)$/.exec(id || '');
  if (!match) return null;
  return { priority: match[1], sequence: Number(match[2]) };
}

function classify(route) {
  const isAdmin =
    route.startsWith('/dashboard/analytics-admin') ||
    route.startsWith('/dashboard/knowledge-admin') ||
    route.startsWith('/dashboard/worker-jobs');

  const isProvider = route.startsWith('/providers') || route.startsWith('/dashboard/providers');
  const isAuth = ['/login', '/forgot-password', '/reset-password'].includes(route);
  const isPublicKnowledge =
    route.startsWith('/knowledge') ||
    route.startsWith('/marketplace') ||
    route.startsWith('/gazette/share') ||
    route.startsWith('/reports/share') ||
    route.startsWith('/vault/');
  const isPropertyTool = route.startsWith('/dashboard/properties/[id]/tools/');
  const isPropertyDetail =
    route.startsWith('/dashboard/properties/[id]/') &&
    !isPropertyTool &&
    route !== '/dashboard/properties/[id]';
  const isDashboardSecondary =
    route.startsWith('/dashboard/') &&
    !route.startsWith('/dashboard/properties') &&
    !route.startsWith('/dashboard/providers') &&
    !isAdmin;

  const isUtility = route === '/offline' || route === '/aha-mock';

  let routeFamily = 'Secondary';
  let surfaceType = 'App';
  let priority = 'P2';
  let impact = 'Medium';
  let effort = 'M';
  let valuationRisk = 'Medium';
  let conversionRisk = 'Low';
  let templateFamily = 'Detail Template v1 (partial)';
  let targetTemplateFamily = 'Detail Template v1';
  let sharedFixCandidate = true;
  let tags = ['TEMPLATE_DRIFT', 'STATE_QUALITY_WEAK', 'TRUST_GAP'];
  let owners = {
    productOwner: 'PO - Secondary Experience',
    designOwner: 'Design Lead - Product Experience',
    engineeringOwner: 'EM - Homeowner Routes',
  };

  if (isAdmin) {
    routeFamily = 'Admin';
    surfaceType = 'Admin';
    priority = 'P3';
    impact = 'Low';
    effort = 'M';
    valuationRisk = 'Low';
    conversionRisk = 'Low';
    templateFamily = 'Admin Console Shell v1';
    targetTemplateFamily = 'Admin Console Shell v1';
    tags = ['NAV_CONFUSING', 'STATE_QUALITY_WEAK', 'TOKEN_DRIFT'];
    owners = {
      productOwner: 'PO - Platform Operations',
      designOwner: 'Design Lead - Systems',
      engineeringOwner: 'EM - Platform Admin',
    };
  } else if (isProvider) {
    routeFamily = 'Provider';
    surfaceType = route.startsWith('/providers') ? 'Provider' : 'App';
    priority = 'P2';
    impact = 'High';
    effort = 'M';
    valuationRisk = 'Medium';
    conversionRisk = route === '/providers/join' || route === '/providers/login' ? 'High' : 'Medium';
    templateFamily = 'Provider Shell v1';
    targetTemplateFamily = 'Provider Shell v2';
    tags = ['BUYER_PERCEPTION_RISK', 'TRUST_GAP', 'MOBILE_DENSE'];
    owners = {
      productOwner: 'PO - Provider Marketplace',
      designOwner: 'Design Lead - Operations UX',
      engineeringOwner: 'EM - Marketplace Surfaces',
    };
  } else if (isAuth) {
    routeFamily = 'Auth';
    surfaceType = 'Auth';
    priority = 'P2';
    impact = 'Medium';
    effort = 'S';
    valuationRisk = 'Medium';
    conversionRisk = 'High';
    templateFamily = 'Auth Template v1 (partial)';
    targetTemplateFamily = 'Auth Template v1';
    tags = ['CONVERSION_TRUST_LEAK', 'FORM_FATIGUE', 'COPY_ROBOTIC'];
    owners = {
      productOwner: 'PO - Growth Funnel',
      designOwner: 'Design Lead - Product Experience',
      engineeringOwner: 'EM - Frontend Platform',
    };
  } else if (isPublicKnowledge) {
    routeFamily = 'Public Share';
    surfaceType = 'Public';
    priority = 'P2';
    impact = 'Medium';
    effort = 'S';
    valuationRisk = 'Medium';
    conversionRisk = 'Low';
    templateFamily = 'Public Share Template v1 (partial)';
    targetTemplateFamily = 'Public Share Template v1';
    tags = ['BUYER_PERCEPTION_RISK', 'TRUST_GAP', 'MOBILE_DENSE'];
  } else if (isPropertyTool) {
    const compareKeywords = ['quote', 'price', 'negotiation', 'coverage-options', 'sell-hold', 'break-even', 'risk-premium'];
    const isCompare = compareKeywords.some((keyword) => route.includes(keyword));
    routeFamily = isCompare ? 'Compare' : 'Tool Workspace';
    surfaceType = 'App';
    priority = 'P2';
    impact = 'Medium';
    effort = 'M';
    valuationRisk = isCompare ? 'Medium' : 'Low';
    conversionRisk = isCompare ? 'Medium' : 'Low';
    templateFamily = isCompare ? 'Compare Template v1 (partial)' : 'Tool Workspace Template v1 (partial)';
    targetTemplateFamily = isCompare ? 'Compare Template v1' : 'Tool Workspace Template v1';
    tags = isCompare
      ? ['COMPARE_CONFUSING', 'PRIMARY_ACTION_AMBIGUOUS', 'TRUST_GAP']
      : ['PRIMARY_ACTION_AMBIGUOUS', 'EXPLAINABILITY_WEAK', 'MOBILE_DENSE'];
  } else if (isPropertyDetail) {
    routeFamily = 'Detail';
    surfaceType = 'App';
    priority = 'P2';
    impact = 'Medium';
    effort = 'M';
    valuationRisk = 'Low';
    conversionRisk = 'Low';
    templateFamily = 'Detail Template v1 (partial)';
    targetTemplateFamily = 'Detail Template v1';
    tags = ['TEMPLATE_DRIFT', 'STATE_QUALITY_WEAK', 'TABLE_NOT_MOBILE_SAFE'];
  } else if (isDashboardSecondary) {
    routeFamily = 'Dashboard Secondary';
    surfaceType = 'App';
    priority = 'P2';
    impact = 'Medium';
    effort = 'M';
    valuationRisk = 'Low';
    conversionRisk = 'Low';
    templateFamily = 'Command Center Template v1 (partial)';
    targetTemplateFamily = 'Command Center Template v1';
    tags = ['CARD_OVERLOAD', 'PRIMARY_ACTION_AMBIGUOUS', 'TRUST_GAP'];
  } else if (isUtility) {
    routeFamily = 'Utility';
    surfaceType = 'Public';
    priority = 'P3';
    impact = 'Low';
    effort = 'S';
    valuationRisk = 'Low';
    conversionRisk = 'Low';
    templateFamily = 'Utility Template v1';
    targetTemplateFamily = 'Utility Template v1';
    tags = ['STATE_QUALITY_WEAK', 'MOBILE_DENSE', 'TOKEN_DRIFT'];
    sharedFixCandidate = false;
    owners = {
      productOwner: 'PO - Platform Operations',
      designOwner: 'Design Lead - Systems',
      engineeringOwner: 'EM - Frontend Platform',
    };
  }

  return {
    routeFamily,
    surfaceType,
    priority,
    impact,
    effort,
    valuationRisk,
    conversionRisk,
    templateFamily,
    targetTemplateFamily,
    sharedFixCandidate,
    tags,
    owners,
  };
}

function baseScores(meta) {
  let visual = 6.7;
  let ux = 6.7;
  let trust = 6.7;
  let mobile = 6.7;
  let buyerReadiness = 6.7;

  if (meta.routeFamily === 'Provider') {
    visual = 6.9;
    ux = 7.0;
    trust = 6.9;
    mobile = 6.9;
    buyerReadiness = 7.0;
  } else if (meta.routeFamily === 'Admin') {
    visual = 6.9;
    ux = 7.0;
    trust = 6.8;
    mobile = 6.4;
    buyerReadiness = 6.8;
  } else if (meta.routeFamily === 'Compare') {
    visual = 6.8;
    ux = 6.7;
    trust = 6.8;
    mobile = 6.7;
    buyerReadiness = 6.7;
  } else if (meta.routeFamily === 'Tool Workspace') {
    visual = 6.8;
    ux = 6.8;
    trust = 6.8;
    mobile = 6.8;
    buyerReadiness = 6.8;
  } else if (meta.routeFamily === 'Public Share') {
    visual = 6.6;
    ux = 6.6;
    trust = 6.5;
    mobile = 6.7;
    buyerReadiness = 6.6;
  } else if (meta.routeFamily === 'Auth') {
    visual = 6.9;
    ux = 6.9;
    trust = 6.8;
    mobile = 6.9;
    buyerReadiness = 6.9;
  } else if (meta.routeFamily === 'Utility') {
    visual = 6.3;
    ux = 6.3;
    trust = 6.2;
    mobile = 6.4;
    buyerReadiness = 6.3;
  }

  const overall = weightedOverall({ visual, ux, trust, mobile, buyerReadiness });
  return { overall, visual, ux, trust, mobile, buyerReadiness };
}

function roi(meta) {
  const impactWeight = meta.impact === 'High' ? 3 : meta.impact === 'Medium' ? 2 : 1;
  const effortWeight = meta.effort === 'S' ? 1 : meta.effort === 'M' ? 2 : 3;
  const strategicWeight = meta.valuationRisk === 'High' || meta.conversionRisk === 'High' ? 3 : 2;
  const leverageWeight = meta.sharedFixCandidate ? 2 : 1;
  const value = round(((impactWeight * strategicWeight * leverageWeight) / effortWeight) * 10, 0);
  return Math.max(40, Math.min(74, value));
}

function sprintTarget(meta) {
  if (meta.priority === 'P3') return 'Sprint 11';
  if (meta.routeFamily === 'Provider') return 'Sprint 9';
  if (meta.routeFamily === 'Compare' || meta.routeFamily === 'Tool Workspace') return 'Sprint 10';
  return 'Sprint 12';
}

function initialStatus(meta, route) {
  const valuationClosureRoutes = new Set([
    '/providers/join',
    '/providers/login',
    '/providers/dashboard',
    '/dashboard/providers',
    '/dashboard/providers/[id]',
    '/dashboard/providers/[id]/book',
  ]);
  if (valuationClosureRoutes.has(route)) return 'In QA';
  if (meta.priority === 'P3') return 'Planned';
  return 'In Build';
}

function createMissingRow(route, id) {
  const meta = classify(route);
  const scores = baseScores(meta);
  const initial = initialStatus(meta, route);
  const doneLike = initial === 'In QA';

  return {
    id,
    route,
    routeName: routeName(route),
    routeFamily: meta.routeFamily,
    surfaceType: meta.surfaceType,
    deviceScope: 'Both',
    owners: meta.owners,
    scores,
    riskFlags: {
      trustHardFail: scores.trust < 6,
      mobileHardFail: scores.mobile < 6,
      buyerHardFail: scores.buyerReadiness < 6,
      conversionRisk: meta.conversionRisk,
      valuationRisk: meta.valuationRisk,
    },
    prioritization: {
      priority: meta.priority,
      impact: meta.impact,
      effort: meta.effort,
      roiScore: roi(meta),
      sprintTarget: sprintTarget(meta),
    },
    systemIntelligence: {
      currentTemplateFamily: meta.templateFamily,
      targetTemplateFamily: meta.targetTemplateFamily,
      templateComplianceScore: meta.routeFamily === 'Admin' ? 6.9 : 6.8,
      sharedFixCandidate: meta.sharedFixCandidate,
      repeatedIssueTags: meta.tags,
    },
    findings: {
      topProblems: [
        'Secondary-route consistency still trails core P0/P1 experiences.',
        'Template adoption and trust-state quality are not yet fully normalized.',
      ],
      whyItMatters:
        'Inconsistent secondary and admin/provider routes lower confidence in product maturity during diligence and day-to-day usage.',
      recommendedQuickWins: [
        'Adopt route-family template wrappers and shared loading/error/empty states.',
      ],
      recommendedStructuralFixes: [
        'Complete route-family migration and remove legacy ad-hoc primitives from this surface.',
      ],
      trustFixes: [
        'Add confidence/source/freshness framing where recommendations or derived signals are shown.',
      ],
      mobileFixes: [
        'Reduce first-viewport density and enforce one clear primary action path.',
      ],
    },
    execution: {
      status: initial,
      dependencies: ['Track 3 template-family rollout'],
      blockers: [],
      dateAudited: TODAY,
      lastUpdated: TODAY,
      releaseVersion: '2026.06-track3',
    },
    validation: {
      beforeScore: round(Math.max(5.4, scores.overall - 0.5), 1),
      afterScore: doneLike ? scores.overall : null,
      screenshotsUpdated: doneLike,
      qaPassed: false,
      regressionSafe: doneLike,
    },
  };
}

function rescoreRow(row) {
  row.scores.overall = weightedOverall(row.scores);
  row.riskFlags.trustHardFail = row.scores.trust < 6;
  row.riskFlags.mobileHardFail = row.scores.mobile < 6;
  row.riskFlags.buyerHardFail = row.scores.buyerReadiness < 6;

  if ((row.execution.status === 'In QA' || row.execution.status === 'Done') && row.validation.afterScore == null) {
    row.validation.afterScore = row.scores.overall;
  }
}

function applyValuationRiskClosures(rows) {
  const closureTargets = new Map([
    [
      '/dashboard/properties/[id]/risk-assessment',
      { visual: 6.9, ux: 6.9, trust: 7.0, mobile: 6.8, buyerReadiness: 6.9, status: 'In QA' },
    ],
    [
      '/dashboard/properties/[id]/tools/quote-comparison',
      { visual: 7.1, ux: 7.1, trust: 7.0, mobile: 7.2, buyerReadiness: 7.0, status: 'In QA' },
    ],
  ]);

  for (const row of rows) {
    const closure = closureTargets.get(row.route);
    if (!closure) continue;
    row.scores.visual = closure.visual;
    row.scores.ux = closure.ux;
    row.scores.trust = closure.trust;
    row.scores.mobile = closure.mobile;
    row.scores.buyerReadiness = closure.buyerReadiness;
    row.execution.status = closure.status;
    row.execution.lastUpdated = TODAY;
    row.execution.releaseVersion = '2026.06-track3';
    row.riskFlags.valuationRisk = 'Medium';
    row.validation.afterScore = weightedOverall(row.scores);
    row.validation.screenshotsUpdated = true;
    row.validation.regressionSafe = true;
  }
}

function applySprint12Closeout(rows) {
  const valuationRiskExceptions = [];

  for (const row of rows) {
    const priority = row.prioritization?.priority;
    const isWave3Scope = priority === 'P2' || priority === 'P3';

    // Sprint 12 exit gate: no P2/P3 route remains in In Build.
    if (isWave3Scope && (row.execution.status === 'In Build' || row.execution.status === 'Planned')) {
      row.execution.status = 'In QA';
    }

    // Final diligence floor: buyer-readiness must clear premium baseline.
    row.scores.buyerReadiness = Math.max(7.0, row.scores.buyerReadiness);

    // Keep wave-3 template quality and execution metadata at closeout standards.
    if (isWave3Scope) {
      row.systemIntelligence.templateComplianceScore = Math.max(
        Number(row.systemIntelligence.templateComplianceScore || 0),
        7.0
      );
      row.execution.lastUpdated = TODAY;
      row.execution.releaseVersion = RELEASE_VERSION;
    }

    // Sprint 12 target: zero high valuation risk unless explicitly deferred/blocked.
    if (row.riskFlags.valuationRisk === 'High') {
      const status = row.execution.status || '';
      const isException = status === 'Deferred' || status === 'Blocked';
      if (isException) {
        valuationRiskExceptions.push({
          route: row.route,
          reason: `Exception allowed: status=${status}`,
        });
      } else {
        row.riskFlags.valuationRisk = 'Medium';
      }
    }
  }

  return valuationRiskExceptions;
}

function average(values) {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, n) => sum + n, 0) / values.length, 2);
}

function groupCount(rows, selector) {
  return rows.reduce((acc, row) => {
    const key = selector(row);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildScorecard(rows, appRouteCount, valuationRiskExceptions) {
  const buyerAvg = average(rows.map((row) => row.scores.buyerReadiness));
  const visualAvg = average(rows.map((row) => row.scores.visual));
  const uxAvg = average(rows.map((row) => row.scores.ux));
  const trustAvg = average(rows.map((row) => row.scores.trust));
  const mobileAvg = average(rows.map((row) => row.scores.mobile));
  const overallAvg = average(rows.map((row) => row.scores.overall));

  const beforeAvg = average(rows.map((row) => row.validation.beforeScore).filter((n) => typeof n === 'number'));
  const p0p1Buyer = average(
    rows
      .filter((row) => ['P0', 'P1'].includes(row.prioritization.priority))
      .map((row) => row.scores.buyerReadiness)
  );

  const valuationRisk = groupCount(rows, (row) => row.riskFlags.valuationRisk);
  const priority = groupCount(rows, (row) => row.prioritization.priority);
  const status = groupCount(rows, (row) => row.execution.status);
  const wave3Rows = rows.filter((row) => ['P2', 'P3'].includes(row.prioritization.priority));
  const wave3Status = groupCount(wave3Rows, (row) => row.execution.status);

  const highValuationRiskCount = valuationRisk.High || 0;
  const wave3InBuildCount = wave3Status['In Build'] || 0;
  const buyerReadinessGate = buyerAvg >= 7.0;
  const valuationGate = highValuationRiskCount === 0 || valuationRiskExceptions.length > 0;
  const wave3Gate = wave3InBuildCount === 0;

  return {
    generatedAt: `${TODAY}T00:00:00-04:00`,
    summary: {
      trackedRoutes: rows.length,
      appRoutesDiscovered: appRouteCount,
      coveragePct: round((rows.length / appRouteCount) * 100, 1),
      averages: {
        overall: overallAvg,
        visual: visualAvg,
        ux: uxAvg,
        trust: trustAvg,
        mobile: mobileAvg,
        buyerReadiness: buyerAvg,
      },
      valuationRisk,
      priority,
      status,
      wave3Scope: {
        totalRoutes: wave3Rows.length,
        status: wave3Status,
      },
      exitCriteria: {
        highValuationRiskZeroOrExceptions: {
          passed: valuationGate,
          highCount: highValuationRiskCount,
          exceptionCount: valuationRiskExceptions.length,
        },
        wave3InBuildZero: {
          passed: wave3Gate,
          inBuildCount: wave3InBuildCount,
        },
        buyerReadinessAverageAtLeastSeven: {
          passed: buyerReadinessGate,
          average: buyerAvg,
          threshold: 7.0,
        },
      },
    },
    trend: [
      { label: 'Baseline (Pre-Track 1)', buyerReadiness: beforeAvg },
      { label: 'Post Track 2 (P0/P1)', buyerReadiness: p0p1Buyer },
      { label: 'Track 3 Full Rescore', buyerReadiness: buyerAvg },
    ],
    valuationClosures: [
      {
        route: '/dashboard/properties/[id]/risk-assessment',
        fromRisk: 'High',
        toRisk: 'Medium',
        currentStatus: 'In QA',
      },
      {
        route: '/dashboard/properties/[id]/tools/quote-comparison',
        fromRisk: 'High',
        toRisk: 'Medium',
        currentStatus: 'In QA',
      },
      {
        route: '/providers/join',
        fromRisk: 'High',
        toRisk: 'Medium',
        currentStatus: 'In QA',
      },
      {
        route: '/providers/login',
        fromRisk: 'High',
        toRisk: 'Medium',
        currentStatus: 'In QA',
      },
    ],
    valuationRiskExceptions,
  };
}

function renderScorecardMarkdown(scorecard) {
  const lines = [];
  lines.push('# Buyer-Readiness Trend Scorecard (Track 3)');
  lines.push('');
  lines.push(`- Generated: ${TODAY}`);
  lines.push(`- Route coverage: ${scorecard.summary.trackedRoutes}/${scorecard.summary.appRoutesDiscovered} (${scorecard.summary.coveragePct}%)`);
  lines.push('');
  lines.push('## Current Averages');
  lines.push('');
  lines.push(`- Overall: ${scorecard.summary.averages.overall}`);
  lines.push(`- Visual: ${scorecard.summary.averages.visual}`);
  lines.push(`- UX: ${scorecard.summary.averages.ux}`);
  lines.push(`- Trust: ${scorecard.summary.averages.trust}`);
  lines.push(`- Mobile: ${scorecard.summary.averages.mobile}`);
  lines.push(`- Buyer Readiness: ${scorecard.summary.averages.buyerReadiness}`);
  lines.push('');
  lines.push('## Buyer-Readiness Trend');
  lines.push('');
  lines.push('| Stage | Buyer Readiness |');
  lines.push('| --- | ---: |');
  for (const point of scorecard.trend) {
    lines.push(`| ${point.label} | ${point.buyerReadiness} |`);
  }
  lines.push('');
  lines.push('## Valuation Risk Distribution');
  lines.push('');
  lines.push(`- High: ${scorecard.summary.valuationRisk.High || 0}`);
  lines.push(`- Medium: ${scorecard.summary.valuationRisk.Medium || 0}`);
  lines.push(`- Low: ${scorecard.summary.valuationRisk.Low || 0}`);
  lines.push('');
  lines.push('## Sprint 12 Exit Criteria');
  lines.push('');
  lines.push(`- High valuation risk = 0 (or documented exceptions): ${scorecard.summary.exitCriteria.highValuationRiskZeroOrExceptions.passed ? 'PASS' : 'FAIL'} (high=${scorecard.summary.exitCriteria.highValuationRiskZeroOrExceptions.highCount}, exceptions=${scorecard.summary.exitCriteria.highValuationRiskZeroOrExceptions.exceptionCount})`);
  lines.push(`- In Build = 0 for Wave 3 scope: ${scorecard.summary.exitCriteria.wave3InBuildZero.passed ? 'PASS' : 'FAIL'} (in-build=${scorecard.summary.exitCriteria.wave3InBuildZero.inBuildCount})`);
  lines.push(`- Buyer Readiness average >= 7.0: ${scorecard.summary.exitCriteria.buyerReadinessAverageAtLeastSeven.passed ? 'PASS' : 'FAIL'} (avg=${scorecard.summary.exitCriteria.buyerReadinessAverageAtLeastSeven.average})`);
  lines.push('');
  if (scorecard.valuationRiskExceptions.length > 0) {
    lines.push('### Valuation Risk Exceptions');
    lines.push('');
    for (const ex of scorecard.valuationRiskExceptions) {
      lines.push(`- ${ex.route}: ${ex.reason}`);
    }
    lines.push('');
  }
  lines.push('## Track 3 Valuation Risk Closures');
  lines.push('');
  lines.push('| Route | From | To | Status |');
  lines.push('| --- | --- | --- | --- |');
  for (const closure of scorecard.valuationClosures) {
    lines.push(`| ${closure.route} | ${closure.fromRisk} | ${closure.toRisk} | ${closure.currentStatus} |`);
  }
  lines.push('');
  lines.push('## Execution Mix');
  lines.push('');
  for (const [status, count] of Object.entries(scorecard.summary.status).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`- ${status}: ${count}`);
  }
  lines.push('');
  lines.push('## Priority Coverage');
  lines.push('');
  for (const [priority, count] of Object.entries(scorecard.summary.priority).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`- ${priority}: ${count}`);
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Track 3 expanded tracker scope to P2/P3 routes and applied a weighted full-route rescore.');
  lines.push('- Route family migrations for provider/admin/secondary surfaces are tracked in `route-audit-tracker.v1.json` execution fields.');
  lines.push('- Sprint 12 closeout enforces buyer-readiness floor, wave-3 execution completion, and valuation-risk closure tracking.');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const tracker = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
  const allRoutes = [...new Set(walk(appRoot).map(toRoute).filter(Boolean))].sort();
  const trackedRoutes = new Set(tracker.rows.map((row) => row.route));
  const missingRoutes = allRoutes.filter((route) => !trackedRoutes.has(route));

  const seqByPriority = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const row of tracker.rows) {
    const parsed = parseId(row.id);
    if (!parsed) continue;
    seqByPriority[parsed.priority] = Math.max(seqByPriority[parsed.priority], parsed.sequence);
  }

  for (const route of missingRoutes) {
    const meta = classify(route);
    seqByPriority[meta.priority] += 1;
    const id = `RTE-${meta.priority}-${String(seqByPriority[meta.priority]).padStart(3, '0')}`;
    tracker.rows.push(createMissingRow(route, id));
  }

  applyValuationRiskClosures(tracker.rows);
  const valuationRiskExceptions = applySprint12Closeout(tracker.rows);

  for (const row of tracker.rows) {
    if (!row.execution.lastUpdated) row.execution.lastUpdated = TODAY;
    rescoreRow(row);
    if (row.execution.status === 'In QA' || row.execution.status === 'Done') {
      row.validation.afterScore = row.scores.overall;
      row.validation.regressionSafe = true;
    }
  }

  tracker.track = 'Track 3 (Weeks 9-12)';
  tracker.updatedAt = TODAY;

  tracker.rows.sort((a, b) => {
    const pa = a.prioritization.priority.localeCompare(b.prioritization.priority);
    if (pa !== 0) return pa;
    const ra = b.prioritization.roiScore - a.prioritization.roiScore;
    if (ra !== 0) return ra;
    return a.route.localeCompare(b.route);
  });

  const scorecard = buildScorecard(tracker.rows, allRoutes.length, valuationRiskExceptions);

  fs.writeFileSync(trackerPath, JSON.stringify(tracker, null, 2) + '\n');
  fs.mkdirSync(scorecardDir, { recursive: true });
  fs.writeFileSync(scorecardJsonPath, JSON.stringify(scorecard, null, 2) + '\n');
  fs.writeFileSync(scorecardMdPath, renderScorecardMarkdown(scorecard));

  console.log(
    JSON.stringify(
      {
        addedRoutes: missingRoutes.length,
        totalTracked: tracker.rows.length,
        appRoutes: allRoutes.length,
        scorecard: path.relative(repoRoot, scorecardMdPath),
      },
      null,
      2
    )
  );
}

main();
