import { fireEvent, render, screen } from '@testing-library/react';
import { BuyerWorkspaceDetails, BuyerWorkspaceGuidance } from '../BuyerWorkspaceGuidance';

describe('Buyer workspace guidance-first disclosure', () => {
  it('explains the generated value before asking for supporting details', () => {
    render(<BuyerWorkspaceGuidance
      eyebrow="What C2C does with this information"
      title="Review the changes that affect closing"
      description="C2C turns confirmed facts into readiness and blockers."
      status="1 request open"
      steps={[
        { label: 'Upload the source document', complete: true },
        { label: 'Check the extracted facts' },
        { label: 'Ask the responsible professional' },
      ]}
    />);
    expect(screen.getByText('What C2C does with this information')).toBeInTheDocument();
    expect(screen.getByText(/turns confirmed facts into readiness and blockers/i)).toBeInTheDocument();
    expect(screen.getByText('1 request open')).toBeInTheDocument();
  });

  it('keeps administrative fields out of the primary experience', () => {
    render(<BuyerWorkspaceDetails summary="Only when a correction is needed"><div>Administrative field</div></BuyerWorkspaceDetails>);
    expect(screen.queryByText('Administrative field')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /view or edit details/i }));
    expect(screen.getByText('Administrative field')).toBeInTheDocument();
  });
});
