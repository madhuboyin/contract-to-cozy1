-- Projects whose contract amount may have been recorded as 0 only because it was unknown (owner ruling D-H5).
-- READ ONLY: nothing here changes data. Run in pgAdmin after `prisma db push` has made the amount columns nullable.
--
-- Before that change, a project made from a renovation handoff with no amount supplied, or from an inspection finding, was stored with a contract amount
-- of 0. A real zero-dollar project looks identical, so no row is rewritten automatically. Review the rows below and, for any whose amount was really
-- never known, clear it in the product (or ask for a governed correction); a project with payments or change orders is excluded because those show a
-- real amount was in play.

SELECT p.id, p."propertyId", p.name, p."projectType", p."sourceType", p."sourceEntityType", p.status, p."createdAt",
       p."contractAmountCents", p."currentContractAmountCents", p."fundingMode"
FROM project_records p
WHERE p."contractAmountCents" = 0
  AND p."approvedChangeOrderDeltaCents" = 0
  AND p."paidToDateCents" = 0
  AND (p."renovationCaseId" IS NOT NULL OR p."sourceEntityType" = 'INSPECTION_FINDING')
ORDER BY p."createdAt" DESC;

-- Projects whose funding mode is SELF_PAID but was never chosen cannot be told apart from a real choice; this lists the ones created by the two paths
-- that assumed it, for a person to review.
SELECT p.id, p."propertyId", p.name, p."sourceEntityType", p.status, p."createdAt"
FROM project_records p
WHERE p."fundingMode" = 'SELF_PAID'
  AND (p."renovationCaseId" IS NOT NULL OR p."sourceEntityType" = 'INSPECTION_FINDING')
ORDER BY p."createdAt" DESC;
