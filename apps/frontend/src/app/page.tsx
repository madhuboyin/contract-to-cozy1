import PreviewModeWrapper from '@/components/PreviewModeWrapper';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import HowItWorks from '@/components/landing/HowItWorks';
import Services from '@/components/landing/Services';
import StickyCalculator from '@/components/landing/StickyCalculator';
import Testimonials from '@/components/landing/Testimonials';
import CTASection from '@/components/landing/CTASection';
import Footer from '@/components/landing/Footer';

export default function Home() {
  const landingPage = (
    <main className="min-h-screen">
      <Hero />
      
      {/* Main Content with Sticky Calculator */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[1fr,320px] gap-8 relative">
          {/* Main Content Column */}
          <div className="space-y-0">
            <Features />
            <Services />
            <HowItWorks />
          </div>
          
          {/* Sticky Calculator Sidebar (Desktop Only) */}
          <div className="hidden lg:block">
            <div className="pt-12">
              <StickyCalculator />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Calculator (Shows on mobile/tablet) */}
      <div className="lg:hidden py-12 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-md mx-auto">
          <StickyCalculator />
        </div>
      </div>

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
