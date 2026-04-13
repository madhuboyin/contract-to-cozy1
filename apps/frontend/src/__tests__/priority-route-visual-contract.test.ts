import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

type RouteContractSpec = {
  route: string;
  files: string[];
};

const ROUTE_CONTRACTS: RouteContractSpec[] = [
  {
    route: '/',
    files: ['src/components/landing/Hero.tsx', 'src/components/landing/MarketingHeroTemplate.tsx'],
  },
  {
    route: '/signup',
    files: ['src/app/(auth)/signup/page.tsx', 'src/components/auth/AuthTemplate.tsx'],
  },
  {
    route: '/dashboard',
    files: [
      'src/app/(dashboard)/dashboard/page.tsx',
      'src/app/(dashboard)/dashboard/components/CommandCenterTemplate.tsx',
    ],
  },
  {
    route: '/dashboard/properties',
    files: ['src/app/(dashboard)/dashboard/properties/page.tsx'],
  },
  {
    route: '/dashboard/properties/[id]',
    files: [
      'src/app/(dashboard)/dashboard/properties/[id]/page.tsx',
      'src/app/(dashboard)/dashboard/properties/[id]/components/PropertyHubTemplate.tsx',
    ],
  },
  {
    route: '/dashboard/properties/[id]/home-score',
    files: ['src/app/(dashboard)/dashboard/properties/[id]/home-score/page.tsx'],
  },
  {
    route: '/dashboard/properties/[id]/status-board',
    files: ['src/app/(dashboard)/dashboard/properties/[id]/status-board/StatusBoardClient.tsx'],
  },
  {
    route: '/dashboard/properties/[id]/tools/guidance-overview',
    files: [
      'src/app/(dashboard)/dashboard/properties/[id]/tools/guidance-overview/GuidanceOverviewClient.tsx',
      'src/app/(dashboard)/dashboard/properties/[id]/tools/guidance-overview/components/GuidedJourneyTemplate.tsx',
    ],
  },
];

function extractVisualLiterals(source: string): string[] {
  const literals = source.match(/(["'`])(?:(?=(\\?))\2[\s\S])*?\1/g) || [];
  return Array.from(
    new Set(
      literals
        .map((literal) => literal.slice(1, -1).replace(/\s+/g, ' ').trim())
        .filter((literal) =>
          /(?:\b(?:bg|text|border|rounded|shadow|tracking|leading|font|space|gap|min-h|max-w|items|justify|grid|flex|sticky|fixed|absolute|relative|overflow|p|m)-|safe-area|calc\()/.test(
            literal
          )
        )
    )
  ).sort();
}

function extractTemplateComponents(source: string): string[] {
  const templateMatch =
    source.match(
      /<(AuthTemplate|MarketingHeroTemplate|CommandCenterTemplate|PortfolioListTemplate|PropertyHubTemplate|GuidedJourneyTemplate|ReportTemplate|CompareTemplate|ToolWorkspaceTemplate|TrustStrip|TrustPanel|PriorityActionHero)\b/g
    ) || [];
  return Array.from(new Set(templateMatch.map((value) => value.replace('<', '')))).sort();
}

function routeContract(route: RouteContractSpec) {
  const rootDir = process.cwd();
  const mergedSource = route.files
    .map((relativeFile) => {
      const absoluteFile = path.join(rootDir, relativeFile);
      const source = fs.readFileSync(absoluteFile, 'utf8');
      return `/* ${relativeFile} */\n${source}`;
    })
    .join('\n');

  const visualLiterals = extractVisualLiterals(mergedSource);
  const templates = extractTemplateComponents(mergedSource);
  const signature = crypto
    .createHash('sha256')
    .update(`${templates.join('|')}::${visualLiterals.join('|')}`)
    .digest('hex');

  return {
    route: route.route,
    files: route.files,
    templates,
    fixedLayerCount: (mergedSource.match(/\bfixed\b/g) || []).length,
    chatCollisionZones: (mergedSource.match(/data-chat-collision-zone/g) || []).length,
    visualLiteralCount: visualLiterals.length,
    visualLiteralPreview: visualLiterals.slice(0, 25),
    signature,
  };
}

describe('priority route visual contracts', () => {
  it('matches baseline snapshots for governed routes', () => {
    const contracts = ROUTE_CONTRACTS.map((route) => routeContract(route));
    expect(contracts).toMatchSnapshot();
  });
});

