// apps/frontend/src/hooks/useMilestones.ts
import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/use-toast";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

export function useMilestones(completionPercent: number) {
  const { toast } = useToast();
  const lastMilestone = useRef<number>(0);

  useEffect(() => {
    if (!FEATURE_FLAGS.MILESTONE_CELEBRATIONS) return;

    // Check for milestone achievements
    if (completionPercent >= 100 && lastMilestone.current < 100) {
      toast({
        title: "🎊 Congratulations!",
        description: "Your home is ready to list! Time to connect with an agent.",
      });
      lastMilestone.current = 100;
    } else if (completionPercent >= 75 && lastMilestone.current < 75) {
      toast({
        title: "🎉 Almost there!",
        description: "You're 75% ready to list. Great progress!",
      });
      lastMilestone.current = 75;
    } else if (completionPercent >= 50 && lastMilestone.current < 50) {
      toast({
        title: "🎯 Halfway there!",
        description: "You're 50% ready to list. Keep going!",
      });
      lastMilestone.current = 50;
    } else if (completionPercent >= 25 && lastMilestone.current < 25) {
      toast({
        title: "✨ Great start!",
        description: "You're 25% ready to list. You're on your way!",
      });
      lastMilestone.current = 25;
    }
  }, [completionPercent, toast]);
}