import LegalPageLayout from '@/components/legal/LegalPageLayout';

export const metadata = {
  title: 'Privacy Policy — Contract to Cozy',
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="July 9, 2026">
      <p>
        Contract to Cozy stores the property, financial, and account information you provide in
        order to deliver the product's maintenance, risk, and financial-planning features. The
        full Privacy Policy — covering what we collect, how it's used, who it's shared with, and
        your rights over it — will be published here before general availability.
      </p>
    </LegalPageLayout>
  );
}
