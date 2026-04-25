'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Home, Search, Sparkles, ArrowRight, Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { track } from '@/lib/analytics/events';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';

/**
 * AddressOnboardingPage is the first "Wow" moment.
 * It eliminates the data entry wall by allowing users to simply
 * lookup their address to see what we already know about their home.
 */
export default function AddressOnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [address, setAddress] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [loading, setLoading] = useState(false);

  // Mount tracking
  React.useEffect(() => {
    track('landing_page_viewed', { source: 'onboarding_address', deviceType: 'web' });
  }, []);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;

    setLoading(true);
    track('address_lookup_started', { source: 'onboarding_page' });

    try {
      // Trigger the Magic Lookup
      const response = await api.lookupProperty(address, zipCode);

      if (response.success && response.data) {
        // Store data temporarily in session storage for the reveal page
        sessionStorage.setItem('onboarding_lookup_data', JSON.stringify(response.data));
        router.push('/onboarding/reveal');
      } else {
        toast({
          title: "Address not found",
          description: "We couldn't find public records for this address. You can still add it manually.",
          variant: "destructive"
        });
        // Optionally redirect to manual add
      }
    } catch (error) {
      console.error('Lookup error:', error);
      toast({
        title: "Connection error",
        description: "Something went wrong while searching. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ErrorBoundary 
      fallback={
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-6">
            <Zap className="h-8 w-8 text-rose-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Onboarding Temporarily Unavailable</h1>
          <p className="text-slate-500 mt-2 max-w-sm mx-auto">
            We're experiencing a high volume of home lookups. Please refresh the page or try again in a few minutes.
          </p>
          <Button className="mt-8 rounded-xl h-12 px-8" onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
        </div>
      }
    >
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 sm:p-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-xl space-y-10 text-center"
        >
          {/* Branding */}
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-brand-600 rounded-3xl shadow-xl shadow-brand-200 flex items-center justify-center rotate-3">
              <Home className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-sm font-bold tracking-normal text-brand-600">
              Contract to Cozy
            </h2>
          </div>

          {/* Hero Copy */}
          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl font-black text-slate-900 leading-tight">
              Claim your home’s <br />
              <span className="text-brand-600">Digital Twin.</span>
            </h1>
            <p className="text-lg text-slate-500 max-w-md mx-auto leading-relaxed">
              Enter your address to instantly see your home's health score and potential savings.
            </p>
          </div>

          {/* Search Experience */}
          <form onSubmit={handleLookup} className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-brand-600 to-teal-500 rounded-3xl blur opacity-20 group-focus-within:opacity-40 transition-opacity" />
            <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 p-2 flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input 
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street Address" 
                  className="h-14 pl-12 border-none text-lg placeholder:text-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0"
                  autoFocus
                />
              </div>
              <div className="w-full sm:w-32 border-t sm:border-t-0 sm:border-l border-slate-100">
                <Input 
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  placeholder="Zip" 
                  className="h-14 border-none text-lg placeholder:text-slate-300 text-center focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
              <Button 
                type="submit"
                disabled={loading || !address.trim()}
                className="h-14 px-8 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-lg group transition-all"
              >
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    Find My Home
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* Trust Signals */}
          <div className="flex flex-wrap items-center justify-center gap-6 pt-6 opacity-60">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Zap className="h-4 w-4 text-brand-600 fill-brand-600" />
              AI-Powered Analysis
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Sparkles className="h-4 w-4 text-purple-600 fill-purple-600" />
              Zero Manual Entry
            </div>
          </div>
        </motion.div>

        {/* Background Decoration */}
        <div className="fixed top-0 left-0 w-full h-full -z-10 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute top-1/4 -left-10 w-96 h-96 bg-brand-200 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 -right-10 w-80 h-80 bg-teal-200 rounded-full blur-3xl" />
        </div>
      </div>
    </ErrorBoundary>
  );
}

