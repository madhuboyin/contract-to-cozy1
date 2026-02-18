// apps/frontend/src/components/seller-prep/SellerPrepDisclaimer.tsx
"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, ExternalLink } from "lucide-react";

export function SellerPrepDisclaimer() {
  const [showSources, setShowSources] = useState(false);

  return (
    <>
      <Alert className="border-yellow-300 bg-yellow-50">
        <AlertCircle className="h-4 w-4 text-yellow-600" />
        <AlertDescription className="text-sm text-yellow-900">
          <strong>Important:</strong> ROI estimates are based on national averages from
          industry reports and may not reflect your local market conditions. Actual results
          vary significantly by location, property condition, market timing, and quality of
          work. This information is for educational purposes only and should not be
          considered professional advice.{" "}
          <button
            onClick={() => setShowSources(true)}
            className="underline hover:text-yellow-700 font-medium"
          >
            View data sources
          </button>
          . Consult a licensed real estate agent for personalized guidance.
        </AlertDescription>
      </Alert>

      <Dialog open={showSources} onOpenChange={setShowSources}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Data Sources & Methodology</DialogTitle>
            <DialogDescription>
              Our recommendations are based on the following industry research
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="border-l-4 border-blue-500 pl-4">
              <h4 className="font-semibold text-sm mb-1">Remodeling Magazine</h4>
              <p className="text-sm text-gray-600 mb-2">
                Cost vs. Value Report (Annual) - Tracks ROI for 22 home improvement
                projects across 150 U.S. markets
              </p>
              <a
                href="https://www.remodeling.hw.net/cost-vs-value/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                View Report <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="border-l-4 border-blue-500 pl-4">
              <h4 className="font-semibold text-sm mb-1">
                National Association of Realtors (NAR)
              </h4>
              <p className="text-sm text-gray-600 mb-2">
                Remodeling Impact Report - Surveys homeowners and agents on project appeal
                and value
              </p>
              <a
                href="https://www.nar.realtor/research-and-statistics/research-reports/remodeling-impact"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                View Report <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="border-l-4 border-blue-500 pl-4">
              <h4 className="font-semibold text-sm mb-1">Our Methodology</h4>
              <p className="text-sm text-gray-600">
                We aggregate ROI data from multiple sources and adjust for:
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
                <li>Regional cost differences</li>
                <li>Property type (SFH vs. Condo)</li>
                <li>Current market conditions</li>
                <li>Project urgency and timeline</li>
              </ul>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold text-sm mb-2">Important Caveats:</h4>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>ROI estimates assume quality work by licensed professionals</li>
                <li>Results vary by local market, neighborhood, and buyer preferences</li>
                <li>Timing matters - market conditions change quarterly</li>
                <li>Some improvements have higher emotional value than financial ROI</li>
                <li>Over-improving for your neighborhood can reduce ROI</li>
              </ul>
            </div>

            <div className="pt-4 border-t">
              <Button onClick={() => setShowSources(false)} className="w-full">
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}