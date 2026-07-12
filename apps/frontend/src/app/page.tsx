// apps/frontend/src/app/page.tsx

import Hero from '@/components/landing/Hero';
import HomePhilosophy from '@/components/landing/HomePhilosophy';
import DashboardShowcase from '@/components/landing/DashboardShowcase';
import ValuePropositionComparison from '@/components/landing/ValuePropositionComparison';
import SavingsCalculator from '@/components/landing/SavingsCalculator';
import CTASection from '@/components/landing/CTASection';
import Footer from '@/components/landing/Footer';

export default function Home() {
  return (
    <main className="min-h-screen">
      <Hero />
      <HomePhilosophy />
      <DashboardShowcase />
      <ValuePropositionComparison />
      <SavingsCalculator />
      <CTASection />
      <Footer />
    </main>
  );
}
