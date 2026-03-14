# Knowledge Hub

## Overview

The Knowledge Hub is Contract-to-Cozy's editorial guidance layer for homeowners. It combines:

- a structured content model in Prisma
- public read APIs from the backend
- public listing and article-detail pages in the frontend
- an internal admin/editor for creating and updating articles
- seed data for categories, tags, tools, and initial articles
- property-aware linking so article CTAs can deep-link into the right CtC workflows

The feature is intentionally product-aware. Articles are not just longform content; they can connect readers to CtC tools, reports, and action prompts using structured links and CTA modules.

## Primary User Flows

### Public reading flow

1. User opens `/knowledge`
2. Frontend fetches published articles from `GET /api/knowledge/articles`
3. User opens `/knowledge/[slug]`
4. Frontend fetches article detail from `GET /api/knowledge/articles/:slug`
5. Article renders:
   - metadata
   - categories
   - tags
   - structured sections
   - TOC
   - recommended tools
   - CTA modules
   - related reads

### Internal publishing flow

1. Admin opens `/dashboard/knowledge-admin`
2. Frontend fetches admin list and editor options
3. Admin creates or edits an article
4. Frontend submits validated payload to admin API
5. Backend replaces joins/sections/tool links/CTAs in a transaction
6. Public Knowledge Hub immediately reads the updated article data

## Database Model

The Knowledge Hub schema lives in [apps/backend/prisma/schema.prisma](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/prisma/schema.prisma).

### Enums

#### `KnowledgeArticleStatus`

- `DRAFT`
- `REVIEW`
- `PUBLISHED`
- `ARCHIVED`

#### `KnowledgeArticleType`

- `EDUCATIONAL`
- `BUYER_GUIDE`
- `VALUE_FACTORS`
- `RISK_EXPLAINER`
- `CHECKLIST_ARTICLE`
- `TOOL_LANDING`
- `SEASONAL`

#### `KnowledgeSectionType`

- `INTRO`
- `TEXT`
- `CALLOUT`
- `CHECKLIST`
- `FACT_BOX`
- `RISK_BOX`
- `TOOL_EMBED`
- `CTA`
- `FAQ`
- `SUMMARY`

#### `ProductToolType`

- `AI_TOOL`
- `HOME_TOOL`
- `FEATURE`
- `REPORT`
- `WORKFLOW`

#### `ProductToolStatus`

- `ACTIVE`
- `HIDDEN`
- `DEPRECATED`

#### `KnowledgeToolPlacement`

- `HERO`
- `INLINE`
- `SIDEBAR`
- `END_OF_ARTICLE`
- `STICKY_CARD`

#### `KnowledgeCtaType`

- `TOOL`
- `DATA_PROMPT`
- `INTERNAL_LINK`
- `REPORT`
- `SIGNUP`

#### `KnowledgeEventType`

- `VIEW`
- `TOOL_CLICK`
- `CTA_CLICK`
- `SECTION_EXPAND`
- `RELATED_ARTICLE_CLICK`
- `DATA_PROMPT_CLICK`

### Core tables

#### `knowledge_articles` (`KnowledgeArticle`)

Main article record.

Important fields:

- `id`
- `slug` unique
- `title`
- `subtitle`
- `excerpt`
- `status`
- `articleType`
- `heroTitle`
- `heroDescription`
- `heroImageUrl`
- `coverDocumentId`
- `seoTitle`
- `seoDescription`
- `seoKeywords`
- `canonicalUrl`
- `readingMinutes`
- `featured`
- `evergreenScore`
- `sortOrder`
- `schemaVersion`
- `publishedAt`
- `createdAt`
- `updatedAt`

Important relations:

- `sections`
- `categoryLinks`
- `tagLinks`
- `toolLinks`
- `ctaLinks`
- `relatedFrom`
- `relatedTo`
- `audienceRules`
- `events`

Important indexes:

- `[status, publishedAt]`
- `[articleType, status]`
- `[featured, sortOrder]`
- `[coverDocumentId]`

#### `knowledge_article_sections` (`KnowledgeArticleSection`)

Structured sections that make article rendering modular.

Important fields:

- `articleId`
- `sectionType`
- `title`
- `body`
- `dataJson`
- `sortOrder`

Important relations:

- `article`
- `toolLinks`
- `ctaLinks`
- `events`

Important index:

- `[articleId, sortOrder]`

#### `knowledge_categories` (`KnowledgeCategory`)

High-level article taxonomy such as Maintenance, Insurance, Climate, and Property Value.

Important fields:

- `id`
- `slug` unique
- `name`
- `description`
- `sortOrder`
- `isActive`

Important index:

- `[isActive, sortOrder]`

#### `knowledge_tags` (`KnowledgeTag`)

Granular taxonomy like `roof-age`, `climate-risk`, `resale-value`, `water-damage`.

Important fields:

- `id`
- `slug` unique
- `name`
- `tagGroup`
- `isActive`

Important indexes:

- `[tagGroup]`
- `[isActive]`

#### `product_tools` (`ProductTool`)

Canonical registry of productized CtC tools, reports, workflows, and features that Knowledge Hub content can promote.

Important fields:

- `id`
- `key` unique
- `slug` unique
- `name`
- `shortDescription`
- `toolType`
- `status`
- `routePath`
- `iconName`
- `badgeLabel`
- `sortOrder`
- `category`
- `metadata`

Important indexes:

- `[toolType, status]`
- `[category]`
- `[status, sortOrder]`

### Join and support tables

#### `knowledge_article_categories` (`KnowledgeArticleCategory`)

Join table between articles and categories.

- composite primary key: `[articleId, categoryId]`
- index on `categoryId`

#### `knowledge_article_tags` (`KnowledgeArticleTag`)

Join table between articles and tags.

- composite primary key: `[articleId, tagId]`
- index on `tagId`

#### `knowledge_article_tool_links` (`KnowledgeArticleToolLink`)

Controls which ProductTool records are attached to an article, where they appear, and with what override copy.

Important fields:

- `articleId`
- `productToolId`
- `anchorSectionId`
- `placement`
- `priority`
- `customTitle`
- `customBody`
- `ctaLabel`
- `isPrimary`

Important indexes:

- `[articleId, placement, priority]`
- `[productToolId]`
- `[anchorSectionId]`

#### `knowledge_article_ctas` (`KnowledgeArticleCta`)

Structured CTA modules embedded in an article.

Important fields:

- `articleId`
- `productToolId`
- `sectionId`
- `ctaType`
- `title`
- `description`
- `ctaLabel`
- `href`
- `priority`
- `dataPromptKey`
- `visibilityRule`

Important indexes:

- `[articleId, priority]`
- `[productToolId]`
- `[sectionId]`

#### `knowledge_audience_rules` (`KnowledgeAudienceRule`)

Optional audience targeting / personalization rules.

Important fields:

- `articleId`
- `name`
- `description`
- `ruleJson`
- `priority`
- `isActive`

#### `knowledge_article_relations` (`KnowledgeArticleRelation`)

Related-article graph.

Important fields:

- `sourceArticleId`
- `targetArticleId`
- `relationType`
- `sortOrder`

Primary key:

- `[sourceArticleId, targetArticleId, relationType]`

#### `knowledge_article_events` (`KnowledgeArticleEvent`)

Analytics/event table for knowledge engagement and tool/CTA interactions.

Important fields:

- `articleId`
- `userId`
- `propertyId`
- `productToolId`
- `sectionId`
- `eventType`
- `sessionId`
- `metadata`

## Seed Data

Knowledge Hub reference and article seed data lives in:

- [apps/backend/prisma/knowledgeHub.seed.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/prisma/knowledgeHub.seed.ts)

It is wired into:

- [apps/backend/prisma/seed.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/prisma/seed.ts)
- [apps/backend/package.json](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/package.json)

Relevant scripts:

- `npm run seed`
- `npm run seed:knowledge-hub`

Seed coverage:

- categories
- tags
- product tools
- initial articles
- sections
- tool links
- CTAs
- related-article links

## Backend Implementation

### Route mounting

Knowledge Hub routes are mounted in:

- [apps/backend/src/index.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/index.ts)

Important mounts:

- `app.use('/api', knowledgeHubRoutes)`
- `app.use('/api', knowledgeHubAdminRoutes)`

The public route ordering matters. Public Knowledge Hub routes are mounted before authenticated `/api` routers so `GET /api/knowledge/articles` stays public.

### Public API files

#### [apps/backend/src/routes/knowledgeHub.routes.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/routes/knowledgeHub.routes.ts)

Public read routes:

- `GET /api/knowledge/articles`
- `GET /api/knowledge/articles/:slug`

Applies `apiRateLimiter`.

#### [apps/backend/src/controllers/knowledgeHub.controller.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/controllers/knowledgeHub.controller.ts)

Controller responsibilities:

- list published articles
- fetch published article by slug
- return 404 if article not found

#### [apps/backend/src/services/knowledgeHub.service.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/knowledgeHub.service.ts)

Public read service.

Responsibilities:

- select only fields needed by the UI
- filter to `KnowledgeArticleStatus.PUBLISHED`
- order listing by:
  - `featured desc`
  - `sortOrder asc`
  - `publishedAt desc`
- fetch article detail with:
  - categories
  - tags
  - ordered sections
  - ordered tool links
  - ordered CTAs
  - related published articles

### Admin API files

#### [apps/backend/src/routes/knowledgeHubAdmin.routes.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/routes/knowledgeHubAdmin.routes.ts)

Admin-only routes under `/api/knowledge/admin/*`.

Protection:

- `authenticate`
- `requireRole(UserRole.ADMIN)`
- `apiRateLimiter`

Routes:

- `GET /api/knowledge/admin/options`
- `GET /api/knowledge/admin/articles`
- `GET /api/knowledge/admin/articles/:id`
- `POST /api/knowledge/admin/articles`
- `PUT /api/knowledge/admin/articles/:id`

#### [apps/backend/src/controllers/knowledgeHubAdmin.controller.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/controllers/knowledgeHubAdmin.controller.ts)

Controller responsibilities:

- list admin articles
- return editor options
- get full article payload for editor
- create article
- update article
- convert domain errors into correct HTTP status codes

#### [apps/backend/src/services/knowledgeHubAdmin.service.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/knowledgeHubAdmin.service.ts)

Admin service responsibilities:

- admin list query
- editor detail query
- editor options query
- slug uniqueness check
- category/tag/tool existence checks
- transactional create/update

Save strategy:

1. upsert article metadata
2. delete existing article joins/children
3. recreate category links
4. recreate tag links
5. recreate sections in `sortOrder`
6. map temporary section keys to new section ids
7. recreate tool links with resolved anchors
8. recreate CTAs with resolved section references

This is a deliberate replace-all child reconciliation strategy. It keeps the MVP editor reliable and avoids join duplication.

#### [apps/backend/src/validators/knowledgeHubAdmin.validators.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/validators/knowledgeHubAdmin.validators.ts)

Backend validation uses `zod`.

Validates:

- slug format
- enum values
- numeric ranges
- section temp-key uniqueness
- tool link anchor references
- CTA section references
- CTA requirement: tool or direct href must exist

## Frontend Implementation

### Shared data/access files

#### [apps/frontend/src/lib/knowledge/types.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/knowledge/types.ts)

Frontend read-model types for:

- article list items
- article detail
- categories
- tags
- sections
- tool links
- CTAs
- related articles

#### [apps/frontend/src/lib/knowledge/api.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/knowledge/api.ts)

Server-side fetch helper for public Knowledge Hub pages.

Responsibilities:

- resolve correct backend API base
- support local dev and production host behavior
- call:
  - `/api/knowledge/articles`
  - `/api/knowledge/articles/:slug`
- return `null` on article 404
- throw on other API failures

#### [apps/frontend/src/lib/knowledge/links.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/knowledge/links.ts)

Knowledge-specific link helper.

Responsibilities:

- preserve optional `propertyId` through Knowledge Hub routes
- build `/knowledge/[slug]` links
- resolve ProductTool and CTA links
- replace `:propertyId` in tool/report routes when a property context exists
- fall back to `/dashboard/properties?navTarget=...` when a property-scoped destination needs property selection first

This file is the key reason Knowledge Hub can deep-link into property-aware CtC workflows.

#### [apps/frontend/src/lib/knowledge/adminApi.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/knowledge/adminApi.ts)

Client-side admin API wrapper for:

- list articles
- load options
- load article by id
- create article
- update article

#### [apps/frontend/src/lib/knowledge/editor.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/knowledge/editor.ts)

Editor-side helpers and form schema utilities.

Responsibilities:

- default form building
- transform form state into backend payload
- empty item factories for sections/tool links/CTAs
- slug generation
- sort order helpers
- editor zod schema

#### [apps/frontend/src/lib/knowledge/articleToc.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/knowledge/articleToc.ts)

TOC helper for article pages.

Responsibilities:

- choose only meaningful titled sections for TOC
- skip low-value/untitled sections
- derive stable anchor ids
- cap TOC length
- preserve a final summary/FAQ anchor when helpful

### Public frontend routes

#### [apps/frontend/src/app/knowledge/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/knowledge/page.tsx)

Public listing page.

Responsibilities:

- render hero/introduction
- fetch published articles
- show featured article
- show latest articles grid
- handle empty state
- handle temporary fetch failure state
- preserve optional `propertyId`

#### [apps/frontend/src/app/knowledge/[slug]/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/knowledge/%5Bslug%5D/page.tsx)

Public article detail page.

Responsibilities:

- fetch article by slug
- render header metadata and categories/tags
- render “Start here” hero tool
- render sections in editorial layout
- attach inline and end-of-article tool/CTA placements
- render related reads
- render TOC in right rail and compact mobile version
- preserve optional `propertyId`

#### [apps/frontend/src/app/knowledge/not-found.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/knowledge/not-found.tsx)

Public 404 state for missing articles.

#### [apps/frontend/src/app/knowledge/error.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/knowledge/error.tsx)

Public error boundary for article/listing failures.

### Public Knowledge Hub components

#### [apps/frontend/src/components/knowledge/KnowledgeArticleCard.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/knowledge/KnowledgeArticleCard.tsx)

Used on listing page for featured and non-featured article cards.

#### [apps/frontend/src/components/knowledge/KnowledgeMetaRow.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/knowledge/KnowledgeMetaRow.tsx)

Renders article meta like publication date and reading time.

#### [apps/frontend/src/components/knowledge/KnowledgeSectionRenderer.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/knowledge/KnowledgeSectionRenderer.tsx)

Renders structured article sections.

Supported section experiences:

- intro/text
- checklist
- fact box
- risk box
- callout
- FAQ
- summary
- tool embed
- CTA

Also accepts section anchor ids for TOC navigation.

#### [apps/frontend/src/components/knowledge/KnowledgeToolCard.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/knowledge/KnowledgeToolCard.tsx)

Renders a linked `ProductTool` recommendation.

Supports lighter variants such as:

- feature
- rail
- default inline/end-of-article use

#### [apps/frontend/src/components/knowledge/KnowledgeCtaCard.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/knowledge/KnowledgeCtaCard.tsx)

Renders a structured CTA module.

#### [apps/frontend/src/components/knowledge/KnowledgeArticleToc.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/knowledge/KnowledgeArticleToc.tsx)

Article TOC component.

Behavior:

- desktop: compact sticky TOC with active-section highlighting
- mobile: compact collapsible TOC block

### Admin/editor frontend routes

#### [apps/frontend/src/app/(dashboard)/dashboard/knowledge-admin/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/%28dashboard%29/dashboard/knowledge-admin/page.tsx)

Admin article list view.

Responsibilities:

- gate by `useAuth`
- require `user.role === 'ADMIN'`
- list articles in a table
- link to create/edit/live article

#### [apps/frontend/src/app/(dashboard)/dashboard/knowledge-admin/new/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/%28dashboard%29/dashboard/knowledge-admin/new/page.tsx)

Create-article page wrapper.

#### [apps/frontend/src/app/(dashboard)/dashboard/knowledge-admin/[id]/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/%28dashboard%29/dashboard/knowledge-admin/%5Bid%5D/page.tsx)

Edit-article page wrapper.

#### [apps/frontend/src/components/knowledge-admin/KnowledgeArticleEditor.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/knowledge-admin/KnowledgeArticleEditor.tsx)

Main internal editor.

Responsibilities:

- auth/admin gating
- load editor options
- load existing article for edit mode
- React Hook Form + zod validation
- edit metadata, taxonomy, sections, tool links, CTAs
- toast success/failure handling
- redirect newly-created articles to edit route
- allow opening the live article in a new tab

## Public Routes

- `/knowledge`
- `/knowledge/[slug]`

## Admin Routes

- `/dashboard/knowledge-admin`
- `/dashboard/knowledge-admin/new`
- `/dashboard/knowledge-admin/[id]`

## API Routes

### Public

- `GET /api/knowledge/articles`
- `GET /api/knowledge/articles/:slug`

### Admin

- `GET /api/knowledge/admin/options`
- `GET /api/knowledge/admin/articles`
- `GET /api/knowledge/admin/articles/:id`
- `POST /api/knowledge/admin/articles`
- `PUT /api/knowledge/admin/articles/:id`

## Navigation

### Desktop dashboard navigation

Knowledge Hub is wired into the main dashboard shell in:

- [apps/frontend/src/app/(dashboard)/layout.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/%28dashboard%29/layout.tsx)

Current desktop exposure:

- “More” menu bucket: `Knowledge Hub`
- “More” menu bucket: `Knowledge Admin` for admin users only
- left sidebar link: `Knowledge Hub`
- left sidebar link: `Knowledge Admin` for admin users only

Desktop Knowledge Hub links are property-aware when a property context exists:

- `/knowledge?propertyId=<id>`

### Command palette

Knowledge Hub and Knowledge Admin are also available in:

- [apps/frontend/src/components/navigation/DashboardCommandPalette.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/navigation/DashboardCommandPalette.tsx)

Current command items:

- `Knowledge Hub`
- `Knowledge Admin` for admins only

### Mobile navigation

Mobile bottom navigation lives in:

- [apps/frontend/src/components/mobile/BottomNav.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/mobile/BottomNav.tsx)

Current mobile navigation status:

- Knowledge Hub is **not currently included** as a first-class item in the mobile bottom nav
- Knowledge Hub is **not currently included** in the mobile “More” sheet buckets either
- mobile tool catalogs still influence Knowledge Hub because many seeded `ProductTool` links map to routes defined in:
  - [apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts)

What this means in practice:

- public Knowledge Hub pages are mobile-responsive
- property-aware article/tool links still work on mobile
- but there is not yet a dedicated mobile nav entry that promotes the Knowledge Hub itself

## Property-Aware Linking

Knowledge Hub preserves `propertyId` in the query string when available:

- listing links to article detail preserve `propertyId`
- article detail back link preserves `propertyId`
- related reads preserve `propertyId`
- tool links and CTAs resolve property-aware routes

Examples:

- `/knowledge?propertyId=<id>`
- `/knowledge/top-homeowner-concerns-in-2026?propertyId=<id>`
- `/dashboard/properties/<id>/home-score`
- `/dashboard/properties?navTarget=home-score` when no active property exists

## Current Content / Seeded Demo State

The feature is currently shipped with:

- seeded categories
- seeded tags
- seeded product tools
- seeded initial articles
- seeded sections
- seeded tool links and CTAs
- seeded related articles

This is why `/knowledge` is immediately demoable without manual authoring.

## Current Strengths

- strongly structured editorial data model
- public read path separated from admin write path
- property-aware tool and report deep links
- internal admin/editor for publishing beyond seed data
- compact TOC support for longform scanability
- resilient empty/error/not-found states

## Current Gaps / Notes

- mobile nav does not yet explicitly promote Knowledge Hub
- analytics/event writing exists in schema but is not yet wired as a full visible feature flow
- `KnowledgeAudienceRule` exists in schema for future targeting, but public rendering is not yet audience-personalized
- the internal editor uses a reliable replace-all child strategy, which is good for MVP but not version-history aware

## File Map Summary

### Backend

- [apps/backend/prisma/schema.prisma](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/prisma/schema.prisma)
- [apps/backend/prisma/knowledgeHub.seed.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/prisma/knowledgeHub.seed.ts)
- [apps/backend/prisma/seed.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/prisma/seed.ts)
- [apps/backend/src/index.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/index.ts)
- [apps/backend/src/routes/knowledgeHub.routes.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/routes/knowledgeHub.routes.ts)
- [apps/backend/src/routes/knowledgeHubAdmin.routes.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/routes/knowledgeHubAdmin.routes.ts)
- [apps/backend/src/controllers/knowledgeHub.controller.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/controllers/knowledgeHub.controller.ts)
- [apps/backend/src/controllers/knowledgeHubAdmin.controller.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/controllers/knowledgeHubAdmin.controller.ts)
- [apps/backend/src/services/knowledgeHub.service.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/knowledgeHub.service.ts)
- [apps/backend/src/services/knowledgeHubAdmin.service.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/knowledgeHubAdmin.service.ts)
- [apps/backend/src/validators/knowledgeHubAdmin.validators.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/validators/knowledgeHubAdmin.validators.ts)

### Frontend

- [apps/frontend/src/lib/knowledge/types.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/knowledge/types.ts)
- [apps/frontend/src/lib/knowledge/api.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/knowledge/api.ts)
- [apps/frontend/src/lib/knowledge/links.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/knowledge/links.ts)
- [apps/frontend/src/lib/knowledge/adminApi.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/knowledge/adminApi.ts)
- [apps/frontend/src/lib/knowledge/editor.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/knowledge/editor.ts)
- [apps/frontend/src/lib/knowledge/articleToc.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/knowledge/articleToc.ts)
- [apps/frontend/src/app/knowledge/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/knowledge/page.tsx)
- [apps/frontend/src/app/knowledge/[slug]/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/knowledge/%5Bslug%5D/page.tsx)
- [apps/frontend/src/app/knowledge/error.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/knowledge/error.tsx)
- [apps/frontend/src/app/knowledge/not-found.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/knowledge/not-found.tsx)
- [apps/frontend/src/components/knowledge/KnowledgeArticleCard.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/knowledge/KnowledgeArticleCard.tsx)
- [apps/frontend/src/components/knowledge/KnowledgeMetaRow.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/knowledge/KnowledgeMetaRow.tsx)
- [apps/frontend/src/components/knowledge/KnowledgeSectionRenderer.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/knowledge/KnowledgeSectionRenderer.tsx)
- [apps/frontend/src/components/knowledge/KnowledgeToolCard.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/knowledge/KnowledgeToolCard.tsx)
- [apps/frontend/src/components/knowledge/KnowledgeCtaCard.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/knowledge/KnowledgeCtaCard.tsx)
- [apps/frontend/src/components/knowledge/KnowledgeArticleToc.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/knowledge/KnowledgeArticleToc.tsx)
- [apps/frontend/src/app/(dashboard)/dashboard/knowledge-admin/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/%28dashboard%29/dashboard/knowledge-admin/page.tsx)
- [apps/frontend/src/app/(dashboard)/dashboard/knowledge-admin/new/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/%28dashboard%29/dashboard/knowledge-admin/new/page.tsx)
- [apps/frontend/src/app/(dashboard)/dashboard/knowledge-admin/[id]/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/%28dashboard%29/dashboard/knowledge-admin/%5Bid%5D/page.tsx)
- [apps/frontend/src/components/knowledge-admin/KnowledgeArticleEditor.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/knowledge-admin/KnowledgeArticleEditor.tsx)
- [apps/frontend/src/app/(dashboard)/layout.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/%28dashboard%29/layout.tsx)
- [apps/frontend/src/components/navigation/DashboardCommandPalette.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/navigation/DashboardCommandPalette.tsx)
- [apps/frontend/src/components/mobile/BottomNav.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/mobile/BottomNav.tsx)
- [apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts)

## Recommended Next Step

Add Knowledge Hub as a first-class mobile navigation destination so the feature is discoverable on phones without relying on direct URLs or article-internal links.
