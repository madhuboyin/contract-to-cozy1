// apps/frontend/src/app/page.tsx

import Hero from '@/components/landing/Hero';
import HomePhilosophy from '@/components/landing/HomePhilosophy';
import ValuePropositionComparison from '@/components/landing/ValuePropositionComparison'; // NEW IMPORT
import Neighborhood from '@/components/landing/Neighborhood';
import SavingsCalculator from '@/components/landing/SavingsCalculator';
import Testimonials from '@/components/landing/Testimonials';
import CTASection from '@/components/landing/CTASection';
import Footer from '@/components/landing/Footer';

export default function Home() {
  return (
    <main className="min-h-screen">
      <Hero />
      <HomePhilosophy />
      <ValuePropositionComparison /> {/* NEW COMPONENT PLACED HERE */}
      <SavingsCalculator />
      <Neighborhood />
      <Testimonials />
      <CTASection />
      <Footer />
    </main>
  );
}
