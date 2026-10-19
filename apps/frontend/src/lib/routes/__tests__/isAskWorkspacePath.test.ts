import { isAskWorkspacePath } from '../isAskWorkspacePath';

describe('isAskWorkspacePath', () => {
  it.each(['/dashboard/ask', '/dashboard/ask/', '/dashboard/ask/work', '/dashboard/ask/record', '/dashboard/ask/saved', '/dashboard/ask/history'])('matches the Ask workspace route %s', (pathname) => {
    expect(isAskWorkspacePath(pathname)).toBe(true);
  });

  it.each(['/dashboard', '/dashboard/asking', null, undefined])('does not match unrelated routes %s', (pathname) => {
    expect(isAskWorkspacePath(pathname)).toBe(false);
  });
});
