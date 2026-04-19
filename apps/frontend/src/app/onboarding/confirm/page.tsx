'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  CheckCircle2, 
  Loader2, 
  ArrowRight, 
  Sparkles,
  ShieldCheck,
  Building
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { track } from '@/lib/analytics/events';

/**
 * ConfirmOnboardingPage handles the final conversion.
 * It takes the lookup data and creates the real property record 
 * in the user's account.
 */
export default function ConfirmOnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const savedData = sessionStorage.getItem('onboarding_lookup_data');
    if (savedData) {
      setData(JSON.parse(savedData));
    } else {
      router.push('/onboarding/address');
    }
  }, [router]);

  const handleConfirm = async () => {
    if (!data) return;

    setSubmitting(true);
    try {
      // Create the real property from the lookup data
      const response = await api.createProperty({
        address: data.address,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        yearBuilt: data.yearBuilt,
        propertySize: data.propertySize,
        propertyType: data.propertyType,
        isPrimary: true,
        // Pre-populate other fields found during lookup
        purchasePriceCents: data.lastSalePrice,
        purchaseDate: data.lastSaleDate,
      });

      if (response.success) {
        setSuccess(true);
        sessionStorage.removeItem('onboarding_lookup_data');
        toast({ title: "Home Claimed!", description: "Welcome to your command center." });
        
        track('property_claimed', {
          zipCode: data.zipCode,
          yearBuilt: data.yearBuilt || 0,
          source: 'API'
        });

        // Brief celebration delay before redirecting to dashboard
        setTimeout(() => router.push('/dashboard'), 2000);
      } else {
        toast({
          title: "Setup failed",
          description: response.message || "We couldn't claim your home. Please try again.",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Confirm error:', error);
      track('api_error_encountered', {
        endpoint: '/api/properties',
        statusCode: 500,
        message: error.message || 'Property creation failed'
      });
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!data) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-8 text-center"
      >
        {success ? (
          <div className="space-y-6 py-8">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-slate-900">Welcome Home.</h1>
              <p className="text-slate-500">Your digital twin is active and your first maintenance insights are ready.</p>
            </div>
            <Loader2 className="h-6 w-6 animate-spin text-brand-600 mx-auto" />
          </div>
        ) : (
          <div className="space-y-8">
            <div className="space-y-2">
              <div className="w-12 h-12 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Building className="h-6 w-6 text-brand-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Confirm Your Home</h1>
              <p className="text-slate-500">
                We'll link this verified record to your secure account.
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 text-left border border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Property Address</p>
              <p className="font-bold text-slate-900">{data.address}</p>
              <p className="text-sm text-slate-600">{data.city}, {data.state} {data.zipCode}</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 text-left">
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                <p className="text-sm text-slate-600">Privacy-first data encryption</p>
              </div>
              <div className="flex items-center gap-3 text-left">
                <Sparkles className="h-5 w-5 text-purple-600 shrink-0" />
                <p className="text-sm text-slate-600">Pre-populated records & tasks</p>
              </div>
            </div>

            <Button 
              className="w-full h-14 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-lg transition-all"
              onClick={handleConfirm}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  Claim and Continue
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>

            <p className="text-xs text-slate-400">
              By claiming, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
