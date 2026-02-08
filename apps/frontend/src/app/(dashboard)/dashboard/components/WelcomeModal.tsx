// apps/frontend/src/app/(dashboard)/dashboard/components/WelcomeModal.tsx
import React, { useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home, Shield, DollarSign } from 'lucide-react';

interface WelcomeModalProps {
    userFirstName: string;
}

interface FeatureBlockProps {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    description: string;
}

// Helper component for visualization blocks
const FeatureBlock = ({ icon: Icon, title, description }: FeatureBlockProps) => (
    <div className="flex flex-col items-center p-2">
        <Icon className="h-6 w-6 text-orange-500 mb-2" />
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
);

/**
 * Full-screen welcome and value proposition modal for new EXISTING_OWNER users with no properties.
 */
export function WelcomeModal({ userFirstName }: WelcomeModalProps) {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            // Focus the CTA button so the user knows how to proceed
            const cta = document.getElementById('welcome-modal-cta');
            cta?.focus();
        }
    }, []);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return (
        // Full-screen overlay to block access to the empty dashboard
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-modal-title"
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
            <Card className="w-full max-w-2xl shadow-2xl p-6 text-center">
                <CardHeader>
                    <div className="flex justify-center mb-4">
                        <Home className="h-10 w-10 text-primary" />
                    </div>
                    <CardTitle id="welcome-modal-title" className="text-3xl font-heading">
                        Welcome to Cozy, {userFirstName}!
                    </CardTitle>
                    <CardDescription className="text-lg mt-2">
                        Your Personalized Home Intelligence Dashboard Awaits.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-4">

                    <p className="text-base text-muted-foreground">
                        To unlock the full potential of your dashboard, including personalized scores, maintenance alerts, and cost-saving insights, please set up your property profile.
                    </p>

                    <div className="grid grid-cols-3 gap-4 border-t pt-4">
                        <FeatureBlock
                            icon={Shield}
                            title="Property Health Score"
                            description="Evaluate the overall condition of your systems."
                        />
                        <FeatureBlock
                            icon={Shield}
                            title="Risk Assessment"
                            description="Predict potential future breakdown threats."
                        />
                        <FeatureBlock
                            icon={DollarSign}
                            title="Financial Efficiency"
                            description="Track long-term investment value and savings."
                        />
                    </div>

                    <div className="pt-4">
                        <Link href="/dashboard/properties/new">
                            <Button id="welcome-modal-cta" size="lg" className="text-lg w-full font-bold">
                                Start My Property Setup Now
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
