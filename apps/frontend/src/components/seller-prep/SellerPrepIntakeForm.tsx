// apps/frontend/src/components/seller-prep/SellerPrepIntakeForm.tsx
"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";

interface IntakeFormData {
  timeline: string;
  budget: string;
  propertyType: string;
  priority: string;
  condition: string;
}

interface SellerPrepIntakeFormProps {
  propertyId: string;
  open: boolean;
  onComplete: (data: IntakeFormData) => void;
  onSkip: () => void;
}

export function SellerPrepIntakeForm({
  propertyId,
  open,
  onComplete,
  onSkip,
}: SellerPrepIntakeFormProps) {
  const [formData, setFormData] = useState<IntakeFormData>({
    timeline: "",
    budget: "",
    propertyType: "",
    priority: "",
    condition: "",
  });

  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 5;

  const mutation = useMutation({
    mutationFn: async (data: IntakeFormData) => {
      return api.saveSellerPrepPreferences(propertyId, data);
    },
    onSuccess: () => {
      onComplete(formData);
    },
  });

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      mutation.mutate(formData);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return !!formData.timeline;
      case 2: return !!formData.budget;
      case 3: return !!formData.propertyType;
      case 4: return !!formData.priority;
      case 5: return !!formData.condition;
      default: return false;
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <Label className="text-base font-medium">
              When are you planning to sell?
            </Label>
            <RadioGroup
              value={formData.timeline}
              onValueChange={(value) =>
                setFormData({ ...formData, timeline: value })
              }
              className="space-y-3"
            >
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="1-3mo" id="1-3mo" />
                <Label htmlFor="1-3mo" className="cursor-pointer flex-1 font-normal">
                  1-3 months (urgent)
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="3-6mo" id="3-6mo" />
                <Label htmlFor="3-6mo" className="cursor-pointer flex-1 font-normal">
                  3-6 months
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="6-12mo" id="6-12mo" />
                <Label htmlFor="6-12mo" className="cursor-pointer flex-1 font-normal">
                  6-12 months
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="1yr+" id="1yr+" />
                <Label htmlFor="1yr+" className="cursor-pointer flex-1 font-normal">
                  1 year or more
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="unsure" id="unsure" />
                <Label htmlFor="unsure" className="cursor-pointer flex-1 font-normal">
                  Not sure yet
                </Label>
              </div>
            </RadioGroup>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <Label className="text-base font-medium">
              What's your improvement budget?
            </Label>
            <RadioGroup
              value={formData.budget}
              onValueChange={(value) =>
                setFormData({ ...formData, budget: value })
              }
              className="space-y-3"
            >
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="0-5k" id="0-5k" />
                <Label htmlFor="0-5k" className="cursor-pointer flex-1 font-normal">
                  Under $5,000
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="5-15k" id="5-15k" />
                <Label htmlFor="5-15k" className="cursor-pointer flex-1 font-normal">
                  $5,000 - $15,000
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="15-30k" id="15-30k" />
                <Label htmlFor="15-30k" className="cursor-pointer flex-1 font-normal">
                  $15,000 - $30,000
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="30k+" id="30k+" />
                <Label htmlFor="30k+" className="cursor-pointer flex-1 font-normal">
                  Over $30,000
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="unsure" id="budget-unsure" />
                <Label htmlFor="budget-unsure" className="cursor-pointer flex-1 font-normal">
                  Not sure yet
                </Label>
              </div>
            </RadioGroup>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <Label className="text-base font-medium">
              What type of property?
            </Label>
            <RadioGroup
              value={formData.propertyType}
              onValueChange={(value) =>
                setFormData({ ...formData, propertyType: value })
              }
              className="space-y-3"
            >
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="single-family" id="single-family" />
                <Label htmlFor="single-family" className="cursor-pointer flex-1 font-normal">
                  Single Family Home
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="condo" id="condo" />
                <Label htmlFor="condo" className="cursor-pointer flex-1 font-normal">
                  Condo
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="townhouse" id="townhouse" />
                <Label htmlFor="townhouse" className="cursor-pointer flex-1 font-normal">
                  Townhouse
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="multi-family" id="multi-family" />
                <Label htmlFor="multi-family" className="cursor-pointer flex-1 font-normal">
                  Multi-family
                </Label>
              </div>
            </RadioGroup>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <Label className="text-base font-medium">
              What's your priority?
            </Label>
            <RadioGroup
              value={formData.priority}
              onValueChange={(value) =>
                setFormData({ ...formData, priority: value })
              }
              className="space-y-3"
            >
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="max-price" id="max-price" />
                <Label htmlFor="max-price" className="cursor-pointer flex-1 font-normal">
                  Maximize sale price
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="fast-sale" id="fast-sale" />
                <Label htmlFor="fast-sale" className="cursor-pointer flex-1 font-normal">
                  Sell as fast as possible
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="minimal-effort" id="minimal-effort" />
                <Label htmlFor="minimal-effort" className="cursor-pointer flex-1 font-normal">
                  Minimize effort and cost
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="priority-unsure" id="priority-unsure" />
                <Label htmlFor="priority-unsure" className="cursor-pointer flex-1 font-normal">
                  Not sure yet
                </Label>
              </div>
            </RadioGroup>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <Label className="text-base font-medium">
              Current home condition?
            </Label>
            <RadioGroup
              value={formData.condition}
              onValueChange={(value) =>
                setFormData({ ...formData, condition: value })
              }
              className="space-y-3"
            >
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="excellent" id="excellent" />
                <Label htmlFor="excellent" className="cursor-pointer flex-1 font-normal">
                  Excellent (move-in ready)
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="good" id="good" />
                <Label htmlFor="good" className="cursor-pointer flex-1 font-normal">
                  Good (minor fixes needed)
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="fair" id="fair" />
                <Label htmlFor="fair" className="cursor-pointer flex-1 font-normal">
                  Fair (several updates needed)
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="needs-work" id="needs-work" />
                <Label htmlFor="needs-work" className="cursor-pointer flex-1 font-normal">
                  Needs work (major repairs)
                </Label>
              </div>
            </RadioGroup>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Tell us about your sale</DialogTitle>
          <DialogDescription>
            We'll personalize recommendations based on your situation
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress indicator */}
          <div className="flex items-center justify-center gap-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all ${
                  i + 1 === currentStep
                    ? "w-8 bg-green-600"
                    : i + 1 < currentStep
                    ? "w-2 bg-green-600"
                    : "w-2 bg-gray-300"
                }`}
              />
            ))}
          </div>

          {/* Current step */}
          {renderStep()}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="ghost"
              onClick={onSkip}
              disabled={mutation.isPending}
            >
              Skip for now
            </Button>

            <div className="flex gap-2">
              {currentStep > 1 && (
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={mutation.isPending}
                >
                  Back
                </Button>
              )}
              <Button
                onClick={handleNext}
                disabled={!canProceed() || mutation.isPending}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : currentStep === totalSteps ? (
                  "Get My Plan"
                ) : (
                  "Next"
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}