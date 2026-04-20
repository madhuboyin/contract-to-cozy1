# Sprint 3 Mobile QA Matrix

Date: 2026-04-20
Owner: QA Mobile + FE
Devices: iOS Safari, Android Chrome

## Execution Rules

1. Capture screenshot or video evidence for each case and device.
2. Mark `PASS` only when no P0/P1 issue exists for the case on that device.
3. Log any defect with route, repro steps, and severity before marking the case complete.

## Matrix

| ID | Journey | Path | Expected Result | iOS Safari | Android Chrome | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M-1 | Homeowner auth to dashboard | /login -> /dashboard | Sign-in succeeds and command center renders without layout overflow. | PENDING | PENDING | Pending capture | |
| M-2 | Resolution to providers handoff | /dashboard/resolution-center -> /dashboard/providers -> /dashboard/providers/[id] -> /dashboard/providers/[id]/book | Category, service label, return path, and action context remain intact through booking. | PENDING | PENDING | Pending capture | |
| M-3 | Protect and vault safety surfaces | /dashboard/protect -> /dashboard/properties/[id]/vault | Coverage, incidents, and trust metadata render correctly in mobile layout. | PENDING | PENDING | Pending capture | |
| M-4 | Provider portal auth and queue | /providers/login -> /providers/dashboard -> /providers/bookings -> /providers/bookings/[id] | Provider can access queue and execute booking lifecycle actions. | PENDING | PENDING | Pending capture | |
| M-5 | Provider operations screens | /providers/services + /providers/calendar + /providers/portfolio + /providers/profile | Core provider sections open from nav and preserve responsive usability. | PENDING | PENDING | Pending capture | |

## Sign-off

| Role | Name | Date | Status |
| --- | --- | --- | --- |
| QA Mobile Lead |  |  | PENDING |
| Frontend Lead |  |  | PENDING |
| PM |  |  | PENDING |
