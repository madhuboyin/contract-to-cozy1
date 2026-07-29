import fs from 'node:fs';
import path from 'node:path';

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

const outcomeRecorder = readSource('src/components/savings-benefits/OutcomeRecorder.tsx');
const hiddenAssetFinder = readSource(
  'src/app/(dashboard)/dashboard/properties/[id]/tools/hidden-asset-finder/HiddenAssetFinderClient.tsx',
);
const documentUploadZone = readSource(
  'src/app/(dashboard)/dashboard/components/inventory/DocumentUploadZone.tsx',
);
const documentPickerModal = readSource(
  'src/app/(dashboard)/dashboard/components/inventory/DocumentPickerModal.tsx',
);
const adminConsole = readSource('src/app/(dashboard)/dashboard/admin/savings-benefits/page.tsx');

describe('Savings and Benefits — accessibility contract (HSB-034)', () => {
  it('OutcomeRecorder: stage picker and free-text inputs are all named for assistive technology', () => {
    expect(outcomeRecorder).toContain('role="group" aria-label="Outcome stage to record"');
    expect(outcomeRecorder).toContain('aria-pressed={stage === s}');
    expect(outcomeRecorder).toContain("aria-label={family === 'BENEFIT' ? 'Amount received in dollars'");
    expect(outcomeRecorder).toContain('aria-label="Reason given for the denial"');
    expect(outcomeRecorder).toContain('aria-label="Evidence note"');
    // Every focusable custom control gets a visible focus ring, not just the
    // browser default (which some global resets suppress).
    expect(outcomeRecorder).toContain('focus-visible:ring-2 focus-visible:ring-teal-500');
  });

  it('HiddenAssetFinderClient: sensitive-fact Yes/No toggles report pressed state and the free-text fallback is named', () => {
    expect(hiddenAssetFinder).toContain("aria-pressed={draft === 'yes'}");
    expect(hiddenAssetFinder).toContain("aria-pressed={draft === 'no'}");
    expect(hiddenAssetFinder).toContain('aria-label={SENSITIVE_FACT_LABEL[fact.factKey]}');
    // Decorative icons throughout the detail sheet must not be announced.
    expect(hiddenAssetFinder).toContain('aria-hidden="true"');
  });

  it('DocumentUploadZone: the drop-zone is keyboard-operable, not click-only', () => {
    expect(documentUploadZone).toContain('role="button"');
    expect(documentUploadZone).toContain('tabIndex={disabled ? -1 : 0}');
    expect(documentUploadZone).toContain("event.key === 'Enter' || event.key === ' '");
    expect(documentUploadZone).toContain('aria-label="Upload a document');
    expect(documentUploadZone).toContain('aria-label="Remove attached document"');
  });

  it('DocumentPickerModal: dialog semantics are present and Escape closes it', () => {
    expect(documentPickerModal).toContain('role="dialog"');
    expect(documentPickerModal).toContain('aria-modal="true"');
    expect(documentPickerModal).toContain('aria-labelledby="doc-picker-modal-title"');
    expect(documentPickerModal).toContain("event.key === 'Escape'");
  });

  it('Admin console: icon-only rule-removal control is named per row, not just visually implied', () => {
    expect(adminConsole).toContain('aria-label={`Remove rule ${index + 1}`}');
    expect(adminConsole).toContain('<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />');
  });
});
