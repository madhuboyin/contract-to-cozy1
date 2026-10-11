# Property Brief Functional Contract

**Status:** Slice 8 governed-sharing foundation
**Owner:** Property Intelligence and Briefings
**Replaces:** Home Score report, composite grade, benchmark, trend, buyer
preview, and buyer-facing score share

## Purpose

Property Brief is an on-demand, homeowner-assembled snapshot of selected
canonical property records. It supports homeowner reference, a contractor or
service professional, a household or trusted contact, insurer/claim support,
and a prospective buyer.

It is not a monitoring dashboard and it never calculates an overall score or
grade.

## Governing rules

- The homeowner declares the recipient purpose before creating a brief.
- Purpose templates constrain which sections may be selected.
- Property facts, verified Timeline history, selected verified documents,
  explicit unknowns, claims, and insurance are separate sections.
- Claims, insurance, and documents are sensitive and are never selected by
  default.
- Sensitive sections require explicit acknowledgement.
- Claim numbers, loss and settlement amounts, policy numbers, premiums,
  deductibles, and coverage limits are excluded from the initial shared
  contract.
- Every rendered item has a source entity, source label, verification state,
  and as-of date.
- Timeline items must be homeowner-confirmed or evidence-verified.
- Documents must be explicitly selected and verified.
- Unknowns describe only the fields checked by the selected template. They are
  not a claim of comprehensive record coverage.
- The server stores a snapshot. Later changes to source records do not silently
  change an already previewed or shared brief.

## Sharing

The homeowner previews the exact recipient snapshot before sharing and
acknowledges the limitation statement. A share:

- uses a random token whose hash, not raw token, is stored;
- expires after 1–90 days;
- defaults to view-only;
- can be revoked by the brief owner;
- records successful views and denied attempts;
- stores only hashes of IP address and user agent;
- shows selected sections, explicit exclusions, source/as-of context, and the
  limitation statement; and
- does not expose canonical deep links or private application controls.

The UI defaults to a 14-day, view-only share. A homeowner may explicitly allow
the recipient to download the shared snapshot as a PDF.

Ask Cozy supports the same governed lifecycle inline: purpose and section
selection, verified-document selection, frozen recipient preview, controlled
sharing, access testing, revocation, and content-diffed republishing. Every
write is contributor-gated and confirmation-gated. Recipient identity is not
repeated in the saved conversation transcript, and a raw share token is shown
only when the link is created because only its hash is stored.

## Limitation statement

Every preview and recipient view states that the artifact is
homeowner-assembled and is not an inspection, appraisal, certification, title
report, professional opinion, or comprehensive disclosure. Recipients are
directed to independent professional review for decisions that require it.

## API

```text
GET  /api/property-briefs/templates
GET  /api/properties/:propertyId/property-briefs
POST /api/properties/:propertyId/property-briefs
GET  /api/properties/:propertyId/property-briefs/:briefId/preview
POST /api/properties/:propertyId/property-briefs/:briefId/share
POST /api/properties/:propertyId/property-briefs/:briefId/shares/:shareId/revoke
GET  /api/property-briefs/shares/:token
```

Legacy Home Score report and share APIs return `410` with the Property Brief
replacement contract. Legacy authenticated routes redirect to the Property
Brief composer.

## Completion and analytics

`property_brief_created` is the capability completion signal. Creating a
controlled share is recorded separately as `property_brief_shared`. Opening a
page, refreshing a report, or generating a legacy score is not completion.

## Data constraint

The Prisma schema is changed directly. This slice creates no migration,
backfill, compatibility table, or dual-write path.
