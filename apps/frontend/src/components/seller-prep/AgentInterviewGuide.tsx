// apps/frontend/src/components/seller-prep/AgentInterviewGuide.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UserCheck, Plus, Trash2, Users, Star } from "lucide-react";
import { api } from "@/lib/api/client";
import { LeadCaptureModal } from "./LeadCaptureModal";

const CATEGORIES = [
  "Experience & Track Record",
  "Marketing Strategy",
  "Pricing & Valuation",
  "Communication",
  "Commission & Costs"
];

export function AgentInterviewGuide({ propertyId, interviews, onInterviewsChange }: any) {
  const [isComparing, setIsComparing] = useState(false);
  const [showLeadModal, setShowLeadModal] = useState(false);

  const handleAddAgent = () => {
    if (interviews.length >= 3) return;
    const newAgent = { id: `temp-${Date.now()}`, agentName: `Agent ${interviews.length + 1}`, notes: {}, totalScore: 0 };
    onInterviewsChange([...interviews, newAgent]);
  };

  const handleUpdateNote = (agentId: string, category: string, value: string) => {
    const updated = interviews.map((a: any) => 
      a.id === agentId ? { ...a, notes: { ...a.notes, [category]: value } } : a
    );
    onInterviewsChange(updated);
    // Debounced API call to api.upsertAgentInterview would go here
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Agent Comparison Tool</h3>
          <p className="text-sm text-muted-foreground">Compare up to 3 agents side-by-side.</p>
        </div>
        <div className="flex gap-2">
          {interviews.length < 3 && (
            <Button size="sm" variant="outline" onClick={handleAddAgent}>
              <Plus className="h-4 w-4 mr-2" /> Add Agent
            </Button>
          )}
          <Button size="sm" onClick={() => setIsComparing(!isComparing)}>
            {isComparing ? "Edit Notes" : "Compare Agents"}
          </Button>
        </div>
      </div>

      {!isComparing ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {interviews.map((agent: any) => (
            <Card key={agent.id}>
              <CardHeader className="pb-3">
                <Input 
                  value={agent.agentName} 
                  className="font-bold border-none p-0 focus-visible:ring-0 h-auto"
                  onChange={(e) => handleUpdateNote(agent.id, "name", e.target.value)}
                />
              </CardHeader>
              <CardContent className="space-y-4">
                {CATEGORIES.map(cat => (
                  <div key={cat} className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-gray-500">{cat}</label>
                    <Textarea 
                      placeholder={`Notes on ${cat.toLowerCase()}...`}
                      value={agent.notes[cat] || ""}
                      className="text-xs min-h-[60px]"
                      onChange={(e) => handleUpdateNote(agent.id, cat, e.target.value)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-4 border text-left w-1/4">Category</th>
                  {interviews.map((a: any) => (
                    <th key={a.id} className="p-4 border text-center">{a.agentName}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map(cat => (
                  <tr key={cat}>
                    <td className="p-4 border font-medium bg-gray-50/50">{cat}</td>
                    {interviews.map((a: any) => (
                      <td key={a.id} className="p-4 border text-gray-600">{a.notes[cat] || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card className="bg-purple-50 border-purple-100">
        <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Users className="h-10 w-10 text-purple-600" />
            <div>
              <h4 className="font-semibold text-purple-900">Let us find the right fit</h4>
              <p className="text-sm text-purple-800">Get matched with top-rated agents in your neighborhood.</p>
            </div>
          </div>
          <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => setShowLeadModal(true)}>
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