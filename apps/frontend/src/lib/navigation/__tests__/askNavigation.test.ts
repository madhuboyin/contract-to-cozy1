import { addAskReturnContext, askOriginBackLabel, buildAskWorkspaceHref } from '../askNavigation';

describe('Ask Cozy navigation continuity', () => {
  it('builds a resumable workspace link with a safe origin', () => {
    const href = buildAskWorkspaceHref({
      propertyId: 'property-1',
      sessionId: 'session-1',
      executionId: 'execution-1',
      backTo: '/dashboard/properties/property-1?tab=record',
    });
    const url = new URL(href, 'https://contracttocozy.local');
    expect(url.pathname).toBe('/dashboard/ask');
    expect(url.searchParams.get('sessionId')).toBe('session-1');
    expect(url.searchParams.get('executionId')).toBe('execution-1');
    expect(url.searchParams.get('backTo')).toBe('/dashboard/properties/property-1?tab=record');
  });

  it('adds Ask as the return destination for an internal action', () => {
    const href = addAskReturnContext(
      '/dashboard/properties/property-1/environment-report/preparation?insightId=heat-1',
      '/dashboard/ask?propertyId=property-1&sessionId=session-1&executionId=execution-1',
    );
    const url = new URL(href, 'https://contracttocozy.local');
    expect(url.searchParams.get('from')).toBe('ask');
    expect(url.searchParams.get('backTo')).toContain('/dashboard/ask?');
    expect(url.searchParams.get('returnTo')).toBe(url.searchParams.get('backTo'));
  });

  it('names familiar launch surfaces without adding another CTA to direct Ask visits', () => {
    expect(askOriginBackLabel('/dashboard', null)).toBe('Back to Home');
    expect(askOriginBackLabel('/dashboard/properties/property-1', null)).toBe('Back to Home Record');
    expect(askOriginBackLabel('', null)).toBe('Back to previous page');
  });

  it('does not rewrite external links or an existing return contract', () => {
    expect(addAskReturnContext('https://weather.gov', '/dashboard/ask')).toBe('https://weather.gov');
    const existing = addAskReturnContext('/dashboard/maintenance?returnTo=%2Fdashboard', '/dashboard/ask');
    expect(new URL(existing, 'https://contracttocozy.local').searchParams.get('returnTo')).toBe('/dashboard');
  });
});
