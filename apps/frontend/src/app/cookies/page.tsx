import LegalPageLayout from '@/components/legal/LegalPageLayout';

export const metadata = {
  title: 'Cookie Policy — ContractToCozy',
};

export default function CookiesPage() {
  return (
    <LegalPageLayout title="Cookie Policy" lastUpdated="July 9, 2026">
      <p>
        ContractToCozy uses essential cookies to keep you signed in, and optional analytics
        cookies (which you can accept or decline from the cookie banner) to help us understand
        and improve the product. The full Cookie Policy — covering exactly what's set and for how
        long — will be published here before general availability.
      </p>
    </LegalPageLayout>
  );
}
