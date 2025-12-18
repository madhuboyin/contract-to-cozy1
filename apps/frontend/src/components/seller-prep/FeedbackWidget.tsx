// apps/frontend/src/components/seller-prep/FeedbackWidget.tsx
"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp, ThumbsDown, X, Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/use-toast";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

interface FeedbackWidgetProps {
  propertyId: string;
}

export function FeedbackWidget({ propertyId }: FeedbackWidgetProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(true);
  const [selectedRating, setSelectedRating] = useState<"helpful" | "not-helpful" | null>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: async (data: { rating: string; comment?: string }) => {
      return api.submitSellerPrepFeedback(
        propertyId,
        data.rating as 'helpful' | 'not-helpful',
        data.comment,
        'seller-prep'
      );
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Thank you!",
        description: "Your feedback helps us improve.",
      });
      setTimeout(() => setIsOpen(false), 2000);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleRating = (rating: "helpful" | "not-helpful") => {
    setSelectedRating(rating);
  };

  const handleSubmit = () => {
    if (!selectedRating) return;
    mutation.mutate({
      rating: selectedRating,
      comment: comment.trim() || undefined,
    });
  };

  if (!FEATURE_FLAGS.FEEDBACK_WIDGET || !isOpen) return null;

  if (submitted) {
    return (
      <Card className="fixed bottom-4 right-4 w-80 shadow-lg border-green-200 bg-green-50 z-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-green-800">
            <ThumbsUp className="h-5 w-5" />
            <p className="text-sm font-medium">Thank you for your feedback!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 w-80 shadow-lg z-50">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <h4 className="font-medium text-sm">Was this page helpful?</h4>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!selectedRating ? (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleRating("helpful")}
              className="flex-1"
            >
              <ThumbsUp className="h-4 w-4 mr-2" />
              Yes
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleRating("not-helpful")}
              className="flex-1"
            >
              <ThumbsDown className="h-4 w-4 mr-2" />
              No
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-gray-600">
              {selectedRating === "helpful"
                ? "Great! Any additional thoughts?"
                : "Sorry to hear that. How can we improve?"}
            </div>
            <Textarea
              placeholder="Optional: Share your thoughts..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelectedRating(null)}
                disabled={mutation.isPending}
              >
                Back
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSubmit}
                disabled={mutation.isPending}
                className="flex-1"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
  );
}