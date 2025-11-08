#!/bin/bash

# Script to create homeowner profile and property

POSTGRES_POD=$(kubectl get pods -n production -l app=postgres -o jsonpath='{.items[0].metadata.name}')

echo "Creating homeowner profile and property..."

kubectl exec -n production $POSTGRES_POD -- psql -U postgres -d contracttocozy <<'EOSQL'
DO $$
DECLARE
  v_user_id UUID;
  v_profile_id UUID;
  v_property_id UUID;
BEGIN
  SELECT id INTO v_user_id 
  FROM users 
  WHERE email = 'homeowner@example.com';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  SELECT id INTO v_profile_id
  FROM homeowner_profiles
  WHERE "userId" = v_user_id;

  IF v_profile_id IS NULL THEN
    INSERT INTO homeowner_profiles (
      "userId",
      "propertyType",
      "propertySize",
      "spentAmount",
      "createdAt",
      "updatedAt"
    ) VALUES (
      v_user_id,
      'Single Family',
      2500,
      0,
      NOW(),
      NOW()
    ) RETURNING id INTO v_profile_id;
    RAISE NOTICE 'Created homeowner profile: %', v_profile_id;
  END IF;

  INSERT INTO properties (
    "homeownerProfileId",
    name,
    address,
    city,
    state,
    "zipCode",
    "isPrimary",
    "createdAt",
    "updatedAt"
  ) VALUES (
    v_profile_id,
    'Main Home',
    '123 Main Street',
    'Austin',
    'TX',
    '78701',
    true,
    NOW(),
    NOW()
  ) RETURNING id INTO v_property_id;
  
  RAISE NOTICE 'Created property: %', v_property_id;
END $$;

SELECT 
  p.id as property_id,
  p.name,
  p.address,
  p.city
FROM properties p
JOIN homeowner_profiles hp ON p."homeownerProfileId" = hp.id
JOIN users u ON hp."userId" = u.id
WHERE u.email = 'homeowner@example.com';
EOSQL

echo ""
echo "✅ Done! Copy the property_id from above and use it in your booking request."
