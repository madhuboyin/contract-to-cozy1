import LegalPageLayout from '@/components/legal/LegalPageLayout';

export const metadata = {
  title: 'Privacy Policy — ContractToCozy',
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="July 9, 2026" noticeVariant="template">
      <p>
        This Privacy Policy explains how [ContractToCozy Legal Entity Name]
        (&quot;ContractToCozy,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;)
        collects, uses, shares, and protects information when you use our website, dashboard, and
        related applications (the &quot;Service&quot;). It applies to homeowners and service
        providers who create an account.
      </p>

      <h2>1. Information We Collect</h2>
      <ul>
        <li>
          <strong>Account information:</strong> name, email, phone number, password (stored as a
          salted hash, never in plain text), and role (homeowner or provider).
        </li>
        <li>
          <strong>Property information:</strong> address, purchase price, appraised value,
          mortgage details, inventory items, photos, and documents you upload or connect for
          maintenance, risk, and financial-planning features.
        </li>
        <li>
          <strong>Financial-planning inputs:</strong> reserve fund contributions, coverage and
          insurance details, and similar figures you enter for budgeting and risk tools. We do not
          collect full payment card numbers directly — payment processing, if and when introduced,
          is handled by a PCI-compliant third-party processor.
        </li>
        <li>
          <strong>Usage and device data:</strong> pages viewed, features used, timestamps, IP
          address, browser/device type, and similar analytics collected via our product-analytics
          system and, where you&apos;ve consented, Grafana Faro real-user-monitoring.
        </li>
        <li>
          <strong>Cookies:</strong> essential cookies required for sign-in, and optional analytics
          cookies you can accept or decline via the cookie banner. See our{' '}
          <a href="/cookies">Cookie Policy</a> for details.
        </li>
        <li>
          <strong>Communications:</strong> messages you send us (e.g. support requests, in-app
          feedback) and the content of those messages.
        </li>
      </ul>

      <h2>2. How We Use Information</h2>
      <ul>
        <li>To provide, maintain, and personalize the Service, including guidance, risk, and financial tools;</li>
        <li>To operate the marketplace connecting you with Providers, where applicable;</li>
        <li>To send transactional communications (account, security, and service-related notices) and, where permitted, product updates;</li>
        <li>To detect, prevent, and respond to fraud, abuse, and security incidents;</li>
        <li>To analyze product usage and improve the Service; and</li>
        <li>To comply with legal obligations.</li>
      </ul>

      <h2>3. AI Processing</h2>
      <p>
        Certain features send relevant portions of your property, inventory, and account data to
        Google Gemini (a third-party AI provider) to generate guidance, cost estimates, and
        analysis. This data is transmitted securely and used to generate a response to your
        request; it is subject to Google&apos;s applicable API data-handling terms in addition to
        this Policy. Do not upload content to AI-powered features that you are not comfortable
        having processed by a third-party AI model.
      </p>

      <h2>4. How We Share Information</h2>
      <p>We do not sell your personal information. We share information only:</p>
      <ul>
        <li>
          <strong>With Providers,</strong> when you request a quote or booking, limited to what&apos;s
          needed to fulfill that request;
        </li>
        <li>
          <strong>With service providers we use to operate the Service</strong> (e.g. cloud
          hosting, email delivery, error monitoring, AI processing), under contractual
          confidentiality obligations;
        </li>
        <li>
          <strong>For legal reasons,</strong> if required by law, subpoena, or to protect the
          rights, safety, or property of ContractToCozy, our users, or the public; and
        </li>
        <li>
          <strong>In a business transfer,</strong> such as a merger, acquisition, or asset sale, in
          which case we will provide notice before your information becomes subject to a different
          privacy policy.
        </li>
      </ul>

      <h2>5. Data Retention</h2>
      <p>
        We retain your information for as long as your account is active and as needed to provide
        the Service. If you delete your account, we delete or anonymize your personal information
        within a reasonable period, except where we are required to retain it for legal,
        accounting, or security purposes (e.g. fraud prevention records).
      </p>

      <h2>6. Data Security</h2>
      <p>
        We use administrative, technical, and organizational measures designed to protect your
        information, including encryption in transit (TLS), access controls, and authenticated,
        rate-limited APIs. As a pilot-stage product, our security program is still maturing —
        notably, database encryption at rest is on our roadmap but not yet implemented. No method
        of transmission or storage is 100% secure, and we cannot guarantee absolute security.
      </p>

      <h2>7. Your Rights and Choices</h2>
      <p>
        You can access and update most of your information directly from your account settings.
        You can delete or deactivate your account at any time from your profile page&apos;s Danger
        Zone, which permanently removes or anonymizes your data subject to Section 5 above.
        Depending on where you live, you may have additional rights (such as access, correction,
        deletion, portability, or objection to processing) under laws like the CCPA or GDPR. To
        exercise these rights, email{' '}
        <a href="mailto:privacy@contracttocozy.com">privacy@contracttocozy.com</a>.
      </p>

      <h2>8. Children&apos;s Privacy</h2>
      <p>
        The Service is not directed to children under 18, and we do not knowingly collect
        information from them. If you believe a child has provided us information, contact us and
        we will delete it.
      </p>

      <h2>9. International Users</h2>
      <p>
        The Service is currently operated for a pilot audience primarily located in the United
        States, and your information is processed and stored in the United States. [Cross-border
        transfer mechanism, if the pilot expands internationally, to be finalized with counsel.]
      </p>

      <h2>10. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. If we make material changes, we will
        notify you (for example, by email or an in-app notice) before they take effect.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about this Policy, or requests regarding your information, can be sent to{' '}
        <a href="mailto:privacy@contracttocozy.com">privacy@contracttocozy.com</a>.
      </p>
    </LegalPageLayout>
  );
}
