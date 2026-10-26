import { render, screen } from '@testing-library/react';
import CoverageIntelligenceToolClient from '@/app/(dashboard)/dashboard/properties/[id]/tools/coverage-intelligence/CoverageIntelligenceToolClient';

let query = '';
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'p1' }),
  useSearchParams: () => new URLSearchParams(query),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));
jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }));
jest.mock('@/components/tool-explainer/ToolExplainerSection', () => () => null);
jest.mock('@/components/ai/RiskPremiumOptimizerPanel', () => () => null);
jest.mock('@/components/property-context/PropertyContextCapturePanel', () => ({ PropertyContextCapturePanel: () => null }));
jest.mock('@/components/coverage/PolicyRecordReadinessPanel', () => () => null);
jest.mock('@/components/coverage/CoverageReviewQuestionsPanel', () => () => null);
jest.mock('@/components/coverage/CoverageComparisonPanel', () => () => null);
jest.mock('@/components/coverage/CoverageTermReviewPanel', () => () => null);
jest.mock('@/components/coverage/InsuranceHandoffPanel', () => () => null);
jest.mock('@/components/coverage/InsuranceMarketContextPanel', () => () => null);
jest.mock('../app/(dashboard)/dashboard/properties/[id]/tools/insurance-trend/InsuranceTrendClient', () => () => null);
jest.mock('../app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail', () => () => null);

function askParams() {
  const href = screen.getByRole('link', { name: /ask cozy/i }).getAttribute('href') as string;
  expect(href.startsWith('/dashboard/ask?')).toBe(true);
  return new URLSearchParams(href.split('?')[1]);
}

test.each([
  ['', 'Show gaps in my home protection.'],
  ['stage=questions', 'What questions should I ask my insurer?'],
  ['stage=compare', 'Compare my current insurance policy against alternatives.'],
])('stage %p seeds its validated question and returns to the same tab', (q, question) => {
  query = q;
  render(<CoverageIntelligenceToolClient />);
  const params = askParams();
  expect(params.get('question')).toBe(question);
  expect(params.get('propertyId')).toBe('p1');
  expect(params.get('launchCapabilityId')).toBe('coverage-intelligence');
  expect(params.get('launchSurface')).toBe('COVERAGE_INTELLIGENCE_TOOL');
  expect(params.get('backTo')).toBe(`/dashboard/properties/p1/tools/coverage-intelligence${q ? `?${q}` : ''}`);
});

test.each(['renewal', 'risk'])('%s stage opens Ask without a seeded question', (stage) => {
  query = `stage=${stage}`;
  render(<CoverageIntelligenceToolClient />);
  const params = askParams();
  expect(params.has('question')).toBe(false);
  expect(params.get('backTo')).toContain(`stage=${stage}`);
});
