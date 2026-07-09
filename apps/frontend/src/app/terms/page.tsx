import LegalPageLayout from '@/components/legal/LegalPageLayout';

export const metadata = {
  title: 'Terms of Service — Contract to Cozy',
};

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="July 9, 2026">
      <p>
        By creating a Contract to Cozy account you agree to use the product in good faith and
        understand that it is currently in a pilot phase. The full Terms of Service governing
        your use of the platform — including acceptable use, liability, and account termination —
        will be published here before general availability.
      </p>
    </LegalPageLayout>
  );
}
