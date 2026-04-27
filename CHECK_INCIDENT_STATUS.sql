-- Check the actual status of the Freeze Risk incident
-- Run this query to verify the incident status in the database

SELECT 
  id,
  propertyId,
  title,
  status,
  severity,
  createdAt,
  updatedAt,
  resolvedAt,
  EXTRACT(DAY FROM (NOW() - createdAt)) as age_in_days
FROM "Incident"
WHERE title LIKE '%Freeze Risk%'
  AND propertyId = 'f27f66e8-9c22-406b-aeef-f67c98681768'
ORDER BY createdAt DESC
LIMIT 5;

-- Expected result:
-- If status = 'RESOLVED', this incident should NOT show on dashboard
-- If status = 'ACTIVE' or 'DETECTED', it SHOULD show on dashboard

-- Also check what incidents are being returned by the API
SELECT 
  id,
  propertyId,
  title,
  status,
  severity,
  createdAt,
  EXTRACT(DAY FROM (NOW() - createdAt)) as age_in_days
FROM "Incident"
WHERE propertyId = 'f27f66e8-9c22-406b-aeef-f67c98681768'
  AND status NOT IN ('RESOLVED', 'SUPPRESSED', 'EXPIRED')
ORDER BY createdAt DESC;

-- This second query should return ONLY the incidents that should show on dashboard
