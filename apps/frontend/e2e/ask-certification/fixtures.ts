import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Page, Route } from '@playwright/test';

// Sole Homeowner Interface Phase 9: the browser certification fixtures. Every response of an Ask destination is the REAL backend answer for a seeded home
// (captured from a scratch database by apps/backend/scripts/certification/captureAskContracts.js), so a contract change shows up here as a changed file.
export const propertyId = 'ask-property-fixture';
// Same-origin in the certification build (NEXT_PUBLIC_API_URL=http://localhost:3123), so no CORS preflight exists for any browser engine.
export const apiOrigin = process.env.ASK_E2E_API_ORIGIN ?? 'http://localhost:3123';
const dir = join(__dirname, 'contracts');
export const contract = (name: string): any => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://localhost:3123', 'access-control-allow-credentials': 'true' }, body: JSON.stringify(body) });
const ok = (route: Route, data: unknown) => json(route, { success: true, data });

export interface DestinationApiOptions {
  /** Delay every Ask destination read, to show the chrome does not wait for data. */
  slowMs?: number;
  /** Serve what a read-only household member sees. */
  viewer?: boolean;
  /** Make Ask destination reads fail (a reachable server that errors). */
  failReads?: boolean;
  /** Answer every other API call with an empty success. Turn off when another fixture already answers the rest. */
  catchAll?: boolean;
}

export async function installAskContext(context: BrowserContext) {
  await context.addInitScript(() => { try { window.localStorage.setItem('ctc:ask-calm-answers', '0'); window.localStorage.setItem('c2c_consent_v1', JSON.stringify({ decided: true, analytics: false })); } catch { /* storage unavailable */ } });
  await context.addCookies([{ name: 'ctc.at', value: 'ask-acceptance-token', domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Strict' }]);
}

/**
 * The production CSP upgrades insecure requests; WebKit (unlike Chromium) applies that to localhost, so the fixture server's own documents are served without it.
 * Register it first, before any API route, so the API routes keep priority.
 */
export async function stripUpgradeInsecure(page: Page) {
  await page.route(/^http:\/\/localhost:3123\/(?!api\/).*/, async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    const headers = response.headers();
    for (const name of ['content-security-policy', 'content-security-policy-report-only']) {
      if (headers[name]) headers[name] = headers[name].replace(/\s*upgrade-insecure-requests;?/g, '');
    }
    return route.fulfill({ response, headers });
  });
}

export async function installDestinationApi(page: Page, options: DestinationApiOptions = {}) {
  const calls: string[] = [];
  const bodies: Record<string, unknown[]> = {};
  const state = {
    dismissed: new Set<string>(),
    read: new Set<string>(),
    intake: new Map<string, ReturnType<typeof contract>>(),
    candidateStatus: new Map<string, string>(),
    promoted: false,
  };
  const record = (key: string, body: unknown) => { (bodies[key] ??= []).push(body); };
  const delayed = async (route: Route, produce: () => unknown, status = 200) => {
    if (options.slowMs) await new Promise((resolve) => setTimeout(resolve, options.slowMs));
    if (options.failReads) return json(route, { success: false, error: { code: 'INTERNAL_ERROR', message: 'The server could not complete this.' } }, 500);
    return json(route, produce(), status);
  };
  const dataOf = (data: unknown) => ({ success: true, data });
  const url = (route: Route) => new URL(route.request().url());

  // Anything the shell asks that a spec does not care about is answered with an empty success, so no page stops at its error boundary.
  if (options.catchAll !== false) await page.route(`${apiOrigin}/api/**`, (route) => { calls.push(`${route.request().method()} ${url(route).pathname} (unmocked)`); return ok(route, {}); });
  if (options.catchAll !== false) {
    await page.route(`${apiOrigin}/api/notifications/unread-count`, (route) => ok(route, { count: 0, unreadCount: 0 }));
    await page.route(`${apiOrigin}/api/csrf-token`, (route) => json(route, { csrfToken: 'ask-certification-csrf' }));
    await page.route(`${apiOrigin}/api/auth/me`, (route) => ok(route, { id: 'user-fixture', email: 'owner@example.com', firstName: 'Test', lastName: 'Owner', role: 'HOMEOWNER', emailVerified: true, status: 'ACTIVE' }));
    await page.route(`${apiOrigin}/api/properties*`, (route) => ok(route, { properties: [{ id: propertyId, name: 'Acceptance Home', addressLine1: '1 Cozy Way', city: 'Boston', state: 'MA', zipCode: '02108' }] }));
    await page.route(`${apiOrigin}/api/properties/${propertyId}/intelligence-refresh-state**`, (route) => ok(route, { state: 'CURRENT', capabilities: [] }));
    await page.route(`${apiOrigin}/api/ask/pending**`, (route) => ok(route, { items: [] }));
    await page.route(`${apiOrigin}/api/ask/sessions/recent**`, (route) => ok(route, { sessions: [], nextCursor: null }));
    await page.route(`${apiOrigin}/api/ask/concierge-home**`, (route) => ok(route, { available: false }));
    await page.route(`${apiOrigin}/api/ask/executions**`, (route) => ok(route, {}));
  }

  // Record
  await page.route(`${apiOrigin}/api/ask/record-index**`, (route) => { calls.push('record-index'); return delayed(route, () => dataOf(contract('recordIndex'))); });
  await page.route(`${apiOrigin}/api/ask/record-sections/rooms**`, (route) => { calls.push('record-rooms'); return delayed(route, () => dataOf(contract('recordRooms'))); });
  await page.route(`${apiOrigin}/api/ask/record-sections/documents`, (route) => route.fallback());
  await page.route(new RegExp(`${apiOrigin.replace(/[.]/g, '\\.')}/api/ask/record-sections/documents(\\?.*)?$`), (route) => { calls.push('record-documents'); return delayed(route, () => dataOf(contract(options.viewer ? 'recordDocumentsViewer' : 'recordDocuments'))); });
  await page.route(new RegExp(`${apiOrigin.replace(/[.]/g, '\\.')}/api/ask/record-sections/documents/records/.*`), (route) => delayed(route, () => dataOf(contract('recordDetailManual'))));
  await page.route(`${apiOrigin}/api/ask/record-export-review**`, (route) => delayed(route, () => dataOf(contract(options.viewer ? 'exportReviewViewer' : 'exportReviewOwner'))));

  // Work and Saved
  await page.route(`${apiOrigin}/api/ask/work?**`, (route) => {
    calls.push('work');
    const view = url(route).searchParams.get('view') ?? 'NEEDS_YOU';
    return delayed(route, () => dataOf(view === 'ACTIVE' ? contract('workActive') : view === 'NEEDS_YOU' ? contract('workNeedsYou') : { ...contract('workActive'), view, total: 0, delivered: 0, rows: [] }));
  });
  await page.route(`${apiOrigin}/api/ask/work/resolve**`, (route) => ok(route, { contractVersion: 'ask-work-v1', propertyId, workKey: 'x', outcome: 'AVAILABLE', row: null, message: 'Ready to open.' }));
  await page.route(`${apiOrigin}/api/ask/saved?**`, (route) => { calls.push('saved'); return delayed(route, () => dataOf(contract('savedPage'))); });
  await page.route(`${apiOrigin}/api/ask/saved/resolve**`, (route) => {
    const key = url(route).searchParams.get('artifactKey') ?? '';
    return ok(route, key.startsWith('seasonal:') ? contract('savedResolveSeasonal') : contract('savedResolveBrief'));
  });

  // Search
  await page.route(`${apiOrigin}/api/ask/search`, async (route) => {
    const body = route.request().postDataJSON() as { query?: string };
    record('search', body);
    calls.push('search');
    const found = contract('searchFurnace');
    return delayed(route, () => dataOf(/furnace/i.test(body.query ?? '') ? found : { ...found, totalResults: 0, groups: found.groups.map((group: { results: unknown[] }) => ({ ...group, results: [] })) }));
  });

  // Notifications
  await page.route(`${apiOrigin}/api/ask/notifications?**`, (route) => {
    calls.push('notifications');
    const view = url(route).searchParams.get('view') === 'DISMISSED' ? 'DISMISSED' : 'INBOX';
    return delayed(route, () => {
      const base = contract(view === 'DISMISSED' ? 'notificationsDismissed' : 'notifications');
      const all = [...contract('notifications').items, ...contract('notificationsDismissed').items];
      const items = all.filter((item: { id: string; dismissed: boolean }) => (view === 'DISMISSED') === (item.dismissed || state.dismissed.has(item.id)) && !(view === 'INBOX' && state.dismissed.has(item.id)))
        .map((item: { id: string; isRead: boolean }) => ({ ...item, isRead: item.isRead || state.read.has(item.id), dismissed: view === 'DISMISSED' }));
      return dataOf({ ...base, view, total: items.length, items, unreadCount: items.filter((item: { isRead: boolean }) => !item.isRead).length });
    });
  });
  const ids = contract('notificationIds');
  const opens: Record<string, string> = { [ids.opens]: 'notificationOpens', [ids.removed]: 'notificationRemoved', [ids.lost]: 'notificationLost', [ids.nothing]: 'notificationNothing' };
  await page.route(new RegExp(`${apiOrigin.replace(/[.]/g, '\\.')}/api/ask/notifications/[^/]+/open$`), (route) => {
    const id = url(route).pathname.split('/').at(-2) ?? '';
    record('open', id);
    if (opens[id] === 'notificationOpens') state.read.add(id);
    return ok(route, contract(opens[id] ?? 'notificationNothing'));
  });
  await page.route(new RegExp(`${apiOrigin.replace(/[.]/g, '\\.')}/api/ask/notifications/[^/]+/dismiss$`), (route) => {
    const id = url(route).pathname.split('/').at(-2) ?? '';
    const body = route.request().postDataJSON() as { dismissed: boolean };
    if (body.dismissed) state.dismissed.add(id); else state.dismissed.delete(id);
    return ok(route, { id, dismissed: body.dismissed });
  });
  await page.route(new RegExp(`${apiOrigin.replace(/[.]/g, '\\.')}/api/ask/notifications/[^/]+/read$`), (route) => {
    const id = url(route).pathname.split('/').at(-2) ?? '';
    const body = route.request().postDataJSON() as { read: boolean };
    if (body.read) state.read.add(id); else state.read.delete(id);
    return ok(route, { id, isRead: body.read });
  });
  await page.route(`${apiOrigin}/api/ask/notification-settings`, (route) => delayed(route, () => dataOf(contract('notificationSettings'))));

  // Add a file
  await page.route(`${apiOrigin}/api/ask/intake/config`, (route) => ok(route, contract('intakeConfig')));
  const intakeBase = new RegExp(`${apiOrigin.replace(/[.]/g, '\\.')}/api/ask/properties/${propertyId}/intake/`);
  await page.route(intakeBase, (route) => route.fallback());
  await page.route(new RegExp(`${apiOrigin.replace(/[.]/g, '\\.')}/api/ask/properties/${propertyId}/intake/files$`), (route) => { calls.push('intake-upload'); record('upload', route.request().postData()?.length ?? 0); return json(route, dataOf(contract('intakeUploaded')), 201); });
  await page.route(new RegExp(`${apiOrigin.replace(/[.]/g, '\\.')}/api/ask/properties/${propertyId}/intake/[^/]+/analyze$`), (route) => {
    const body = route.request().postDataJSON() as { kind: string; acknowledgedProcessing?: boolean };
    record('analyze', body);
    if (body.kind !== 'APPLIANCE_LABEL' && !body.acknowledgedProcessing) return json(route, { success: false, error: { code: 'ASK_INTAKE_DISCLOSURE_NOT_ACKNOWLEDGED', message: 'Confirm that this file may be sent to an AI service to be read.' } }, 422);
    return ok(route, contract(body.kind === 'INSPECTION_REPORT' ? 'intakeInspection' : body.kind === 'APPLIANCE_LABEL' ? 'intakeLabel' : 'intakeReceipt'));
  });
  await page.route(new RegExp(`${apiOrigin.replace(/[.]/g, '\\.')}/api/ask/properties/${propertyId}/intake/[^/]+/candidates/[^/]+/review$`), (route) => {
    const parts = url(route).pathname.split('/');
    const candidateId = parts.at(-2) ?? '';
    const recordId = parts.at(-4) ?? '';
    const body = route.request().postDataJSON() as { action: string; value?: string };
    record('review', { candidateId, ...body });
    state.candidateStatus.set(candidateId, body.action === 'CONFIRM' ? 'CONFIRMED' : body.action === 'REJECT' ? 'REJECTED' : 'CORRECTED');
    const view = JSON.parse(JSON.stringify(contract(recordId === contract('ids').inspection ? 'intakeInspection' : 'intakeReceipt')));
    view.candidates = view.candidates.map((candidate: { id: string; effectiveValue: string | null; reviewedValue: string | null; required: boolean; fieldKey: string; reviewStatus: string }) => {
      const status = state.candidateStatus.get(candidate.id);
      return status ? { ...candidate, reviewStatus: status, effectiveValue: status === 'REJECTED' ? null : candidate.effectiveValue } : candidate;
    });
    view.missingRequired = view.candidates.filter((candidate: { required: boolean; effectiveValue: string | null }) => candidate.required && !candidate.effectiveValue).map((candidate: { label: string }) => candidate.label);
    return ok(route, view);
  });
  await page.route(new RegExp(`${apiOrigin.replace(/[.]/g, '\\.')}/api/ask/properties/${propertyId}/intake/[^/]+/promote$`), (route) => {
    calls.push('intake-promote');
    state.promoted = true;
    const recordId = url(route).pathname.split('/').at(-2) ?? '';
    if (recordId === contract('ids').inspection) return json(route, dataOf({ ...contract('intakeInspection'), inspection: { reportId: 'report-1', status: 'REVIEW_PENDING', findingCount: [...state.candidateStatus.values()].filter((status) => status === 'CONFIRMED').length || 1 } }), 201);
    return json(route, dataOf({ ...contract('intakeReceipt'), state: 'COMPLETED', result: { entityType: 'EXPENSE', entityId: 'expense-1' } }), 201);
  });
  await page.route(new RegExp(`${apiOrigin.replace(/[.]/g, '\\.')}/api/ask/properties/${propertyId}/intake/[^/]+/label/confirm$`), (route) => json(route, dataOf({ ...contract('intakeLabel'), state: 'COMPLETED', result: { entityType: 'INVENTORY_ITEM', entityId: 'item-1' }, labelDraft: { ...contract('intakeLabel').labelDraft, status: 'CONFIRMED' } }), 201));
  await page.route(new RegExp(`${apiOrigin.replace(/[.]/g, '\\.')}/api/ask/properties/${propertyId}/intake/[^/]+/discard$`), (route) => ok(route, { ...contract('intakeUploaded'), state: 'DISCARDED' }));

  return { calls, bodies, state };
}
