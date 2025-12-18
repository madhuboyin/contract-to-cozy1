// apps/frontend/src/components/seller-prep/AgentInterviewGuide.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Users, RotateCcw, Info } from "lucide-react";
import { LeadCaptureModal } from "./LeadCaptureModal";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const DEFAULT_QUESTIONS = [
  { id: "exp", label: "Experience", question: "Neighborhood sales last year", default: "5-10 sales (Local average)" },
  { id: "dom", label: "Speed", question: "Avg. days on market", default: "30 days (Market average)" },
  { id: "list", label: "Pricing", question: "List-to-sale price ratio", default: "98% (Standard performance)" },
  { id: "comm", label: "Cost", question: "Commission structure", default: "5-6% (Industry standard)" },
  { id: "mark", label: "Marketing", question: "Photography & Staging", default: "Professional photos included" },
];

export function AgentInterviewGuide({ propertyId, interviews, onInterviewsChange }: any) {
  const [isComparing, setIsComparing] = useState(false);
  const [showLeadModal, setShowLeadModal] = useState(false);

  const handleAddAgent = () => {
    if (interviews.length >= 3) return;
    const newAgent = { 
      id: `temp-${Date.now()}`, 
      agentName: `Agent ${interviews.length + 1}`, 
      notes: DEFAULT_QUESTIONS.reduce((acc, q) => ({ ...acc, [q.id]: q.default }), {}),
      isDefault: DEFAULT_QUESTIONS.reduce((acc, q) => ({ ...acc, [q.id]: true }), {})
    };
    onInterviewsChange([...interviews, newAgent]);
  };

  const handleUpdateNote = (agentId: string, questionId: string, value: string) => {
    onInterviewsChange(interviews.map((a: any) => 
      a.id === agentId ? { 
        ...a, 
        notes: { ...a.notes, [questionId]: value },
        isDefault: { ...a.isDefault, [questionId]: false } 
      } : a
    ));
  };

  const resetToDefault = (agentId: string, questionId: string) => {
    const q = DEFAULT_QUESTIONS.find(dq => dq.id === questionId);
    handleUpdateNote(agentId, questionId, q?.default || "");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Agent Comparison Matrix</h3>
          <p className="text-sm text-muted-foreground">Modify defaults based on your interview results.</p>
        </div>
        <div className="flex gap-2">
          {interviews.length < 3 && (
            <Button size="sm" variant="outline" onClick={handleAddAgent}>
              <Plus className="h-4 w-4 mr-1" /> Add Agent
            </Button>
          )}
          <Button size="sm" onClick={() => setIsComparing(!isComparing)} variant={isComparing ? "outline" : "default"}>
            {isComparing ? "Edit Mode" : "Side-by-Side View"}
          </Button>
        </div>
      </div>

      {!isComparing ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {interviews.map((agent: any) => (
            <Card key={agent.id} className="border-t-4 border-t-purple-500">
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                <Input 
                  value={agent.agentName} 
                  className="font-bold border-none p-0 focus-visible:ring-0 h-auto text-base"
                  onChange={(e) => handleUpdateNote(agent.id, "name", e.target.value)}
                />
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {DEFAULT_QUESTIONS.map(q => (
                  <div key={q.id} className="group relative space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase font-bold text-muted-foreground">{q.label}</label>
                      {!agent.isDefault[q.id] && (
                        <button onClick={() => resetToDefault(agent.id, q.id)} className="text-[10px] text-blue-600 hover:underline flex items-center gap-1">
                          <RotateCcw className="h-3 w-3" /> Reset
                        </button>
                      )}
                    </div>
                    <Textarea 
                      value={agent.notes[q.id]}
                      onChange={(e) => handleUpdateNote(agent.id, q.id, e.target.value)}
                      className={`text-xs min-h-[50px] transition-colors ${agent.isDefault[q.id] ? 'bg-gray-50/50 italic text-muted-foreground' : 'bg-white font-medium'}`}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="p-4 border text-left w-1/4 font-semibold">Criteria</th>
                  {interviews.map((a: any) => (
                    <th key={a.id} className="p-4 border text-center font-bold text-purple-700">{a.agentName}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DEFAULT_QUESTIONS.map(q => (
                  <tr key={q.id} className="hover:bg-muted/20 transition-colors">
                    <td className="p-4 border font-medium bg-muted/10">
                      <div className="flex flex-col">
                        <span>{q.label}</span>
                        <span className="text-[10px] text-muted-foreground font-normal">{q.question}</span>
                      </div>
                    </td>
                    {interviews.map((a: any) => (
                      <td key={a.id} className={`p-4 border text-center ${a.isDefault[q.id] ? 'italic text-muted-foreground bg-gray-50/30' : 'font-medium'}`}>
                        {a.notes[q.id]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* CTA Section */}
      <Card className="bg-purple-50 border-purple-200">
        <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 text-center md:text-left">
            <div className="bg-purple-100 p-3 rounded-full"><Users className="h-6 w-6 text-purple-600" /></div>
            <div>
              <h4 className="font-bold text-purple-900">Compare verified local agents</h4>
              <p className="text-sm text-purple-800">We've identified 3 agents who specialize in properties like yours.</p>
            </div>
          </div>
          <Button className="bg-purple-600 hover:bg-purple-700 shadow-lg px-8" onClick={() => setShowLeadModal(true)}>
            Find Recommended Agents
          </Button>
        </CardContent>
      </Card>

      <LeadCaptureModal open={showLeadModal} onClose={() => setShowLeadModal(false)} propertyId={propertyId} leadType="AGENT" />
    </div>
  );
}