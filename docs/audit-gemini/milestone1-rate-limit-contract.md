# Milestone 1 Rate-Limit Contract (AI + OCR)

**Date:** April 19, 2026  
**Scope:** Canonical v3 A3 verification deliverable

This document defines the current per-endpoint AI/OCR rate-limit budgets and the expected `429` response contract for frontend UX handling.

## 1) Endpoint Budgets

| Surface | Endpoint | Limiter | Budget Window | Max Requests |
| :--- | :--- | :--- | :--- | :--- |
| Gemini chat | `POST /api/gemini/chat` | `geminiRateLimiter` | 1 hour | 30 |
| OCR label extraction | `POST /api/properties/:propertyId/inventory/ocr/label` | `ocrRateLimiter` | 1 minute | 6 (default; overridable via `OCR_MAX_PER_MINUTE`) |
| Appliance oracle | `GET /api/oracle/predict/:propertyId` | `aiOracleRateLimiter` | 1 hour | 5 |
| Budget forecaster | `GET /api/budget/forecast/:propertyId` | `aiOracleRateLimiter` | 1 hour | 5 |
| Visual inspector | `POST /api/visual-inspector/analyze` | `expensiveAiRateLimiter` | 24 hours | 10 |
| Energy auditor | `POST /api/energy/audit` | `expensiveAiRateLimiter` | 24 hours | 10 |
| Document AI analyze | `POST /api/documents/analyze` | `uploadRateLimiter` | 1 minute | 10 |

Source of truth:
- `apps/backend/src/middleware/rateLimiter.middleware.ts`
- Route bindings under `apps/backend/src/routes/*.routes.ts`

## 2) 429 Response Contract

On limit breach, backend returns:

- HTTP status: `429`
- Header: `Retry-After` (seconds)
- JSON body:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable limiter message",
    "code": "AI_RATE_LIMIT_EXCEEDED | OCR_RATE_LIMITED | UPLOAD_RATE_LIMIT_EXCEEDED"
  }
}
```

## 3) UX Copy Mapping

Frontend should map limiter codes to clear user guidance:

- `AI_RATE_LIMIT_EXCEEDED`: "You've reached your AI request limit. Please try again after the cooldown window."
- `OCR_RATE_LIMITED`: "You've reached the scan limit for now. Please wait a minute and retry."
- `UPLOAD_RATE_LIMIT_EXCEEDED`: "Too many uploads in a short period. Please wait a minute and try again."

The `Retry-After` header should be shown when available (for example: "Try again in 42 seconds").

## 4) Automated Verification Coverage

- Integration tests:
  - `apps/backend/tests/integration/rate-limiters.integration.test.js`
  - Verifies Gemini and OCR threshold behavior, `429` response, error code, and `Retry-After`.
- Unit tests:
  - `apps/backend/tests/unit/deepHealth.test.js` (A4 companion verification for deep-health degradation behavior).
