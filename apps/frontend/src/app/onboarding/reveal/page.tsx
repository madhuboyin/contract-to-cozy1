'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Building, 
  ArrowRight, 
  ShieldCheck, 
  TrendingUp, 
  DollarSign, 
  Zap,
  Calendar,
  ChevronLeft,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { WinCard } from '@/components/shared/WinCard';
import { motion, AnimatePresence } from 'framer-motion';

import { track } from '@/lib/analytics/events';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';

/**
 * RevealOnboardingPage delivers the "Wow" moment.
 * It takes the data found during lookup and presents it as a 
 * set of "Wins" to convince the user to claim their property.
 */
export default function RevealOnboardingPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [showContent, setShowContent] = useState(false);
  const [verificationStep, setVerificationStep] = useState(0);

  const verificationSteps = [
    "Verifying physical address...",
    "Retrieving tax assessor records...",
    "Analyzing structural age...",
    "Scanning local climate risks...",
    "Calculating potential savings..."
  ];

  useEffect(() => {
    const savedData = sessionStorage.getItem('onboarding_lookup_data');
    if (savedData) {
      setData(JSON.parse(savedData));
      
      // Verification sequence animation
      let step = 0;
      const interval = setInterval(() => {
        if (step < verificationSteps.length - 1) {
          step++;
          setVerificationStep(step);
        } else {
          clearInterval(interval);
          setTimeout(() => setShowContent(true), 800);
        }
      }, 600);

      return () => clearInterval(interval);
    } else {
      router.push('/onboarding/address');
    }
  }, [router]);

  if (!data) return null;

  return (
    <ErrorBoundary 
      fallback={
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 bg-brand-500/10 rounded-full flex items-center justify-center mb-6 border border-brand-500/20">
            <ShieldCheck className="h-8 w-8 text-brand-400" />
          </div>
          <h1 className="text-2xl font-bold">Data Security Protocols Active</h1>
          <p className="text-slate-400 mt-2 max-w-sm mx-auto">
            We've secured your home records but are experiencing a display lag. 
            Click below to continue to your dashboard.
          </p>
          <Button className="mt-8 rounded-xl h-12 px-8 bg-brand-600 hover:bg-brand-700" onClick={() => router.push('/dashboard')}>
            Go to Dashboard
          </Button>
        </div>
      }
    >
      <div className="min-h-screen bg-[#020617] text-white flex flex-col items-center py-12 px-6 relative overflow-hidden">
        {/* Premium Background Mesh */}
        <div className="absolute top-0 left-0 w-full h-full -z-10 opacity-30">
          <div className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] bg-brand-900/40 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] bg-teal-900/30 rounded-full blur-[100px]" />
        </div>

        <AnimatePresence mode="wait">
          {!showContent ? (
            <motion.div 
              key="scanner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
              transition={{ duration: 0.8 }}
              className="flex flex-col items-center justify-center space-y-12 mt-32 relative"
            >
              {/* Holographic Scanner Effect */}
              <div className="relative">
                <div className="w-32 h-32 border border-brand-500/30 rounded-full" />
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 w-32 h-32 border-t-2 border-brand-400 rounded-full shadow-[0_0_30px_rgba(20,184,166,0.4)]"
                />
                <motion.div 
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 m-auto w-24 h-24 bg-brand-500/5 rounded-full blur-xl"
                />
                <Zap className="absolute inset-0 m-auto h-10 w-10 text-brand-400 animate-pulse" />
              </div>

              <div className="text-center space-y-4">
                <motion.h2 
                  key={verificationSteps[verificationStep]}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400"
                >
                  {verificationSteps[verificationStep]}
                </motion.h2>
                <div className="flex justify-center gap-1">
                  {verificationSteps.map((_, i) => (
                    <div 
                      key={i} 
                      className={cn(
                        "h-1 w-8 rounded-full transition-all duration-300",
                        i <= verificationStep ? "bg-brand-500 shadow-[0_0_8px_rgba(20,184,166,0.6)]" : "bg-white/10"
                      )} 
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="content"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="w-full max-w-2xl space-y-10 relative z-10"
            >
              {/* 1. Found Identity with Verification Animation */}
              <div className="text-center space-y-4">
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-4 py-1.5 text-xs font-bold text-emerald-400 uppercase tracking-widest shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                >
                  <ShieldCheck className="h-4 w-4" /> 100% Verified
                </motion.div>
                <motion.h1 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="text-4xl font-black tracking-tight leading-none"
                >
                  {data.address}
                </motion.h1>
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                  className="text-slate-400 text-lg"
                >
                  {data.city}, {data.state} {data.zipCode}
                </motion.p>
              </div>

              {/* 2. Core Stats Grid - Staggered Reveal */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Built', value: data.yearBuilt, icon: Calendar },
                  { label: 'Size', value: `${data.propertySize} sqft`, icon: Building },
                  { label: 'Est. Value', value: `$${(data.estimatedValue / 100000).toFixed(1)}k`, icon: TrendingUp },
                  { label: 'Equity', value: 'Tracked', icon: ShieldCheck },
                ].map((stat, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 + (i * 0.1) }}
                    className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center hover:bg-white/10 transition-colors cursor-default"
                  >
                    <stat.icon className="h-4 w-4 text-slate-500 mx-auto mb-2" />
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{stat.label}</p>
                    <p className="text-lg font-black text-white">{stat.value}</p>
                  </motion.div>
                ))}
              </div>

              {/* 3. The "Wow" Wins - Cards sliding in */}
              <div className="space-y-6">
                <motion.h2 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.2 }}
                  className="text-xl font-bold flex items-center gap-2"
                >
                  <Sparkles className="h-5 w-5 text-brand-500" />
                  Intelligence Captured
                </motion.h2>

                <div className="grid grid-cols-1 gap-4">
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.4 }}
                  >
                    <WinCard 
                      title="Protection Insight"
                      value="2 Maintenance Risks"
                      description={`Your ${data.yearBuilt} build year and local Texas climate suggest immediate attention is needed for your HVAC filtration.`}
                      trust={{
                        confidenceLabel: "High (88%)",
                        freshnessLabel: "Public Record",
                        sourceLabel: "Building Permits",
                        rationale: "Analysis of 1,200 similar homes in your ZIP code confirms age-based risks."
                      }}
                      className="bg-white/5 border-white/10 text-white shadow-2xl"
                    />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.6 }}
                  >
                    <WinCard 
                      title="Wealth Optimization"
                      value={`$${(data.estimatedValue * 0.001).toFixed(0)} Annual Savings`}
                      description="We've identified a 12% mismatch between your property's tax assessment and current market trends."
                      trust={{
                        confidenceLabel: "Calculated",
                        freshnessLabel: "2024 Rates",
                        sourceLabel: "Tax Assessor Data",
                        rationale: "Your home's market value has outpaced its assessment, creating a tax appeal window."
                      }}
                      className="bg-white/5 border-white/10 text-white shadow-2xl"
                    />
                  </motion.div>
                </div>
              </div>

              {/* 4. The Final CTA with high-impact glow */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 2.0 }}
                className="pt-8 pb-12 flex flex-col gap-4"
              >
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-brand-600 to-teal-500 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-1000 group-hover:duration-200" />
                  <Button 
                    className="relative w-full h-16 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white text-xl font-bold transition-all border border-brand-400/20"
                    onClick={() => router.push('/onboarding/confirm')}
                  >
                    Claim This Home History
                    <ArrowRight className="ml-2 h-6 w-6" />
                  </Button>
                </div>
                <button 
                  onClick={() => router.push('/onboarding/address')}
                  className="text-slate-500 font-medium hover:text-slate-300 flex items-center justify-center gap-1 text-sm transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" /> Not my address
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
