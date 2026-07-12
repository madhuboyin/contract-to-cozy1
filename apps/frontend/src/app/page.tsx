// apps/frontend/src/app/page.tsx

import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import HowItWorks from '@/components/landing/HowItWorks';
import ValuePropositionComparison from '@/components/landing/ValuePropositionComparison'; // NEW IMPORT
import Neighborhood from '@/components/landing/Neighborhood';
import SavingsCalculator from '@/components/landing/SavingsCalculator';
import CTASection from '@/components/landing/CTASection';
import Footer from '@/components/landing/Footer';

export default function Home() {
  return (
    <main className="min-h-screen">
      <Hero />
      <Features />
      <HowItWorks />
      <ValuePropositionComparison /> {/* NEW COMPONENT PLACED HERE */}
      <SavingsCalculator />
      <Neighborhood />
      <CTASection />
      <Footer />
    </main>
  );
}
