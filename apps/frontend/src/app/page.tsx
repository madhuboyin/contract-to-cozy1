// apps/frontend/src/app/page.tsx

import Hero from '@/components/landing/Hero';
import HomePhilosophy from '@/components/landing/HomePhilosophy';
import HowItWorks from '@/components/landing/HowItWorks';
import DashboardShowcase from '@/components/landing/DashboardShowcase';
import ValuePropositionComparison from '@/components/landing/ValuePropositionComparison'; // NEW IMPORT
import HomeKnowledge from '@/components/landing/HomeKnowledge';
import HomeKnowledgeTimeline from '@/components/landing/HomeKnowledgeTimeline';
import ConnectedEcosystem from '@/components/landing/ConnectedEcosystem';
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
      <HowItWorks />
      <DashboardShowcase />
      <ValuePropositionComparison /> {/* NEW COMPONENT PLACED HERE */}
      <HomeKnowledge />
      <SavingsCalculator />
      <Neighborhood />
      <HomeKnowledgeTimeline />
      <Testimonials />
      <ConnectedEcosystem />
      <CTASection />
      <Footer />
    </main>
  );
}
