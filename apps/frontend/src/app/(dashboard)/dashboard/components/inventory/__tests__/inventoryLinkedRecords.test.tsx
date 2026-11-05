/**
 * Findings Implementation Plan, Phase 6, F6-3: Home Records linked to an inventory item are shown beside its legacy documents, and counted with them.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import LinkedRecordsList from '../LinkedRecordsList';
import { inventoryItemDocumentCount } from '../inventoryDocuments';

const linked = (over: Partial<{ linkId: string; title: string; recordType: string; lifecycleStatus: string }> = {}) => ({
  linkId: 'l1', recordId: 'r1', title: 'Dishwasher manual', recordType: 'MANUAL', lifecycleStatus: 'ACTIVE', purpose: 'MANUAL', ...over,
});

describe('inventoryItemDocumentCount', () => {
  it('counts legacy documents and linked Home Records together', () => {
    expect(inventoryItemDocumentCount({ documents: [{ id: 'd1' }, { id: 'd2' }], homeRecordLinks: [linked()] })).toBe(3);
  });
  it('counts an item that has only a linked Home Record, which used to read as having no documents', () => {
    expect(inventoryItemDocumentCount({ documents: [], homeRecordLinks: [linked()] })).toBe(1);
  });
  it('tolerates both being absent', () => {
    expect(inventoryItemDocumentCount({})).toBe(0);
    expect(inventoryItemDocumentCount({ documents: undefined, homeRecordLinks: undefined })).toBe(0);
  });
});

describe('LinkedRecordsList', () => {
  it('renders nothing when there are no linked records', () => {
    const { container } = render(<LinkedRecordsList propertyId="p1" records={[]} />);
    expect(container.firstChild).toBeNull();
    const { container: undefinedCase } = render(<LinkedRecordsList propertyId="p1" records={undefined} />);
    expect(undefinedCase.firstChild).toBeNull();
  });

  it('names each linked record with its kind and points to Home Records, where it is managed', () => {
    render(<LinkedRecordsList propertyId="p1" records={[linked(), linked({ linkId: 'l2', title: 'Appraisal', recordType: 'INSURANCE_POLICY' })]} />);
    expect(screen.getByText('Also filed in Home Records')).toBeTruthy();
    expect(screen.getByText('Dishwasher manual')).toBeTruthy();
    expect(screen.getByText('Manual')).toBeTruthy();
    expect(screen.getByText('Insurance policy')).toBeTruthy();
    const open = screen.getByText('Open Home Records');
    expect(open.getAttribute('href')).toBe('/dashboard/properties/p1/tools/home-records');
  });

  it('says when a linked record is archived', () => {
    render(<LinkedRecordsList propertyId="p1" records={[linked({ lifecycleStatus: 'ARCHIVED' })]} />);
    expect(screen.getByText(/Archived/)).toBeTruthy();
  });

  it('is read-only: it offers no control to remove or edit a record', () => {
    render(<LinkedRecordsList propertyId="p1" records={[linked()]} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
