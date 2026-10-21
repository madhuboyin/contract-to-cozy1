import { expect, test, type Page } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

// Home Actions (FRD 1.398-1.400): the ranked list, the focused accepted-work Manage region and its evidence row. Fixture-backed: the focused blocks come from the
// real producer, the list block is schema-shaped; this proves browser behavior of the real app, not a live backend.
test.beforeEach(async ({ context }) => installAskContext(context, { calm: 'default' }));

const composer = (page: Page) => page.getByPlaceholder(/^Ask anything about /);
const ask = async (page: Page, question: string) => { await page.goto(`/acceptance/ask?propertyId=${propertyId}`); await composer(page).fill(question); await page.keyboard.press('Enter'); };
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

test('the ranked list: one Start here row, compact rows, whole-feed filter counts, rating in the overflow, and a filter chip asks the server', async ({ page }) => {
  const api = await installAskApi(page);
  await ask(page, 'home actions fixture all');
  const list = page.locator('[data-calm-home-actions]');
  await expect(list.getByText('Start here')).toHaveCount(1);
  await expect(list.locator('[data-home-action-row]')).toHaveCount(6);
  for (const name of ['All · 9', 'Now · 1', 'Soon · 2', 'Plan · 3', 'Consider · 3']) await expect(list.getByRole('button', { name })).toBeVisible();
  await expect(list.getByRole('button', { name: 'All · 9' })).toHaveAttribute('aria-pressed', 'true');
  // The badge follows the feed bucket, so a Consider item is never labelled "Plan soon".
  await expect(list.locator('[data-home-action-row]').filter({ hasText: 'Consider replacing the water heater' }).getByText('Consider', { exact: true })).toBeVisible();
  await expect(list.getByRole('button', { name: 'Mark useful' }).first()).toBeHidden();
  await list.getByRole('button', { name: 'More options' }).first().click();
  await expect(list.getByRole('button', { name: 'Mark useful' }).first()).toBeVisible();
  await noSidewaysScroll(page);
  await list.getByRole('button', { name: 'Consider · 3' }).click();
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'What home actions are worth a look to consider?')).toBe(true);
  await expect(page.locator('[data-calm-home-actions]').last().getByRole('button', { name: 'Consider · 3' })).toHaveAttribute('aria-pressed', 'true');
});

test('mobile: the list has no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await installAskApi(page);
  await ask(page, 'home actions fixture all');
  await expect(page.locator('[data-calm-home-actions]')).toBeVisible();
  await noSidewaysScroll(page);
});

test('a contributor sees Mark complete, Snooze and Change due date, the evidence already on the work, and the upload that still goes through review', async ({ page }) => {
  const api = await installAskApi(page);
  await ask(page, 'home actions fixture contributor');
  const answer = page.locator('[id^="ask-execution-execution-home-actions-contributor"]');
  for (const name of ['Mark complete', 'Snooze reminders', 'Change due date']) await expect(answer.getByRole('button', { name })).toBeVisible();
  await expect(answer.getByText('Chimney sweep invoice.pdf')).toBeVisible();
  await expect(answer.getByText('Awaiting review')).toBeVisible();
  await expect(answer.getByText('Verified', { exact: true })).toBeVisible();
  await answer.getByRole('button', { name: 'Change due date' }).click();
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Change the due date of this work item.'
    && (body.launchContext as { operationId?: string } | undefined)?.operationId === 'HOME_WORK_ITEM_COMMAND')).toBe(true);
});

test('contributor evidence actions: attach an existing record, and remove only the evidence that can still be withdrawn', async ({ page }) => {
  const api = await installAskApi(page);
  await ask(page, 'home actions fixture contributor');
  const answer = page.locator('[id^="ask-execution-execution-home-actions-contributor"]');
  const region = answer.locator('[data-work-evidence]');
  await expect(region.getByRole('button', { name: 'Attach an existing record' })).toBeVisible();
  await expect(region.getByRole('button', { name: 'Remove evidence' })).toBeVisible();
  await region.getByRole('button', { name: 'Attach an existing record' }).click();
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Attach an existing record as evidence for this work item.'
    && (body.launchContext as { operationId?: string; entityType?: string; entityId?: string } | undefined)?.operationId === 'HOME_WORK_ITEM_COMMAND'
    && (body.launchContext as { entityType?: string } | undefined)?.entityType === 'OPERATIONAL_WORK_ITEM'
    && (body.launchContext as { entityId?: string } | undefined)?.entityId === 'work-1')).toBe(true);
});

test('evidence upload: the file goes up first, then a review-and-confirm card names the work; nothing is attached before consent', async ({ page }) => {
  const api = await installAskApi(page);
  await ask(page, 'home actions fixture contributor');
  const attach = page.getByRole('button', { name: /Add a photo or document/ });
  await expect(attach).toBeVisible();
  await page.getByLabel('Attach evidence file for this work').last().setInputFiles({ name: 'receipt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fixture receipt bytes') });
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Attach this document as evidence for this work.'
    && (body.launchContext as { entityType?: string } | undefined)?.entityType === 'WORK_ITEM'
    && (body.launchContext as { entityId?: string } | undefined)?.entityId === 'work-1'
    && (body.launchContext as { documentId?: string } | undefined)?.documentId === 'document-evidence-fixture')).toBe(true);
  await expect(page.getByText('Attach this document as evidence?')).toBeVisible();
  expect(api.correctionConfirmBodies).toEqual([]);
});

test('a viewer sees the evidence read-only: no upload, no changing actions', async ({ page }) => {
  await installAskApi(page);
  await ask(page, 'home actions fixture viewer');
  const answer = page.locator('[id^="ask-execution-execution-home-actions-viewer"]');
  await expect(answer.getByText('Chimney sweep invoice.pdf')).toBeVisible();
  await expect(page.getByRole('button', { name: /Add a photo or document/ })).toHaveCount(0);
  for (const name of ['Attach an existing record', 'Remove evidence', 'Submit completion evidence']) await expect(answer.getByRole('button', { name })).toHaveCount(0);
  for (const name of ['Mark complete', 'Snooze reminders', 'Change due date']) await expect(answer.getByRole('button', { name })).toHaveCount(0);
});

test('regulated work: no Mark complete, plain wording that a photo does not close it, and an upload row', async ({ page }) => {
  await installAskApi(page);
  await ask(page, 'home actions fixture regulated');
  const answer = page.locator('[id^="ask-execution-execution-home-actions-regulated"]');
  await expect(answer.getByRole('button', { name: 'Mark complete' })).toHaveCount(0);
  await expect(answer.getByRole('button', { name: 'Change due date' })).toBeVisible();
  await expect(answer.getByText(/does not close it/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Add a photo or document/ })).toBeVisible();
  // The attach is worded as submitting completion evidence, and there is nothing yet to remove.
  const region = answer.locator('[data-work-evidence]');
  await expect(region.getByRole('button', { name: 'Submit completion evidence' })).toBeVisible();
  await expect(region.getByRole('button', { name: 'Attach an existing record' })).toHaveCount(0);
  await expect(region.getByRole('button', { name: 'Remove evidence' })).toHaveCount(0);
});

// ---- Work-item evidence flows (FRD 1.402): every stage below is the real handler output, generated by apps/backend/scripts/generate-work-evidence-fixtures.js. ----
const answerFor = (page: Page, kind: 'contributor' | 'regulated') => page.locator(`[id^="ask-execution-execution-home-actions-${kind}"]`);
const flowCard = (page: Page, flow: string) => page.locator(`[id^="ask-execution-execution-work-evidence-${flow}"]`);
const openAttach = async (page: Page, kind: 'contributor' | 'regulated', name: string) => {
  await ask(page, `home actions fixture ${kind}`);
  await answerFor(page, kind).locator('[data-work-evidence]').getByRole('button', { name }).click();
};

test('attach an existing record: the picker shows labels but submits TYPE:id, excludes what is attached, and nothing is saved until consent', async ({ page }) => {
  const api = await installAskApi(page, { confirmDelayMs: 600 });
  await openAttach(page, 'contributor', 'Attach an existing record');
  const card = flowCard(page, 'attach');
  await expect(card.getByText('Which record should count as evidence for this work?')).toBeVisible();
  // Only this home's documents, timeline events and facts; the already-attached document is absent.
  for (const label of ['Document · Chimney invoice.pdf', 'Document · Sweep photo.jpg', 'Timeline event · Annual inspection (Sep 2, 2026)', 'Home fact · Chimney last sweep year']) await expect(card.getByRole('button', { name: label })).toBeVisible();
  await expect(card.getByRole('button', { name: /Already attached/ })).toHaveCount(0);
  await expect(card.getByRole('button', { name: /Warranty|Inventory|Room/ })).toHaveCount(0);
  // Nothing has been sent yet, and choosing by keyboard is enough (a short list answers with one activation).
  expect(api.captureBodies).toEqual([]);
  await card.getByRole('button', { name: 'Document · Chimney invoice.pdf' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => api.captureBodies.length).toBe(1);
  // The label is shown; the canonical TYPE:id is what is submitted.
  expect(api.captureBodies[0]).toMatchObject({ captureKey: 'WORK_ITEM_ATTACH_EXISTING', answer: { record: 'DOCUMENT:doc-1' } });
  // The review names the record; capture submission alone mutated nothing.
  await expect(card.getByText('Attach this record as evidence?')).toBeVisible();
  await expect(card.getByRole('list', { name: 'Your answers so far' })).toContainText('Document · Chimney invoice.pdf');
  expect(api.correctionConfirmBodies).toEqual([]);
  const confirm = card.getByRole('button', { name: 'Attach record' });
  await expect(confirm).toBeDisabled();
  await card.getByRole('checkbox', { name: 'I authorize this change to the shared home record.' }).check();
  await expect(confirm).toBeEnabled();
  await confirm.dblclick();
  await expect(card.getByText('Evidence attached')).toBeVisible();
  // A double click while the confirmation was pending sent exactly one confirmation.
  expect(api.correctionConfirmBodies).toHaveLength(1);
  await expect(card.getByText(/pending review by the record that governs this work/)).toBeVisible();
});

test('a long list is a labelled dropdown: Continue stays disabled until a record is chosen, and the canonical value is what is submitted', async ({ page }) => {
  const api = await installAskApi(page, { workEvidenceScenario: 'attachMany' });
  await openAttach(page, 'contributor', 'Attach an existing record');
  const card = flowCard(page, 'attachMany');
  const select = card.getByLabel('Record');
  await expect(select).toBeVisible();
  const next = card.getByRole('button', { name: 'Continue' });
  await expect(next).toBeDisabled();
  // "Choose one" plus 12 documents, 1 timeline event and 1 home fact.
  await expect(select.locator('option')).toHaveCount(15);
  await select.selectOption({ label: 'Document · Record 7.pdf' });
  await expect(next).toBeEnabled();
  expect(api.captureBodies).toEqual([]);
  await next.click();
  await expect.poll(() => api.captureBodies.length).toBe(1);
  expect(api.captureBodies[0]).toMatchObject({ captureKey: 'WORK_ITEM_ATTACH_EXISTING', answer: { record: 'DOCUMENT:doc-7' } });
  await expect(card.getByText('Attach this record as evidence?')).toBeVisible();
  expect(api.correctionConfirmBodies).toEqual([]);
});

test('submit completion evidence on regulated work: its own wording through the picker, review and receipt, and it does not claim the work is complete', async ({ page }) => {
  const api = await installAskApi(page);
  await openAttach(page, 'regulated', 'Submit completion evidence');
  const card = flowCard(page, 'submit');
  await expect(card.getByText('Which record shows this work was done?')).toBeVisible();
  await card.getByRole('button', { name: 'Timeline event · Annual inspection (Sep 2, 2026)' }).click();
  await expect.poll(() => api.captureBodies.length).toBe(1);
  expect(api.captureBodies.at(-1)).toMatchObject({ captureKey: 'WORK_ITEM_SUBMIT_COMPLETION_EVIDENCE', answer: { record: 'HOME_EVENT:ev-1' } });
  await expect(card.getByText('Submit this as completion evidence?')).toBeVisible();
  await expect(card.getByText(/does not mark the work complete/)).toBeVisible();
  await card.getByRole('checkbox', { name: 'I authorize this change to the shared home record.' }).check();
  await card.getByRole('button', { name: 'Submit evidence' }).click();
  await expect(card.getByText('Completion evidence submitted')).toBeVisible();
  await expect(card.getByText(/The work itself is unchanged/)).toBeVisible();
});

test('remove evidence: only withdrawable evidence is offered, with a review that says the record itself is untouched', async ({ page }) => {
  const api = await installAskApi(page);
  await openAttach(page, 'contributor', 'Remove evidence');
  const card = flowCard(page, 'remove');
  await expect(card.getByRole('button', { name: 'Document · Old photo.jpg' })).toBeVisible();
  await card.getByRole('button', { name: 'Document · Old photo.jpg' }).click();
  await expect.poll(() => api.captureBodies.length).toBe(1);
  expect(api.captureBodies.at(-1)).toMatchObject({ captureKey: 'WORK_ITEM_REMOVE_EVIDENCE', answer: { evidence: 'row-1' } });
  await expect(card.getByText('Remove this evidence?')).toBeVisible();
  await expect(card.getByText(/The record itself is not deleted/)).toBeVisible();
  expect(api.correctionConfirmBodies).toEqual([]);
  await card.getByRole('checkbox', { name: 'I authorize this change to the shared home record.' }).check();
  await card.getByRole('button', { name: 'Remove evidence' }).click();
  await expect(card.getByText('Evidence removed')).toBeVisible();
});

test('cancelling at the picker or at the review leaves nothing saved', async ({ page }) => {
  const api = await installAskApi(page);
  await openAttach(page, 'contributor', 'Attach an existing record');
  let card = flowCard(page, 'attach');
  await card.getByRole('button', { name: 'Cancel' }).click();
  await expect.poll(() => api.cancelBodies.length).toBe(1);
  expect(api.captureBodies).toEqual([]);
  expect(api.correctionConfirmBodies).toEqual([]);
  await expect(page.getByText('No action was performed.').first()).toBeVisible();
  // And from the review card, after the capture was submitted.
  await openAttach(page, 'contributor', 'Attach an existing record');
  card = flowCard(page, 'attach').last();
  await card.getByRole('button', { name: 'Document · Sweep photo.jpg' }).click();
  await expect(card.getByText('Attach this record as evidence?')).toBeVisible();
  await card.getByRole('button', { name: 'Cancel' }).click();
  await expect.poll(() => api.cancelBodies.length).toBe(2);
  expect(api.correctionConfirmBodies).toEqual([]);
});

test('nothing to attach, nothing to remove, and a viewer: each says why and offers no form', async ({ page }) => {
  for (const [scenario, action, text] of [
    ['emptyAttach', 'Attach an existing record', /No other records to attach/],
    ['emptyRemove', 'Remove evidence', /No evidence can be removed/],
    ['viewer', 'Attach an existing record', /contributor access is required/i],
  ] as const) {
    const api = await installAskApi(page, { workEvidenceScenario: scenario });
    await openAttach(page, 'contributor', action);
    await expect(page.getByText(text).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Continue/ })).toHaveCount(0);
    expect(api.captureBodies).toEqual([]);
    expect(api.correctionConfirmBodies).toEqual([]);
  }
});
