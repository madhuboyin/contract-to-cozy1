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
  ['stage=risk', 'What loss-prevention work matters most?'],
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

test.each(['renewal'])('%s stage opens Ask without a seeded question', (stage) => {
  query = `stage=${stage}`;
  render(<CoverageIntelligenceToolClient />);
  const params = askParams();
  expect(params.has('question')).toBe(false);
  expect(params.get('backTo')).toContain(`stage=${stage}`);
});

describe('opened from a guided journey', () => {
  test.each(['', 'stage=compare', 'stage=risk'])('stage %p continues the journey in Ask instead of asking a stage question', (stage) => {
    query = `guidanceJourneyId=j1&guidanceStepKey=check_coverage${stage ? `&${stage}` : ''}`;
    render(<CoverageIntelligenceToolClient />);
    const params = askParams();
    expect(params.get('launchOperationId')).toBe('GUIDANCE_JOURNEY_CONTINUE');
    expect(params.get('launchEntityType')).toBe('GUIDANCE_JOURNEY');
    expect(params.get('launchEntityId')).toBe('j1');
    expect(params.get('launchJourneyId')).toBe('j1');
    expect(params.get('question')).toBe('Continue this guided journey.');
    expect(params.get('propertyId')).toBe('p1');
    expect(params.get('launchCapabilityId')).toBe('coverage-intelligence');
    expect(params.get('backTo')).toContain('guidanceJourneyId=j1');
    expect(screen.getByRole('link', { name: /continue in ask cozy/i })).toBeTruthy();
  });

  test('only the journey travels: no policy or step id is sent, and without a journey nothing launches an operation', () => {
    query = 'guidanceJourneyId=j1&policyId=pol-1&guidanceStepKey=check_coverage';
    const { unmount } = render(<CoverageIntelligenceToolClient />);
    const journey = askParams();
    expect([...journey.keys()].some((key) => /policy/i.test(key))).toBe(false);
    expect(journey.get('launchEntityId')).toBe('j1');
    unmount();
    query = 'policyId=pol-1';
    render(<CoverageIntelligenceToolClient />);
    const plain = askParams();
    expect(plain.has('launchOperationId')).toBe(false);
    expect(plain.has('launchEntityType')).toBe(false);
    expect(plain.get('question')).toBe('Show gaps in my home protection.');
  });
});
