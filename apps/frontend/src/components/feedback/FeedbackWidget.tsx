// apps/frontend/src/components/feedback/FeedbackWidget.tsx
//
// App-wide pilot feedback widget: floating thumbs-up/down + comment card.
// Mounted once in the dashboard root layout (app/(dashboard)/layout.tsx) so
// it's available on every dashboard page, not just seller-prep (its
// original home — see git history of
// components/seller-prep/FeedbackWidget.tsx for the pre-generalization
// version, which required a propertyId prop and posted to
// /api/seller-prep/feedback).
"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp, ThumbsDown, X, Loader2, MessageSquare } from "lucide-react";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/use-toast";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

const FEEDBACK_REASONS = [
  ["ALREADY_HANDLED", "Already handled"], ["WRONG_FACT", "Wrong fact"],
  ["WRONG_TIMING", "Wrong timing"], ["NOT_APPLICABLE", "Not applicable"],
  ["DUPLICATE", "Duplicate"], ["UNCLEAR_EXPLANATION", "Unclear"],
  ["UNSAFE_OR_INAPPROPRIATE", "Unsafe"],
] as const;

export function FeedbackWidget() {
  const { toast } = useToast();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false); // Default to false to show the trigger button
  const [selectedRating, setSelectedRating] = useState<"up" | "down" | null>(null);
  const [comment, setComment] = useState("");
  const [reasonCodes, setReasonCodes] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const mutation = useMutation({
    mutationFn: async (data: { rating: "up" | "down"; comment?: string; reasonCodes?: string[] }) => {
      return api.submitFeedback(data.rating, data.comment, pathname || "unknown", data.reasonCodes);
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Thank you!",
        description: "Your feedback helps us improve.",
      });
      setTimeout(() => {
        if (!mountedRef.current) return;
        setIsOpen(false);
        setSubmitted(false);
        setSelectedRating(null);
        setComment("");
        setReasonCodes([]);
      }, 3000);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
      });
    },
  });

  const handleSubmit = () => {
    if (!selectedRating) return;
    mutation.mutate({ rating: selectedRating, comment, reasonCodes });
  };

  // If feature flag is off, don't render
  if (!FEATURE_FLAGS.FEEDBACK_WIDGET) return null;

  return (
    // Positioned fixed to bottom-left (left-6) to avoid blocking AI Chat on the right
    <div className="fixed bottom-[calc(60px+env(safe-area-inset-bottom)+1rem)] left-6 z-40 flex flex-col items-start gap-4 lg:bottom-6">
      {isOpen && !submitted && (
        <Card className="w-72 shadow-xl border-blue-100 animate-in fade-in slide-in-from-left-4 duration-200">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-blue-900">
                Got feedback?
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-gray-400 hover:text-gray-600"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {selectedRating === null ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 hover:bg-green-50 hover:text-green-600 border-gray-200"
                  onClick={() => setSelectedRating("up")}
                >
                  <ThumbsUp className="h-4 w-4 mr-2" />
                  Yes
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 hover:bg-red-50 hover:text-red-600 border-gray-200"
                  onClick={() => setSelectedRating("down")}
                >
                  <ThumbsDown className="h-4 w-4 mr-2" />
                  No
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-gray-600 font-medium">
                  {selectedRating === "up"
                    ? "Great! Any additional thoughts?"
                    : "Sorry to hear that. How can we improve?"}
                </div>
                <Textarea
                  placeholder="Share your feedback..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  className="text-sm resize-none focus-visible:ring-blue-500"
                />
                {selectedRating === "down" && (
                  <div className="flex flex-wrap gap-1" aria-label="Why was this not useful?">
                    {FEEDBACK_REASONS.map(([code, label]) => (
                      <button key={code} type="button" aria-pressed={reasonCodes.includes(code)}
                        className={`rounded-full border px-2 py-1 text-[11px] ${reasonCodes.includes(code) ? "border-blue-500 bg-blue-50 text-blue-800" : "border-gray-200 text-gray-600"}`}
                        onClick={() => setReasonCodes((current) => current.includes(code) ? current.filter((item) => item !== code) : current.length < 3 ? [...current, code] : current)}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedRating(null)}
                    disabled={mutation.isPending}
                    className="text-gray-500"
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSubmit}
                    disabled={mutation.isPending}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                  >
                    {mutation.isPending ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Submit"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {submitted && (
        <Card className="p-4 bg-green-50 border-green-200 animate-in fade-in zoom-in duration-300">
          <p className="text-sm text-green-700 font-medium flex items-center gap-2">
            <ThumbsUp className="h-4 w-4" /> Thank you for your feedback!
          </p>
        </Card>
      )}

      {/* Floating Trigger Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="rounded-full h-12 w-12 shadow-lg bg-blue-600 hover:bg-blue-700 transition-all active:scale-95"
          size="icon"
          aria-label="Open feedback form"
        >
          <MessageSquare className="h-6 w-6 text-white" />
        </Button>
      )}
    </div>
  );
}
