import { expect, type BrowserContext } from '@playwright/test';

const acceptanceOrigin = 'http://localhost:3114';

export async function installAuthenticatedContext(context: BrowserContext) {
  await context.addCookies([{
    name: 'ctc.at',
    value: 'property-tax-acceptance-token',
    url: acceptanceOrigin,
    httpOnly: true,
    sameSite: 'Lax',
  }]);
  await context.addInitScript(() => {
    window.localStorage.setItem(
      'c2c_consent_v1',
      JSON.stringify({ decided: true, analytics: false }),
    );
  });
  await expect.poll(async () => (
    (await context.cookies(acceptanceOrigin)).some((cookie) => (
      cookie.name === 'ctc.at'
      && cookie.value === 'property-tax-acceptance-token'
    ))
  )).toBe(true);
}
