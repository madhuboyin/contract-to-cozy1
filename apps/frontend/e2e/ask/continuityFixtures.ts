// Generated from the real digitalWillFromView producer (FRD v1.393): an empty plan (the guided starter) and an established, ready plan.
// Regenerate by calling the producer; do not hand-edit the shapes.
export const CONTINUITY_BLOCKS = {
 "starter": [
  {
   "type": "SUMMARY",
   "id": "digital-will-summary",
   "title": "Home Continuity Plan",
   "body": "Home Digital Will \u00b7 Draft, with 0 entries across 8 sections and 0 trusted contacts. Not reviewed yet.",
   "tone": "CAUTION",
   "headline": "Home Continuity Plan",
   "supportLine": "Home Digital Will \u00b7 0 entries across 8 sections and 0 trusted contacts.",
   "chips": [
    {
     "label": "Draft",
     "tone": "DEFAULT"
    },
    {
     "label": "Not reviewed yet",
     "tone": "CAUTION"
    },
    {
     "label": "0 of 3 handoff requirements met",
     "tone": "CAUTION"
    }
   ],
   "actions": []
  },
  {
   "type": "PROGRESS",
   "id": "digital-will-progress",
   "title": "Ready to hand off",
   "description": "Counts the three things the plan needs before someone else can take over: an emergency instruction, a primary trusted contact, and a way to reach that contact. Other entries are not counted.",
   "percent": 0,
   "basis": "0 of 3 handoff requirements met",
   "metrics": [
    {
     "label": "Met",
     "value": "0",
     "tone": "DEFAULT"
    },
    {
     "label": "Missing",
     "value": "3",
     "tone": "CAUTION"
    },
    {
     "label": "Entries",
     "value": "0",
     "tone": "DEFAULT"
    }
   ],
   "nextSteps": [
    {
     "id": "s-emergency",
     "title": "Add an emergency instruction.",
     "description": "Handoff requirement not met yet",
     "meta": [],
     "status": "MISSING",
     "href": null,
     "entityType": "HOME_DIGITAL_WILL_SECTION",
     "actions": [
      {
       "id": "ENTRY_CREATE",
       "label": "Add emergency instruction",
       "interactionType": "MUTATE_RECORD",
       "message": "Add an emergency instruction to my home continuity plan",
       "operationId": "HOME_DIGITAL_WILL_CREATE",
       "style": "PRIMARY"
      }
     ]
    },
    {
     "id": "w1",
     "title": "Choose a primary trusted contact.",
     "description": "Handoff requirement not met yet",
     "meta": [],
     "status": "MISSING",
     "href": null,
     "entityType": "HOME_DIGITAL_WILL",
     "actions": [
      {
       "id": "CONTACT_CREATE",
       "label": "Add trusted contact",
       "interactionType": "MUTATE_RECORD",
       "message": "Add a trusted contact to my home continuity plan",
       "operationId": "HOME_DIGITAL_WILL_CREATE",
       "style": "PRIMARY"
      }
     ]
    },
    {
     "id": "w1",
     "title": "Add an email or phone number for the primary contact.",
     "description": "Waiting for a primary trusted contact",
     "meta": [],
     "status": "WAITING",
     "href": null,
     "entityType": "HOME_DIGITAL_WILL",
     "actions": []
    }
   ],
   "actions": []
  },
  {
   "type": "GROUPED_LIST",
   "filters": [],
   "id": "digital-will-items",
   "title": "What the plan holds",
   "description": "Entry titles by section and who can see the plan. Entry details are not shown here.",
   "sections": [
    {
     "id": "digital-will-section-s-emergency",
     "title": "Emergency Instructions",
     "count": 0,
     "items": [
      {
       "id": "s-emergency",
       "title": "Manage section",
       "meta": [
        "Enabled",
        "type:EMERGENCY"
       ],
       "status": "ENABLED",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_SECTION",
       "actions": [
        {
         "id": "ENTRY_CREATE",
         "label": "Add entry",
         "interactionType": "MUTATE_RECORD",
         "message": "Add an entry to this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "SECTION_EDIT",
         "label": "Edit section",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_UP",
         "label": "Move up",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section up",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_DOWN",
         "label": "Move down",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section down",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_DELETE",
         "label": "Delete section",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      }
     ]
    },
    {
     "id": "digital-will-section-s-critical",
     "title": "Critical Information",
     "count": 0,
     "items": [
      {
       "id": "s-critical",
       "title": "Manage section",
       "meta": [
        "Enabled",
        "type:CRITICAL_INFO"
       ],
       "status": "ENABLED",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_SECTION",
       "actions": [
        {
         "id": "ENTRY_CREATE",
         "label": "Add entry",
         "interactionType": "MUTATE_RECORD",
         "message": "Add an entry to this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "SECTION_EDIT",
         "label": "Edit section",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_UP",
         "label": "Move up",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section up",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_DOWN",
         "label": "Move down",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section down",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_DELETE",
         "label": "Delete section",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      }
     ]
    },
    {
     "id": "digital-will-section-s-contractors",
     "title": "Preferred Contractors",
     "count": 0,
     "items": [
      {
       "id": "s-contractors",
       "title": "Manage section",
       "meta": [
        "Enabled",
        "type:CONTRACTORS"
       ],
       "status": "ENABLED",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_SECTION",
       "actions": [
        {
         "id": "ENTRY_CREATE",
         "label": "Add entry",
         "interactionType": "MUTATE_RECORD",
         "message": "Add an entry to this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "SECTION_EDIT",
         "label": "Edit section",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_UP",
         "label": "Move up",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section up",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_DOWN",
         "label": "Move down",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section down",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_DELETE",
         "label": "Delete section",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      }
     ]
    },
    {
     "id": "digital-will-section-s-maint",
     "title": "Maintenance Knowledge",
     "count": 0,
     "items": [
      {
       "id": "s-maint",
       "title": "Manage section",
       "meta": [
        "Enabled",
        "type:MAINTENANCE_KNOWLEDGE"
       ],
       "status": "ENABLED",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_SECTION",
       "actions": [
        {
         "id": "ENTRY_CREATE",
         "label": "Add entry",
         "interactionType": "MUTATE_RECORD",
         "message": "Add an entry to this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "SECTION_EDIT",
         "label": "Edit section",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_UP",
         "label": "Move up",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section up",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_DOWN",
         "label": "Move down",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section down",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_DELETE",
         "label": "Delete section",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      }
     ]
    },
    {
     "id": "digital-will-section-s-utilities",
     "title": "Utilities",
     "count": 0,
     "items": [
      {
       "id": "s-utilities",
       "title": "Manage section",
       "meta": [
        "Enabled",
        "type:UTILITIES"
       ],
       "status": "ENABLED",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_SECTION",
       "actions": [
        {
         "id": "ENTRY_CREATE",
         "label": "Add entry",
         "interactionType": "MUTATE_RECORD",
         "message": "Add an entry to this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "SECTION_EDIT",
         "label": "Edit section",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_UP",
         "label": "Move up",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section up",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_DOWN",
         "label": "Move down",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section down",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_DELETE",
         "label": "Delete section",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      }
     ]
    },
    {
     "id": "digital-will-section-s-insurance",
     "title": "Insurance Notes",
     "count": 0,
     "items": [
      {
       "id": "s-insurance",
       "title": "Manage section",
       "meta": [
        "Enabled",
        "type:INSURANCE"
       ],
       "status": "ENABLED",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_SECTION",
       "actions": [
        {
         "id": "ENTRY_CREATE",
         "label": "Add entry",
         "interactionType": "MUTATE_RECORD",
         "message": "Add an entry to this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "SECTION_EDIT",
         "label": "Edit section",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_UP",
         "label": "Move up",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section up",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_DOWN",
         "label": "Move down",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section down",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_DELETE",
         "label": "Delete section",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      }
     ]
    },
    {
     "id": "digital-will-section-s-rules",
     "title": "House Rules",
     "count": 0,
     "items": [
      {
       "id": "s-rules",
       "title": "Manage section",
       "meta": [
        "Enabled",
        "type:HOUSE_RULES"
       ],
       "status": "ENABLED",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_SECTION",
       "actions": [
        {
         "id": "ENTRY_CREATE",
         "label": "Add entry",
         "interactionType": "MUTATE_RECORD",
         "message": "Add an entry to this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "SECTION_EDIT",
         "label": "Edit section",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_UP",
         "label": "Move up",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section up",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_DOWN",
         "label": "Move down",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section down",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_DELETE",
         "label": "Delete section",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      }
     ]
    },
    {
     "id": "digital-will-section-s-general",
     "title": "General Notes",
     "count": 0,
     "items": [
      {
       "id": "s-general",
       "title": "Manage section",
       "meta": [
        "Enabled",
        "type:GENERAL_NOTES"
       ],
       "status": "ENABLED",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_SECTION",
       "actions": [
        {
         "id": "ENTRY_CREATE",
         "label": "Add entry",
         "interactionType": "MUTATE_RECORD",
         "message": "Add an entry to this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "SECTION_EDIT",
         "label": "Edit section",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_UP",
         "label": "Move up",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section up",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_DOWN",
         "label": "Move down",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section down",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_DELETE",
         "label": "Delete section",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      }
     ]
    }
   ],
   "collection": {
    "sourceTotal": 8,
    "fetchedCount": 8,
    "deliveredCount": 8,
    "nextPageAvailable": false,
    "deliveryTruncated": false
   },
   "actions": [
    {
     "id": "home-continuity-emergency",
     "label": "Emergency view",
     "interactionType": "START_WORKFLOW",
     "message": "Open my home continuity plan emergency view",
     "operationId": "HOME_DIGITAL_WILL_CREATE",
     "entityType": "HOME_DIGITAL_WILL_EMERGENCY",
     "entityId": "w1",
     "style": "SECONDARY"
    },
    {
     "id": "home-continuity-metadata",
     "label": "Edit details",
     "interactionType": "START_WORKFLOW",
     "message": "Edit my home continuity plan details",
     "operationId": "HOME_DIGITAL_WILL_CREATE",
     "entityType": "HOME_DIGITAL_WILL_METADATA",
     "entityId": "w1",
     "style": "SECONDARY"
    }
   ]
  },
  {
   "type": "BOUNDARY",
   "id": "digital-will-boundary",
   "title": "A home knowledge plan, not a legal will",
   "body": "Not a legal will or estate document. Sensitive entry and contact details are not repeated in the conversation.",
   "detail": "The Home Continuity Plan records how this home runs so someone else can take over. It is not a legal will or estate document. Entry details and contact information, including access notes such as gate codes and key locations, are kept out of the conversation and are not repeated in conversation history; open an entry or the emergency view to see them.",
   "severity": "INFO",
   "suggestions": []
  }
 ],
 "established": [
  {
   "type": "SUMMARY",
   "id": "digital-will-summary",
   "title": "Home Continuity Plan",
   "body": "Home Digital Will \u00b7 Draft, with 1 entry across 8 sections and 1 trusted contact. Last reviewed Sep 1, 2026.",
   "tone": "DEFAULT",
   "headline": "Home Continuity Plan",
   "supportLine": "Home Digital Will \u00b7 1 entry across 8 sections and 1 trusted contact.",
   "chips": [
    {
     "label": "Draft \u00b7 ready to publish",
     "tone": "DEFAULT"
    },
    {
     "label": "Last reviewed Sep 1, 2026",
     "tone": "DEFAULT"
    },
    {
     "label": "3 of 3 handoff requirements met",
     "tone": "POSITIVE"
    }
   ],
   "actions": []
  },
  {
   "type": "PROGRESS",
   "id": "digital-will-progress",
   "title": "Ready to hand off",
   "description": "Counts the three things the plan needs before someone else can take over: an emergency instruction, a primary trusted contact, and a way to reach that contact. Other entries are not counted.",
   "percent": 100,
   "basis": "3 of 3 handoff requirements met",
   "metrics": [
    {
     "label": "Met",
     "value": "3",
     "tone": "DEFAULT"
    },
    {
     "label": "Missing",
     "value": "0",
     "tone": "DEFAULT"
    },
    {
     "label": "Entries",
     "value": "1",
     "tone": "DEFAULT"
    }
   ],
   "nextSteps": [],
   "actions": []
  },
  {
   "type": "GROUPED_LIST",
   "filters": [],
   "id": "digital-will-items",
   "title": "What the plan holds",
   "description": "Entry titles by section and who can see the plan. Entry details are not shown here.",
   "sections": [
    {
     "id": "digital-will-section-s-emergency",
     "title": "Emergency Instructions",
     "count": 1,
     "items": [
      {
       "id": "s-emergency",
       "title": "Manage section",
       "meta": [
        "Enabled",
        "type:EMERGENCY"
       ],
       "status": "ENABLED",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_SECTION",
       "actions": [
        {
         "id": "ENTRY_CREATE",
         "label": "Add entry",
         "interactionType": "MUTATE_RECORD",
         "message": "Add an entry to this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "SECTION_EDIT",
         "label": "Edit section",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_UP",
         "label": "Move up",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section up",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_DOWN",
         "label": "Move down",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section down",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_DELETE",
         "label": "Delete section",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      },
      {
       "id": "water",
       "title": "Water shutoff",
       "description": null,
       "meta": [
        "instruction",
        "critical priority",
        "Emergency"
       ],
       "status": "CRITICAL",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_ENTRY",
       "actions": [
        {
         "id": "ENTRY_EDIT",
         "label": "Edit",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this home continuity plan entry",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "ENTRY_MOVE_UP",
         "label": "Move up",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan entry up",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "ENTRY_MOVE_DOWN",
         "label": "Move down",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan entry down",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "ENTRY_DELETE",
         "label": "Delete",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this home continuity plan entry",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      }
     ]
    },
    {
     "id": "digital-will-section-s-critical",
     "title": "Critical Information",
     "count": 0,
     "items": [
      {
       "id": "s-critical",
       "title": "Manage section",
       "meta": [
        "Enabled",
        "type:CRITICAL_INFO"
       ],
       "status": "ENABLED",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_SECTION",
       "actions": [
        {
         "id": "ENTRY_CREATE",
         "label": "Add entry",
         "interactionType": "MUTATE_RECORD",
         "message": "Add an entry to this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "SECTION_EDIT",
         "label": "Edit section",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_UP",
         "label": "Move up",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section up",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_DOWN",
         "label": "Move down",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section down",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_DELETE",
         "label": "Delete section",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      }
     ]
    },
    {
     "id": "digital-will-section-s-contractors",
     "title": "Preferred Contractors",
     "count": 0,
     "items": [
      {
       "id": "s-contractors",
       "title": "Manage section",
       "meta": [
        "Enabled",
        "type:CONTRACTORS"
       ],
       "status": "ENABLED",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_SECTION",
       "actions": [
        {
         "id": "ENTRY_CREATE",
         "label": "Add entry",
         "interactionType": "MUTATE_RECORD",
         "message": "Add an entry to this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "SECTION_EDIT",
         "label": "Edit section",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_UP",
         "label": "Move up",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section up",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_DOWN",
         "label": "Move down",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section down",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_DELETE",
         "label": "Delete section",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      }
     ]
    },
    {
     "id": "digital-will-section-s-maint",
     "title": "Maintenance Knowledge",
     "count": 0,
     "items": [
      {
       "id": "s-maint",
       "title": "Manage section",
       "meta": [
        "Enabled",
        "type:MAINTENANCE_KNOWLEDGE"
       ],
       "status": "ENABLED",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_SECTION",
       "actions": [
        {
         "id": "ENTRY_CREATE",
         "label": "Add entry",
         "interactionType": "MUTATE_RECORD",
         "message": "Add an entry to this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "SECTION_EDIT",
         "label": "Edit section",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_UP",
         "label": "Move up",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section up",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_DOWN",
         "label": "Move down",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section down",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_DELETE",
         "label": "Delete section",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      }
     ]
    },
    {
     "id": "digital-will-section-s-utilities",
     "title": "Utilities",
     "count": 0,
     "items": [
      {
       "id": "s-utilities",
       "title": "Manage section",
       "meta": [
        "Enabled",
        "type:UTILITIES"
       ],
       "status": "ENABLED",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_SECTION",
       "actions": [
        {
         "id": "ENTRY_CREATE",
         "label": "Add entry",
         "interactionType": "MUTATE_RECORD",
         "message": "Add an entry to this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "SECTION_EDIT",
         "label": "Edit section",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_UP",
         "label": "Move up",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section up",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_DOWN",
         "label": "Move down",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section down",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_DELETE",
         "label": "Delete section",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      }
     ]
    },
    {
     "id": "digital-will-section-s-insurance",
     "title": "Insurance Notes",
     "count": 0,
     "items": [
      {
       "id": "s-insurance",
       "title": "Manage section",
       "meta": [
        "Enabled",
        "type:INSURANCE"
       ],
       "status": "ENABLED",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_SECTION",
       "actions": [
        {
         "id": "ENTRY_CREATE",
         "label": "Add entry",
         "interactionType": "MUTATE_RECORD",
         "message": "Add an entry to this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "SECTION_EDIT",
         "label": "Edit section",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_UP",
         "label": "Move up",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section up",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_DOWN",
         "label": "Move down",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section down",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_DELETE",
         "label": "Delete section",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      }
     ]
    },
    {
     "id": "digital-will-section-s-rules",
     "title": "House Rules",
     "count": 0,
     "items": [
      {
       "id": "s-rules",
       "title": "Manage section",
       "meta": [
        "Enabled",
        "type:HOUSE_RULES"
       ],
       "status": "ENABLED",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_SECTION",
       "actions": [
        {
         "id": "ENTRY_CREATE",
         "label": "Add entry",
         "interactionType": "MUTATE_RECORD",
         "message": "Add an entry to this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "SECTION_EDIT",
         "label": "Edit section",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_UP",
         "label": "Move up",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section up",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_DOWN",
         "label": "Move down",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section down",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_DELETE",
         "label": "Delete section",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      }
     ]
    },
    {
     "id": "digital-will-section-s-general",
     "title": "General Notes",
     "count": 0,
     "items": [
      {
       "id": "s-general",
       "title": "Manage section",
       "meta": [
        "Enabled",
        "type:GENERAL_NOTES"
       ],
       "status": "ENABLED",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_SECTION",
       "actions": [
        {
         "id": "ENTRY_CREATE",
         "label": "Add entry",
         "interactionType": "MUTATE_RECORD",
         "message": "Add an entry to this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "SECTION_EDIT",
         "label": "Edit section",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_UP",
         "label": "Move up",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section up",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_MOVE_DOWN",
         "label": "Move down",
         "interactionType": "MUTATE_RECORD",
         "message": "Move this home continuity plan section down",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        },
        {
         "id": "SECTION_DELETE",
         "label": "Delete section",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this home continuity plan section",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      }
     ]
    },
    {
     "id": "digital-will-contacts",
     "title": "Trusted contacts",
     "count": 1,
     "items": [
      {
       "id": "c1",
       "title": "Jordan Lee",
       "description": null,
       "meta": [
        "family member",
        "emergency only access",
        "Primary"
       ],
       "status": "PRIMARY",
       "href": null,
       "entityType": "HOME_DIGITAL_WILL_CONTACT",
       "actions": [
        {
         "id": "CONTACT_EDIT",
         "label": "Edit",
         "interactionType": "MUTATE_RECORD",
         "message": "Edit this trusted contact",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "PRIMARY"
        },
        {
         "id": "CONTACT_DELETE",
         "label": "Delete",
         "interactionType": "MUTATE_RECORD",
         "message": "Delete this trusted contact",
         "operationId": "HOME_DIGITAL_WILL_CREATE",
         "style": "SECONDARY"
        }
       ]
      }
     ]
    }
   ],
   "collection": {
    "sourceTotal": 10,
    "fetchedCount": 10,
    "deliveredCount": 10,
    "nextPageAvailable": false,
    "deliveryTruncated": false
   },
   "actions": [
    {
     "id": "home-continuity-emergency",
     "label": "Emergency view",
     "interactionType": "START_WORKFLOW",
     "message": "Open my home continuity plan emergency view",
     "operationId": "HOME_DIGITAL_WILL_CREATE",
     "entityType": "HOME_DIGITAL_WILL_EMERGENCY",
     "entityId": "w1",
     "style": "SECONDARY"
    },
    {
     "id": "home-continuity-metadata",
     "label": "Edit details",
     "interactionType": "START_WORKFLOW",
     "message": "Edit my home continuity plan details",
     "operationId": "HOME_DIGITAL_WILL_CREATE",
     "entityType": "HOME_DIGITAL_WILL_METADATA",
     "entityId": "w1",
     "style": "SECONDARY"
    },
    {
     "id": "home-continuity-publish",
     "label": "Mark plan ready",
     "interactionType": "START_WORKFLOW",
     "message": "Publish my home continuity plan",
     "operationId": "HOME_DIGITAL_WILL_CREATE",
     "entityType": "HOME_DIGITAL_WILL_PUBLISH",
     "entityId": "w1",
     "style": "PRIMARY"
    },
    {
     "id": "home-continuity-add-contact",
     "label": "Add trusted contact",
     "interactionType": "START_WORKFLOW",
     "message": "Add a trusted contact to my home continuity plan",
     "operationId": "HOME_DIGITAL_WILL_CREATE",
     "entityType": "HOME_DIGITAL_WILL_EDITOR",
     "entityId": "w1",
     "actionId": "CONTACT_CREATE",
     "style": "SECONDARY"
    }
   ]
  },
  {
   "type": "BOUNDARY",
   "id": "digital-will-boundary",
   "title": "A home knowledge plan, not a legal will",
   "body": "Not a legal will or estate document. Sensitive entry and contact details are not repeated in the conversation.",
   "detail": "The Home Continuity Plan records how this home runs so someone else can take over. It is not a legal will or estate document. Entry details and contact information, including access notes such as gate codes and key locations, are kept out of the conversation and are not repeated in conversation history; open an entry or the emergency view to see them.",
   "severity": "INFO",
   "suggestions": []
  }
 ]
} as const;
