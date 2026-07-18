// apps/frontend/src/app/page.tsx

import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import HomeBriefPreview from '@/components/landing/HomeBriefPreview';
import PermanentHomeMemory from '@/components/landing/PermanentHomeMemory';
import HowItWorks from '@/components/landing/HowItWorks';
import ValuePropositionComparison from '@/components/landing/ValuePropositionComparison';
import Neighborhood from '@/components/landing/Neighborhood';
import SavingsCalculator from '@/components/landing/SavingsCalculator';
import CTASection from '@/components/landing/CTASection';
import Footer from '@/components/landing/Footer';

export default function Home() {
  return (
    <main className="min-h-screen">
      <Hero />
      <Features />
      <SavingsCalculator />
      <HomeBriefPreview />
      <PermanentHomeMemory />
      <HowItWorks />
      <ValuePropositionComparison />
      <Neighborhood />
      <CTASection />
      <Footer />
    </main>
  );
}
