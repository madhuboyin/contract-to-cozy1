// Home Actions (FRD 1.398-1.400). FOCUSED_* are generated from the real buildFocusedHomeActionGuidance and parsed by AskPresentationBlockSchema;
// LIST_* are PRIORITY_LIST blocks shaped to the schema (filters carry whole-feed counts). Regenerate from the producers; do not hand-edit.
export const HOME_ACTIONS_FOCUSED = {
 "contributor": [
  {
   "type": "SUMMARY",
   "id": "focused-home-action-summary",
   "title": "Chimney cleaning and inspection",
   "body": "Fill cracks in driveway and apply sealant if needed.",
   "tone": "DEFAULT",
   "actions": []
  },
  {
   "type": "GROUPED_LIST",
   "id": "focused-home-action-guidance",
   "title": "What to do next",
   "description": "Guidance for the Home Action you selected.",
   "sections": [
    {
     "id": "next-step",
     "title": "Recommended next step",
     "count": 1,
     "items": [
      {
       "id": "operational-work:work-1",
       "title": "Chimney cleaning and inspection",
       "description": "Complete the task and record the outcome.",
       "meta": [
        "Due Aug 16, 2026",
        "high confidence"
       ],
       "status": "OPEN",
       "href": null
      }
     ]
    },
    {
     "id": "why-it-matters",
     "title": "Why this matters",
     "count": 1,
     "items": [
      {
       "id": "operational-work:work-1-why",
       "title": "Chimney cleaning and inspection",
       "description": "Extended heat can increase household health and cooling-system risk.",
       "meta": [],
       "status": null,
       "href": null
      }
     ]
    },
    {
     "id": "work-evidence",
     "title": "Evidence",
     "count": 2,
     "items": [
      {
       "id": "operational-work:work-1-evidence-e1",
       "title": "Chimney sweep invoice.pdf",
       "description": null,
       "meta": [
        "Document",
        "Oct 20, 2026"
       ],
       "status": "Awaiting review",
       "href": null
      },
      {
       "id": "operational-work:work-1-evidence-e2",
       "title": "Annual inspection",
       "description": null,
       "meta": [
        "Timeline event",
        "Sep 2, 2026"
       ],
       "status": "Verified",
       "href": null
      },
      {
       "id": "work-1",
       "title": "Add a photo or document",
       "description": "Add a photo or document that shows what was done. It is reviewed before it is attached.",
       "meta": [],
       "status": null,
       "href": null,
       "entityType": "OPERATIONAL_WORK_ITEM",
       "evidenceTarget": true,
       "actions": [
        {
         "id": "home-action-attach-existing-operational-work:work-1",
         "label": "Attach an existing record",
         "message": "Attach an existing record as evidence for this work item.",
         "style": "SECONDARY",
         "interactionType": "MUTATE_RECORD",
         "operationId": "HOME_WORK_ITEM_COMMAND",
         "entityType": "OPERATIONAL_WORK_ITEM",
         "entityId": "work-1"
        },
        {
         "id": "home-action-remove-evidence-operational-work:work-1",
         "label": "Remove evidence",
         "message": "Remove evidence from this work item.",
         "style": "QUIET",
         "interactionType": "MUTATE_RECORD",
         "operationId": "HOME_WORK_ITEM_COMMAND",
         "entityType": "OPERATIONAL_WORK_ITEM",
         "entityId": "work-1"
        }
       ]
      }
     ]
    }
   ],
   "actions": [
    {
     "id": "home-action-complete-operational-work:work-1",
     "label": "Mark complete",
     "interactionType": "START_WORKFLOW",
     "message": "Complete this work item.",
     "operationId": "OPERATIONAL_WORK_UPDATE",
     "entityType": "WORK_ITEM",
     "entityId": "work-1",
     "style": "PRIMARY"
    },
    {
     "id": "home-action-snooze-operational-work:work-1",
     "label": "Snooze reminders",
     "interactionType": "START_WORKFLOW",
     "message": "Snooze this work item.",
     "operationId": "OPERATIONAL_WORK_UPDATE",
     "entityType": "WORK_ITEM",
     "entityId": "work-1",
     "style": "SECONDARY"
    },
    {
     "id": "home-action-reschedule-operational-work:work-1",
     "label": "Change due date",
     "interactionType": "START_WORKFLOW",
     "message": "Change the due date of this work item.",
     "operationId": "HOME_WORK_ITEM_COMMAND",
     "entityType": "OPERATIONAL_WORK_ITEM",
     "entityId": "work-1",
     "style": "SECONDARY"
    }
   ],
   "filters": []
  },
  {
   "type": "EVIDENCE",
   "id": "focused-home-action-evidence",
   "title": "Evidence for this guidance",
   "items": [
    {
     "label": "Official heat alert",
     "source": "Weather service",
     "observedAt": "2026-08-14T12:00:00.000Z"
    }
   ]
  },
  {
   "type": "BOUNDARY",
   "id": "focused-home-action-boundary",
   "title": "Review before acting",
   "body": "Follow official heat guidance if conditions worsen.",
   "severity": "INFO",
   "suggestions": []
  }
 ],
 "viewer": [
  {
   "type": "SUMMARY",
   "id": "focused-home-action-summary",
   "title": "Chimney cleaning and inspection",
   "body": "Fill cracks in driveway and apply sealant if needed.",
   "tone": "DEFAULT",
   "actions": []
  },
  {
   "type": "GROUPED_LIST",
   "id": "focused-home-action-guidance",
   "title": "What to do next",
   "description": "Guidance for the Home Action you selected.",
   "sections": [
    {
     "id": "next-step",
     "title": "Recommended next step",
     "count": 1,
     "items": [
      {
       "id": "operational-work:work-1",
       "title": "Chimney cleaning and inspection",
       "description": "Complete the task and record the outcome.",
       "meta": [
        "Due Aug 16, 2026",
        "high confidence"
       ],
       "status": "OPEN",
       "href": null
      }
     ]
    },
    {
     "id": "why-it-matters",
     "title": "Why this matters",
     "count": 1,
     "items": [
      {
       "id": "operational-work:work-1-why",
       "title": "Chimney cleaning and inspection",
       "description": "Extended heat can increase household health and cooling-system risk.",
       "meta": [],
       "status": null,
       "href": null
      }
     ]
    },
    {
     "id": "work-evidence",
     "title": "Evidence",
     "count": 2,
     "items": [
      {
       "id": "operational-work:work-1-evidence-e1",
       "title": "Chimney sweep invoice.pdf",
       "description": null,
       "meta": [
        "Document",
        "Oct 20, 2026"
       ],
       "status": "Awaiting review",
       "href": null
      },
      {
       "id": "operational-work:work-1-evidence-e2",
       "title": "Annual inspection",
       "description": null,
       "meta": [
        "Timeline event",
        "Sep 2, 2026"
       ],
       "status": "Verified",
       "href": null
      }
     ]
    }
   ],
   "actions": [
    {
     "id": "home-action-primary-operational-work:work-1",
     "label": "Open work",
     "href": "/dashboard/properties/property-1/home-operations?focusWorkItemId=work-1&openManage=1",
     "style": "PRIMARY"
    }
   ],
   "filters": []
  },
  {
   "type": "EVIDENCE",
   "id": "focused-home-action-evidence",
   "title": "Evidence for this guidance",
   "items": [
    {
     "label": "Official heat alert",
     "source": "Weather service",
     "observedAt": "2026-08-14T12:00:00.000Z"
    }
   ]
  },
  {
   "type": "BOUNDARY",
   "id": "focused-home-action-boundary",
   "title": "Review before acting",
   "body": "Follow official heat guidance if conditions worsen.",
   "severity": "INFO",
   "suggestions": []
  }
 ],
 "regulated": [
  {
   "type": "SUMMARY",
   "id": "focused-home-action-summary",
   "title": "Chimney cleaning and inspection",
   "body": "Fill cracks in driveway and apply sealant if needed.",
   "tone": "DEFAULT",
   "actions": []
  },
  {
   "type": "GROUPED_LIST",
   "id": "focused-home-action-guidance",
   "title": "What to do next",
   "description": "Guidance for the Home Action you selected.",
   "sections": [
    {
     "id": "next-step",
     "title": "Recommended next step",
     "count": 1,
     "items": [
      {
       "id": "operational-work:work-1",
       "title": "Chimney cleaning and inspection",
       "description": "Complete the task and record the outcome.",
       "meta": [
        "Due Aug 16, 2026",
        "high confidence"
       ],
       "status": "OPEN",
       "href": null
      }
     ]
    },
    {
     "id": "why-it-matters",
     "title": "Why this matters",
     "count": 1,
     "items": [
      {
       "id": "operational-work:work-1-why",
       "title": "Chimney cleaning and inspection",
       "description": "Extended heat can increase household health and cooling-system risk.",
       "meta": [],
       "status": null,
       "href": null
      }
     ]
    },
    {
     "id": "work-evidence",
     "title": "Evidence",
     "count": 0,
     "items": [
      {
       "id": "work-1",
       "title": "Add a photo or document",
       "description": "Domain completion record or document evidence; policy/claim linkage where applicable. Evidence you add here is reviewed by the record that governs this work; it does not close it.",
       "meta": [],
       "status": null,
       "href": null,
       "entityType": "OPERATIONAL_WORK_ITEM",
       "evidenceTarget": true,
       "actions": [
        {
         "id": "home-action-submit-evidence-operational-work:work-1",
         "label": "Submit completion evidence",
         "message": "Submit completion evidence for this work item.",
         "style": "PRIMARY",
         "interactionType": "MUTATE_RECORD",
         "operationId": "HOME_WORK_ITEM_COMMAND",
         "entityType": "OPERATIONAL_WORK_ITEM",
         "entityId": "work-1"
        }
       ]
      }
     ]
    }
   ],
   "actions": [
    {
     "id": "home-action-snooze-operational-work:work-1",
     "label": "Snooze reminders",
     "interactionType": "START_WORKFLOW",
     "message": "Snooze this work item.",
     "operationId": "OPERATIONAL_WORK_UPDATE",
     "entityType": "WORK_ITEM",
     "entityId": "work-1",
     "style": "PRIMARY"
    },
    {
     "id": "home-action-reschedule-operational-work:work-1",
     "label": "Change due date",
     "interactionType": "START_WORKFLOW",
     "message": "Change the due date of this work item.",
     "operationId": "HOME_WORK_ITEM_COMMAND",
     "entityType": "OPERATIONAL_WORK_ITEM",
     "entityId": "work-1",
     "style": "SECONDARY"
    }
   ],
   "filters": []
  },
  {
   "type": "EVIDENCE",
   "id": "focused-home-action-evidence",
   "title": "Evidence for this guidance",
   "items": [
    {
     "label": "Official heat alert",
     "source": "Weather service",
     "observedAt": "2026-08-14T12:00:00.000Z"
    }
   ]
  },
  {
   "type": "BOUNDARY",
   "id": "focused-home-action-boundary",
   "title": "Review before acting",
   "body": "Follow official heat guidance if conditions worsen.",
   "severity": "CAUTION",
   "suggestions": []
  }
 ]
} as const;
export const HOME_ACTIONS_LIST = {
 "all": [
  {
   "type": "SUMMARY",
   "id": "home-actions-summary",
   "title": "9 Home Actions to review; the top 6 are shown.",
   "body": "Counts come from the whole feed.",
   "tone": "CAUTION",
   "actions": [],
   "chips": [
    {
     "label": "1 now",
     "tone": "CRITICAL"
    },
    {
     "label": "2 soon",
     "tone": "CAUTION"
    },
    {
     "label": "3 to plan",
     "tone": "DEFAULT"
    },
    {
     "label": "3 to consider",
     "tone": "DEFAULT"
    }
   ],
   "headline": "9 Home Actions to review; the top 6 are shown.",
   "supportLine": "Start with the highest-ranked item; each review stays in Ask."
  },
  {
   "type": "PRIORITY_LIST",
   "id": "home-actions-priority-list",
   "title": "What matters now",
   "propertyId": "acceptance-home",
   "rankingPolicyVersion": "priority-list-policy-v1",
   "generatedAt": "2026-10-21T12:00:00.000Z",
   "sourceFreshnessAt": null,
   "items": [
    {
     "homeActionId": "a1",
     "title": "Chimney cleaning and inspection",
     "consumerPriority": "DO_NOW",
     "rawPriority": "NOW",
     "comparativeReasonCodes": [
      "HIGHER_URGENCY"
     ],
     "confidenceLabel": "HIGH",
     "deadlineAt": "2026-11-03T00:00:00.000Z",
     "dependencyRefs": [],
     "cta": null,
     "inlineLaunch": {
      "interactionType": "CONVERSATION_CONTINUE",
      "operationId": "HOME_ACTIONS",
      "message": "What should I do next for \u201cChimney cleaning and inspection\u201d?"
     },
     "watchState": null,
     "suppressed": false,
     "completed": false,
     "unavailable": false,
     "stale": false
    },
    {
     "homeActionId": "a2",
     "title": "Replace the HVAC filter",
     "consumerPriority": "PLAN_SOON",
     "rawPriority": "SOON",
     "comparativeReasonCodes": [],
     "confidenceLabel": "HIGH",
     "deadlineAt": null,
     "dependencyRefs": [],
     "cta": null,
     "inlineLaunch": {
      "interactionType": "CONVERSATION_CONTINUE",
      "operationId": "HOME_ACTIONS",
      "message": "What should I do next for \u201cReplace the HVAC filter\u201d?"
     },
     "watchState": null,
     "suppressed": false,
     "completed": false,
     "unavailable": false,
     "stale": false
    },
    {
     "homeActionId": "a3",
     "title": "Service the water heater",
     "consumerPriority": "PLAN_SOON",
     "rawPriority": "SOON",
     "comparativeReasonCodes": [],
     "confidenceLabel": "HIGH",
     "deadlineAt": null,
     "dependencyRefs": [],
     "cta": null,
     "inlineLaunch": {
      "interactionType": "CONVERSATION_CONTINUE",
      "operationId": "HOME_ACTIONS",
      "message": "What should I do next for \u201cService the water heater\u201d?"
     },
     "watchState": null,
     "suppressed": false,
     "completed": false,
     "unavailable": false,
     "stale": false
    },
    {
     "homeActionId": "a4",
     "title": "Budget for gutter replacement",
     "consumerPriority": "WATCH",
     "rawPriority": "PLAN",
     "comparativeReasonCodes": [],
     "confidenceLabel": "HIGH",
     "deadlineAt": null,
     "dependencyRefs": [],
     "cta": null,
     "inlineLaunch": {
      "interactionType": "CONVERSATION_CONTINUE",
      "operationId": "HOME_ACTIONS",
      "message": "What should I do next for \u201cBudget for gutter replacement\u201d?"
     },
     "watchState": null,
     "suppressed": false,
     "completed": false,
     "unavailable": false,
     "stale": false
    },
    {
     "homeActionId": "a5",
     "title": "Consider replacing the water heater",
     "consumerPriority": "WATCH",
     "rawPriority": "CONSIDER",
     "comparativeReasonCodes": [],
     "confidenceLabel": "HIGH",
     "deadlineAt": null,
     "dependencyRefs": [],
     "cta": null,
     "inlineLaunch": {
      "interactionType": "CONVERSATION_CONTINUE",
      "operationId": "HOME_ACTIONS",
      "message": "What should I do next for \u201cConsider replacing the water heater\u201d?"
     },
     "watchState": null,
     "suppressed": false,
     "completed": false,
     "unavailable": false,
     "stale": false
    },
    {
     "homeActionId": "a6",
     "title": "Consider upgrading attic insulation",
     "consumerPriority": "OPTIONAL",
     "rawPriority": "CONSIDER",
     "comparativeReasonCodes": [],
     "confidenceLabel": "HIGH",
     "deadlineAt": null,
     "dependencyRefs": [],
     "cta": null,
     "inlineLaunch": {
      "interactionType": "CONVERSATION_CONTINUE",
      "operationId": "HOME_ACTIONS",
      "message": "What should I do next for \u201cConsider upgrading attic insulation\u201d?"
     },
     "watchState": null,
     "suppressed": false,
     "completed": false,
     "unavailable": false,
     "stale": false
    }
   ],
   "truncated": true,
   "filters": [
    {
     "id": "all",
     "label": "All",
     "count": 9,
     "message": "What needs my attention around the home?",
     "active": true
    },
    {
     "id": "now",
     "label": "Now",
     "count": 1,
     "message": "What needs my attention right now?",
     "active": false
    },
    {
     "id": "soon",
     "label": "Soon",
     "count": 2,
     "message": "What home actions are due soon?",
     "active": false
    },
    {
     "id": "plan",
     "label": "Plan",
     "count": 3,
     "message": "What should I plan for around the home?",
     "active": false
    },
    {
     "id": "consider",
     "label": "Consider",
     "count": 3,
     "message": "What home actions are worth a look to consider?",
     "active": false
    }
   ]
  }
 ],
 "consider": [
  {
   "type": "SUMMARY",
   "id": "home-actions-summary",
   "title": "3 Home Actions are ready to review.",
   "body": "Counts come from the whole feed.",
   "tone": "CAUTION",
   "actions": [],
   "chips": [
    {
     "label": "1 now",
     "tone": "CRITICAL"
    },
    {
     "label": "2 soon",
     "tone": "CAUTION"
    },
    {
     "label": "3 to plan",
     "tone": "DEFAULT"
    },
    {
     "label": "3 to consider",
     "tone": "DEFAULT"
    }
   ],
   "headline": "3 Home Actions are ready to review.",
   "supportLine": "Start with the highest-ranked item; each review stays in Ask."
  },
  {
   "type": "PRIORITY_LIST",
   "id": "home-actions-priority-list",
   "title": "What matters now",
   "propertyId": "acceptance-home",
   "rankingPolicyVersion": "priority-list-policy-v1",
   "generatedAt": "2026-10-21T12:00:00.000Z",
   "sourceFreshnessAt": null,
   "items": [
    {
     "homeActionId": "a5",
     "title": "Consider replacing the water heater",
     "consumerPriority": "WATCH",
     "rawPriority": "CONSIDER",
     "comparativeReasonCodes": [],
     "confidenceLabel": "HIGH",
     "deadlineAt": null,
     "dependencyRefs": [],
     "cta": null,
     "inlineLaunch": {
      "interactionType": "CONVERSATION_CONTINUE",
      "operationId": "HOME_ACTIONS",
      "message": "What should I do next for \u201cConsider replacing the water heater\u201d?"
     },
     "watchState": null,
     "suppressed": false,
     "completed": false,
     "unavailable": false,
     "stale": false
    },
    {
     "homeActionId": "a6",
     "title": "Consider upgrading attic insulation",
     "consumerPriority": "OPTIONAL",
     "rawPriority": "CONSIDER",
     "comparativeReasonCodes": [],
     "confidenceLabel": "HIGH",
     "deadlineAt": null,
     "dependencyRefs": [],
     "cta": null,
     "inlineLaunch": {
      "interactionType": "CONVERSATION_CONTINUE",
      "operationId": "HOME_ACTIONS",
      "message": "What should I do next for \u201cConsider upgrading attic insulation\u201d?"
     },
     "watchState": null,
     "suppressed": false,
     "completed": false,
     "unavailable": false,
     "stale": false
    }
   ],
   "truncated": true,
   "filters": [
    {
     "id": "all",
     "label": "All",
     "count": 9,
     "message": "What needs my attention around the home?",
     "active": false
    },
    {
     "id": "now",
     "label": "Now",
     "count": 1,
     "message": "What needs my attention right now?",
     "active": false
    },
    {
     "id": "soon",
     "label": "Soon",
     "count": 2,
     "message": "What home actions are due soon?",
     "active": false
    },
    {
     "id": "plan",
     "label": "Plan",
     "count": 3,
     "message": "What should I plan for around the home?",
     "active": false
    },
    {
     "id": "consider",
     "label": "Consider",
     "count": 3,
     "message": "What home actions are worth a look to consider?",
     "active": true
    }
   ]
  }
 ]
} as const;
