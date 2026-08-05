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
    consentGiven: false,
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
        },
        data.consentGiven,
      );
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Request saved",
        description: "Your request has been recorded. We don't yet have a live matching or fulfillment process, so there's no guaranteed response — see next steps below.",
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

    // Simple phone validation — must contain at least 7 digits
    const phoneRegex = /^\+?[\d\s\-().]{7,}$/;
    if (!phoneRegex.test(formData.phone)) {
      toast({
        title: "Invalid phone number",
        description: "Please enter a valid phone number",
        variant: "destructive",
      });
      return;
    }

    if (!formData.consentGiven) {
      toast({
        title: "Consent required",
        description: "Please confirm you agree to share this information before submitting.",
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
        consentGiven: false,
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
              <h3 className="text-xl font-semibold">Request saved</h3>
              <p className="text-sm text-gray-600">
                Your interest in finding a {leadType === 'AGENT' ? 'agent' : leadType === 'STAGER' ? 'stager' : 'contractor'} has been recorded with the contact details you provided.
              </p>
            </div>

            <div className="bg-amber-50 rounded-lg p-4 text-left space-y-2">
              <p className="text-sm font-medium text-amber-900">What this doesn&apos;t do yet:</p>
              <ul className="text-sm text-amber-800 space-y-1">
                <li>• We don&apos;t currently match you with providers or guarantee any response</li>
                <li>• No professionals have been notified or verified on your behalf</li>
                <li>• There is no quote or timeline commitment tied to this request</li>
              </ul>
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
      <DialogContent className="sm:max-w-[600px] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {leadType === 'AGENT' ? 'Record interest in finding an agent' :
             leadType === 'STAGER' ? 'Record interest in staging help' :
             'Record interest in contractor help'}
          </DialogTitle>
          <DialogDescription>
            This saves your request and contact details. We don&apos;t yet match you with providers or guarantee a response — see "What this doesn't do yet" after you submit.
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
                autoComplete="name"
                enterKeyHint="next"
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
                  autoComplete="email"
                  enterKeyHint="next"
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
                  autoComplete="tel"
                  inputMode="tel"
                  enterKeyHint="done"
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

          {/* Security notice + consent */}
          <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
            <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>
              This information is stored with your account. We don&apos;t currently have a
              provider network, so it is not shared with any contractor, agent, or stager
              automatically.
            </p>
          </div>
          <div className="flex items-start space-x-3">
            <Checkbox
              id="lead-consent"
              checked={formData.consentGiven}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, consentGiven: checked === true })
              }
            />
            <Label htmlFor="lead-consent" className="text-sm font-normal leading-snug">
              I understand this only records my request and contact details, and does not
              connect me with a professional or guarantee any follow-up.
            </Label>
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
                  Saving...
                </>
              ) : (
                "Save request"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}