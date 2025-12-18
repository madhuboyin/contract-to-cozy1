// apps/frontend/src/components/seller-prep/AgentInterviewGuide.tsx
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserCheck, CheckCircle2 } from "lucide-react";

const INTERVIEW_QUESTIONS = [
  {
    category: "Experience & Track Record",
    questions: [
      "How many homes have you sold in this neighborhood in the past year?",
      "What's your average days on market vs. the local average?",
      "What percentage of your listings sell at or above asking price?",
      "Can you provide references from recent seller clients?",
    ],
  },
  {
    category: "Marketing Strategy",
    questions: [
      "What's your marketing plan for my property specifically?",
      "Which listing platforms and portals will you use?",
      "How do you handle professional photography and staging?",
      "What's your social media and digital marketing strategy?",
    ],
  },
  {
    category: "Pricing & Valuation",
    questions: [
      "How did you arrive at your suggested listing price?",
      "What comparable sales did you use for your analysis?",
      "How do you handle price adjustments if needed?",
      "What's your strategy in the current market conditions?",
    ],
  },
  {
    category: "Communication & Process",
    questions: [
      "How often will you provide updates on showings and feedback?",
      "What's your preferred method of communication?",
      "How do you handle multiple offers?",
      "Who will be my primary contact (you or a team member)?",
    ],
  },
  {
    category: "Commission & Costs",
    questions: [
      "What's your commission rate and is it negotiable?",
      "What services are included in your commission?",
      "Are there any additional costs I should expect?",
      "What happens if my home doesn't sell?",
    ],
  },
];

const RED_FLAGS = [
  "Guarantees a specific sale price without market analysis",
  "Suggests listing significantly above market to 'test the waters'",
  "Reluctant to provide references or past client testimonials",
  "Poor communication during the interview process",
  "Unclear about their marketing strategy or seems generic",
  "Can't explain their commission structure clearly",
  "Hasn't researched your property or neighborhood beforehand",
];

export function AgentInterviewGuide() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-6 w-6 text-purple-600" />
          Agent Interview Guide
        </CardTitle>
        <CardDescription>
          Essential questions to ask when choosing a real estate agent
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Interview Questions */}
        <div className="space-y-5">
          {INTERVIEW_QUESTIONS.map((section, idx) => (
            <div key={idx} className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-medium">
                  {section.category}
                </Badge>
              </div>
              <ul className="space-y-2 ml-1">
                {section.questions.map((question, qIdx) => (
                  <li key={qIdx} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">{question}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Red Flags */}
        <div className="border-t pt-5">
          <h4 className="font-semibold text-sm text-red-800 mb-3">
            🚩 Red Flags to Watch For
          </h4>
          <ul className="space-y-2">
            {RED_FLAGS.map((flag, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <span className="text-red-600 mt-0.5">•</span>
                <span className="text-gray-700">{flag}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Tips */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-sm text-blue-900 mb-2">
            💡 Pro Tips
          </h4>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>• Interview at least 2-3 agents before deciding</li>
            <li>• Ask for their marketing materials and sample listings</li>
            <li>• Trust your instincts - you'll be working closely together</li>
            <li>• Don't choose solely based on who suggests the highest price</li>
            <li>• Verify their license status with your state's real estate board</li>
          </ul>
        </div>

        {/* Bottom disclaimer */}
        <p className="text-xs text-gray-500 border-t pt-4">
          This guide is for informational purposes only. Interview multiple agents
          and choose the one that best fits your needs and communication style.
        </p>
      </CardContent>
    </Card>
  );
}