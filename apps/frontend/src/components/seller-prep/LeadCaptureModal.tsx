// apps/frontend/src/components/seller-prep/LeadCaptureModal.tsx
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2, Lock } from "lucide-react";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/use-toast";

interface LeadCaptureModalProps {
  propertyId: string;
  open: boolean;
  onClose: () => void;
  checklistItems?: Array<{ code: string; title: string }>;
  leadType?: 'CONTRACTOR' | 'AGENT' | 'STAGER';
}

export function LeadCaptureModal({
  propertyId,
  open,
  onClose,
  checklistItems = [],
  leadType = 'CONTRACTOR',
}: LeadCaptureModalProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    selectedTasks: [] as string[],
    otherTask: "",
    fullName: "",
    email: "",
    phone: "",
    contactMethod: "email",
    timeline: "asap",
    notes: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return api.createSellerPrepLead(
        propertyId,
        leadType,
        {
          tasks: data.selectedTasks,
          otherTask: data.otherTask,
          timeline: data.timeline,
          notes: data.notes,
        },
        {
          email: data.email,
          phone: data.phone,
          contactMethod: data.contactMethod,
          fullName: data.fullName,
        }
      );
    },
    onSuccess: () => {
      setSubmitted(true);
      const leadTypeText = leadType === 'AGENT' ? 'agents' : leadType === 'STAGER' ? 'stagers' : 'contractors';
      toast({
        title: "Request sent!",
        description: `We'll connect you with local ${leadTypeText} within 24 hours.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit request",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation - Only require tasks for CONTRACTOR leads
    if (leadType === 'CONTRACTOR' && formData.selectedTasks.length === 0 && !formData.otherTask) {
      toast({
        title: "Selection required",
        description: "Please select at least one task or describe other needs",
        variant: "destructive",
      });
      return;
    }

    if (!formData.fullName || !formData.email || !formData.phone) {
      toast({
        title: "Missing information",
        description: "Please fill in all required contact fields",
        variant: "destructive",
      });
      return;
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    mutation.mutate(formData);
  };

  const handleTaskToggle = (taskCode: string) => {
    setFormData((prev) => ({
      ...prev,
      selectedTasks: prev.selectedTasks.includes(taskCode)
        ? prev.selectedTasks.filter((code) => code !== taskCode)
        : [...prev.selectedTasks, taskCode],
    }));
  };

  const handleClose = () => {
    if (!mutation.isPending) {
      setSubmitted(false);
      setFormData({
        selectedTasks: [],
        otherTask: "",
        fullName: "",
        email: "",
        phone: "",
        contactMethod: "email",
        timeline: "asap",
        notes: "",
      });
      onClose();
    }
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px]">
          <div className="py-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 p-3">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-semibold">Request Sent!</h3>
              <p className="text-sm text-gray-600">
                Thanks! We'll connect you with local {leadType === 'AGENT' ? 'agents' : leadType === 'STAGER' ? 'stagers' : 'contractors'} within 24 hours.
              </p>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 text-left space-y-2">
              <p className="text-sm font-medium text-blue-900">What happens next:</p>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Up to 3 verified {leadType === 'AGENT' ? 'agents' : leadType === 'STAGER' ? 'stagers' : 'contractors'} will review your request</li>
                <li>• You'll receive free quotes via email and/or phone</li>
                <li>• Compare quotes and choose the best fit</li>
                <li>• Book directly with your chosen {leadType === 'AGENT' ? 'agent' : leadType === 'STAGER' ? 'stager' : 'contractor'}</li>
              </ul>
            </div>

            <div className="text-xs text-gray-500">
              Check your email for confirmation and next steps.
            </div>

            <Button onClick={handleClose} className="w-full">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {leadType === 'AGENT' ? 'Find Recommended Agents' : 
             leadType === 'STAGER' ? 'Get Free Staging Quotes' : 
             'Get Free Contractor Quotes'}
          </DialogTitle>
          <DialogDescription>
            We'll connect you with up to 3 verified local {leadType === 'AGENT' ? 'agents' : leadType === 'STAGER' ? 'stagers' : 'professionals'} within 24 hours
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Task Selection - Only show for CONTRACTOR leads */}
          {leadType === 'CONTRACTOR' && checklistItems.length > 0 && (
            <div className="space-y-3">
              <Label className="text-base font-medium">
                Which tasks need professional help? *
              </Label>
              <div className="space-y-2">
                {checklistItems.map((item) => (
                  <div key={item.code} className="flex items-center space-x-3">
                    <Checkbox
                      id={item.code}
                      checked={formData.selectedTasks.includes(item.code)}
                      onCheckedChange={() => handleTaskToggle(item.code)}
                    />
                    <Label
                      htmlFor={item.code}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {item.title}
                    </Label>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="other" className="text-sm">
                  Other (please describe):
                </Label>
                <Input
                  id="other"
                  placeholder="e.g., Deck refinishing, gutter cleaning..."
                  value={formData.otherTask}
                  onChange={(e) =>
                    setFormData({ ...formData, otherTask: e.target.value })
                  }
                />
              </div>
            </div>
          )}

          {/* Contact Information */}
          <div className="space-y-4">
            <Label className="text-base font-medium">Your contact information *</Label>

            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-sm">
                Full Name
              </Label>
              <Input
                id="fullName"
                required
                value={formData.fullName}
                onChange={(e) =>
                  setFormData({ ...formData, fullName: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm">
                  Phone
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Preferred contact method</Label>
              <RadioGroup
                value={formData.contactMethod}
                onValueChange={(value) =>
                  setFormData({ ...formData, contactMethod: value })
                }
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="email" id="contact-email" />
                  <Label htmlFor="contact-email" className="font-normal">
                    Email
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="phone" id="contact-phone" />
                  <Label htmlFor="contact-phone" className="font-normal">
                    Phone
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="either" id="contact-either" />
                  <Label htmlFor="contact-either" className="font-normal">
                    Either
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-2">
            <Label className="text-base font-medium">Timeline</Label>
            <RadioGroup
              value={formData.timeline}
              onValueChange={(value) =>
                setFormData({ ...formData, timeline: value })
              }
              className="space-y-2"
            >
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="asap" id="timeline-asap" />
                <Label htmlFor="timeline-asap" className="font-normal">
                  ASAP (within 1-2 weeks)
                </Label>
              </div>
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="flexible" id="timeline-flexible" />
                <Label htmlFor="timeline-flexible" className="font-normal">
                  Flexible (1-2 months)
                </Label>
              </div>
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="planning" id="timeline-planning" />
                <Label htmlFor="timeline-planning" className="font-normal">
                  Planning ahead (3+ months)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Additional Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm">
              Additional notes (optional)
            </Label>
            <Textarea
              id="notes"
              placeholder="Any specific requirements, budget constraints, or preferences..."
              rows={3}
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
            />
          </div>

          {/* Security Notice */}
          <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
            <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>
              Your information is secure and will only be shared with verified, licensed
              contractors in your area.
            </p>
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={mutation.isPending}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Get Free Quotes"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}