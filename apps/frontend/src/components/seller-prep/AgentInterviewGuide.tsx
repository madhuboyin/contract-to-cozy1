// apps/frontend/src/components/seller-prep/AgentInterviewGuide.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Users, RotateCcw } from "lucide-react";
import { LeadCaptureModal } from "./LeadCaptureModal";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/use-toast";

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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mutation to handle backend deletion
  const deleteMutation = useMutation({
    mutationFn: (interviewId: string) => api.deleteAgentInterview(interviewId),
    onSuccess: () => {
      toast({ title: "Removed", description: "Agent removed from comparison." });
      queryClient.invalidateQueries({ queryKey: ["seller-prep", propertyId] });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete agent. Please try again." });
    }
  });

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

  // FIXED: Implementation of the delete handler
  const handleDeleteAgent = (agentId: string) => {
    // If it's a persisted agent (not a temp one), call the backend
    if (!agentId.startsWith('temp-')) {
      deleteMutation.mutate(agentId);
    }
    
    // Update local state immediately for a responsive UI
    const updatedInterviews = interviews.filter((a: any) => a.id !== agentId);
    onInterviewsChange(updatedInterviews);
  };

  const resetToDefault = (agentId: string, questionId: string) => {
    const q = DEFAULT_QUESTIONS.find(dq => dq.id === questionId);
    handleUpdateNote(agentId, questionId, q?.default || "");
    
    onInterviewsChange(interviews.map((a: any) => 
      a.id === agentId ? { 
        ...a, 
        isDefault: { ...a.isDefault, [questionId]: true } 
      } : a
    ));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Agent Comparison Matrix</h3>
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
            <Card key={agent.id} className="border-t-4 border-t-purple-500 relative">
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                <Input 
                  value={agent.agentName} 
                  className="font-bold border-none p-0 focus-visible:ring-0 h-auto text-base bg-transparent"
                  onChange={(e) => handleUpdateNote(agent.id, "name", e.target.value)}
                />
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-gray-400 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={() => handleDeleteAgent(agent.id)}
                  title="Remove Agent"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {DEFAULT_QUESTIONS.map(q => (
                  <div key={q.id} className="group relative space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase font-bold text-muted-foreground">{q.label}</label>
                      {agent.isDefault && !agent.isDefault[q.id] && (
                        <button 
                          onClick={() => resetToDefault(agent.id, q.id)} 
                          className="text-[10px] text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <RotateCcw className="h-3 w-3" /> Reset
                        </button>
                      )}
                    </div>
                    <Textarea 
                      value={agent.notes[q.id]}
                      onChange={(e) => handleUpdateNote(agent.id, q.id, e.target.value)}
                      className={`text-xs min-h-[50px] transition-colors resize-none ${
                        agent.isDefault?.[q.id] ? 'bg-gray-50/50 italic text-muted-foreground' : 'bg-white font-medium text-gray-900'
                      }`}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden border-purple-100">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="p-4 border text-left w-1/4 font-semibold text-gray-700">Criteria</th>
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
                        <span className="text-gray-900">{q.label}</span>
                        <span className="text-[10px] text-muted-foreground font-normal">{q.question}</span>
                      </div>
                    </td>
                    {interviews.map((a: any) => (
                      <td key={a.id} className={`p-4 border text-center ${a.isDefault?.[q.id] ? 'italic text-muted-foreground bg-gray-50/30' : 'font-medium text-gray-900'}`}>
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
              <p className="text-sm text-purple-800 max-w-md">We've identified top agents who specialize in properties like yours to help you get the best price.</p>
            </div>
          </div>
          <Button className="bg-purple-600 hover:bg-purple-700 shadow-lg px-8 transition-all" onClick={() => setShowLeadModal(true)}>
            Find Recommended Agents
          </Button>
        </CardContent>
      </Card>

      <LeadCaptureModal 
        open={showLeadModal} 
        onClose={() => setShowLeadModal(false)} 
        propertyId={propertyId} 
        leadType="AGENT" 
      />
    </div>
  );
}