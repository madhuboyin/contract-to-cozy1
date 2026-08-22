[← Back to Wiki Home](README.md)

# Introduction

## What is Contract to Cozy?

Contract to Cozy (C2C) is a property management platform that connects homeowners with service providers. It helps homeowners track home maintenance, understand risk and insurance coverage, manage finances tied to their property, and get AI-powered guidance — while giving service providers a marketplace to find and manage bookings.

## Who uses it

| Role | What they do |
|---|---|
| **HOMEOWNER** | Sets up a property profile, tracks inventory/maintenance, gets AI guidance and risk/coverage insights, books services, and manages life events (selling, buying, moving). |
| **PROVIDER** | Registers a service business, manages credentials and service offerings, and fulfills bookings from homeowners. |
| **ADMIN** | Operates the platform internally — user/provider support, content moderation, analytics, background job monitoring, and platform configuration. |

## Core pillars

- **Home health** — inventory, appliances, maintenance tasks, seasonal checklists, inspections, and documents.
- **AI guidance** — a conversational "Ask" concierge, a guidance/recommendation engine, personalization, and home scoring, all built on Google Gemini.
- **Coverage & money** — insurance analysis, risk/premium optimization, savings & benefits discovery, ownership cost intelligence, budgeting, claims, and property tax tools.
- **Marketplace** — provider discovery, bookings, service pricing, DIY projects, permits, and renovation advisory.
- **Situational awareness** — weather alerts, product recalls, HOA compliance, neighborhood intelligence, and community updates.
- **Life transitions** — preparing to sell, buying a new home, moving, refinancing, and long-term digital records.
- **Platform operations** — an internal admin console, notifications, and background job automation (BullMQ workers).

## How this wiki is organized

The wiki is meant to be read roughly in order, moving from "how do I run this" to "how does each part of the product work":

1. **[Getting Started](01-getting-started.md)** — run the app locally.
2. **[Architecture & Data Model](02-architecture-and-data-model.md)** — how the codebase and data are structured.
3. **Feature guide** (`features/`) — one page per capability area, each covering both the user-facing flow and its implementation, roughly in the order a homeowner encounters them: onboarding → home health → AI guidance → money & coverage → marketplace → situational awareness → life transitions → admin/platform.

See the **[Wiki Home](README.md)** for the full table of contents.

---
[← Back to Wiki Home](README.md)
