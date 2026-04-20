# Sprint 2 Empty-State Audit

Date: 2026-04-20
Owner: FE Surfaces + UX

## Scope

Priority homeowner routes audited in Sprint 2:

1. `/dashboard/providers`
2. `/dashboard/resolution-center`
3. `/dashboard/protect`
4. `/dashboard/properties/[id]/vault`

## Checklist

| Route | Empty state present | Primary copy homeowner-friendly | Action CTA present | Notes |
| --- | --- | --- | --- | --- |
| `/dashboard/providers` | Yes | Yes | Yes | Added explicit retry CTA and clearer guidance when no matches return. |
| `/dashboard/resolution-center` | Yes | Yes | Yes | Existing no-active-items state retained; action pathways already present. |
| `/dashboard/protect` | Yes | Yes | Yes | Added explicit no-incidents state card and simplified language. |
| `/dashboard/properties/[id]/vault` | Yes | Yes | Yes | Existing empty cards retained for assets/documents/coverage/timeline. |

## Copy Guardrails Applied

1. Avoid internal terms like "SOC", "command center", or "operations" when plain language works.
2. Use short, specific next-step verbs in CTAs (`Retry search`, `Run Analysis`, `Go to required step`).
3. Keep empty-state body text to one actionable sentence plus optional reassurance.

