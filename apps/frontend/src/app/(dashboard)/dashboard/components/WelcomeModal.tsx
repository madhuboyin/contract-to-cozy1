// apps/frontend/src/app/(dashboard)/dashboard/components/WelcomeModal.tsx
import React, { useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Home, ShieldCheck, Sparkles } from 'lucide-react';

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
 * Full-screen journey entry for new owner and buyer accounts with no properties.
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
                        Tell us where you are in your home journey.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-4">

                    <p className="text-base text-muted-foreground">
                        Whether you own, are buying, building, or exploring, start with the address and situation. We’ll prepare the right property-scoped experience.
                    </p>

                    <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-3">
                        <FeatureBlock
                            icon={ClipboardCheck}
                            title="Closing guidance"
                            description="Build a focused plan when you are buying."
                        />
                        <FeatureBlock
                            icon={ShieldCheck}
                            title="Home intelligence"
                            description="Protect and maintain a home you own."
                        />
                        <FeatureBlock
                            icon={Sparkles}
                            title="One next action"
                            description="Start with the most useful supported step."
                        />
                    </div>

                    <div className="pt-4">
                        <Link href="/onboarding/address">
                            <Button id="welcome-modal-cta" size="lg" className="text-lg w-full font-bold">
                                Choose my home journey
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
