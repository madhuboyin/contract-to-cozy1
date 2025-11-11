import PreviewModeWrapper from '@/components/PreviewModeWrapper';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import HowItWorks from '@/components/landing/HowItWorks';
import DashboardShowcase from '@/components/landing/DashboardShowcase';
import Services from '@/components/landing/Services';
import Neighborhood from '@/components/landing/Neighborhood';
import SavingsCalculator from '@/components/landing/SavingsCalculator';
import Testimonials from '@/components/landing/Testimonials';
import CTASection from '@/components/landing/CTASection';
import Footer from '@/components/landing/Footer';

export default function Home() {
  const landingPage = (
    <main className="min-h-screen">
      <Hero />
      <Features />
      <HowItWorks />
      <DashboardShowcase />
      <Services />
      <Neighborhood />
      <SavingsCalculator />
      <Testimonials />
      <CTASection />
      <Footer />
    </main>
  );

  return (
    <PreviewModeWrapper>
      {landingPage}
    </PreviewModeWrapper>
  );
}
