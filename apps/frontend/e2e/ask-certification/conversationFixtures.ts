import { expect, type Page, type Route } from '@playwright/test';
import { apiOrigin, contract, installDestinationApi } from './fixtures';

// Shared by conversations.spec.ts and accessibility.spec.ts. The answers are produced by apps/backend/scripts/certification/deriveConversationContracts.js:
// the REAL pure answer builders and the REAL mapPersistedExecution over the REAL captured destination pages (nothing hand-written, nothing from a live backend).
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://localhost:3123', 'access-control-allow-credentials': 'true' }, body: JSON.stringify(body) });

export type Body = { message: string } & Record<string, unknown>;
const ANSWERS: Array<[RegExp, string]> = [
  [/dismissed/i, 'conversationNotificationsDismissed'],
  [/what needs me/i, 'conversationWork'],
  [/saved results/i, 'conversationSaved'],
  [/what.?s new/i, 'conversationNotifications'],
];

export async function installConversations(page: Page, options: { slowMs?: number; failAnswers?: boolean; saved?: 'conversationSaved' | 'conversationSavedStale' } = {}) {
  await installDestinationApi(page);
  const bodies: Body[] = [];
  await page.route(`${apiOrigin}/api/ask/executions`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON() as Body;
    bodies.push(body);
    if (options.slowMs) await new Promise((resolve) => setTimeout(resolve, options.slowMs));
    if (options.failAnswers) return json(route, { success: false, error: { code: 'INTERNAL_ERROR', message: 'Ask could not answer just now.' } }, 500);
    const match = ANSWERS.find(([pattern]) => pattern.test(body.message));
    if (!match) return json(route, { success: false, error: { code: 'INTERNAL_ERROR', message: 'No certified answer for this question.' } }, 500);
    const name = match[1] === 'conversationSaved' && options.saved ? options.saved : match[1];
    // A fresh id per turn, so a second turn is a second card.
    const answer = { ...contract(name), executionId: `${contract(name).executionId}-${bodies.length}`, question: body.message, sessionId: body.sessionId ?? contract(name).sessionId };
    return json(route, { success: true, data: answer }, 201);
  });
  return { bodies };
}


// An old address opens Ask with the question already in the composer (the redirect carries it; nothing is sent until the person sends it).
export async function openAndAsk(page: Page, path: string, question: string) {
  await page.goto(path);
  const composer = page.getByPlaceholder(/^Ask anything about /).first();
  await expect(composer).toHaveValue(question, { timeout: 20000 });
  await composer.press('Enter');
}

