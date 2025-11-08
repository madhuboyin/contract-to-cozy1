#!/bin/bash

POSTGRES_POD=$(kubectl get pods -n production -l app=postgres -o jsonpath='{.items[0].metadata.name}')

echo "Creating homeowner profile and property..."
echo ""

kubectl exec -n production $POSTGRES_POD -- psql -U postgres -d contracttocozy -c "
-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";

-- Create homeowner profile with UUID
INSERT INTO homeowner_profiles (
  id,
  \"userId\",
  \"propertyType\",
  \"propertySize\",
  \"spentAmount\",
  \"createdAt\",
  \"updatedAt\"
)
SELECT 
  gen_random_uuid(),
  id,
  'Single Family',
  2500,
  0,
  NOW(),
  NOW()
FROM users 
WHERE email = 'homeowner@example.com'
AND NOT EXISTS (
  SELECT 1 FROM homeowner_profiles hp WHERE hp.\"userId\" = users.id
)
RETURNING id;

-- Create property
INSERT INTO properties (
  id,
  \"homeownerProfileId\",
  name,
  address,
  city,
  state,
  \"zipCode\",
  \"isPrimary\",
  \"createdAt\",
  \"updatedAt\"
)
SELECT 
  gen_random_uuid(),
  hp.id,
  'Main Home',
  '123 Main Street',
  'Austin',
  'TX',
  '78701',
  true,
  NOW(),
  NOW()
FROM homeowner_profiles hp
JOIN users u ON hp.\"userId\" = u.id
WHERE u.email = 'homeowner@example.com'
RETURNING id, name, address, city;

-- Show the property
SELECT 
  p.id as property_id,
  p.name,
  p.address,
  p.city
FROM properties p
JOIN homeowner_profiles hp ON p.\"homeownerProfileId\" = hp.id
JOIN users u ON hp.\"userId\" = u.id
WHERE u.email = 'homeowner@example.com';
"

echo ""
echo "✅ Done! Copy the property_id (the long UUID) from above."
