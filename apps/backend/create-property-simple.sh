#!/bin/bash

POSTGRES_POD=$(kubectl get pods -n production -l app=postgres -o jsonpath='{.items[0].metadata.name}')

echo "Step 1: Checking user exists..."
kubectl exec -n production $POSTGRES_POD -- psql -U postgres -d contracttocozy -c "
SELECT id, email, role FROM users WHERE email = 'homeowner@example.com';"

echo ""
echo "Step 2: Creating homeowner profile..."
kubectl exec -n production $POSTGRES_POD -- psql -U postgres -d contracttocozy -c "
INSERT INTO homeowner_profiles (\"userId\", \"propertyType\", \"propertySize\", \"spentAmount\", \"createdAt\", \"updatedAt\")
SELECT id, 'Single Family', 2500, 0, NOW(), NOW()
FROM users 
WHERE email = 'homeowner@example.com'
ON CONFLICT DO NOTHING;"

echo ""
echo "Step 3: Creating property..."
kubectl exec -n production $POSTGRES_POD -- psql -U postgres -d contracttocozy -c "
INSERT INTO properties (\"homeownerProfileId\", name, address, city, state, \"zipCode\", \"isPrimary\", \"createdAt\", \"updatedAt\")
SELECT hp.id, 'Main Home', '123 Main Street', 'Austin', 'TX', '78701', true, NOW(), NOW()
FROM homeowner_profiles hp
JOIN users u ON hp.\"userId\" = u.id
WHERE u.email = 'homeowner@example.com'
RETURNING id, name, address, city;"

echo ""
echo "Step 4: Showing your property..."
kubectl exec -n production $POSTGRES_POD -- psql -U postgres -d contracttocozy -c "
SELECT 
  p.id as property_id,
  p.name,
  p.address,
  p.city
FROM properties p
JOIN homeowner_profiles hp ON p.\"homeownerProfileId\" = hp.id
JOIN users u ON hp.\"userId\" = u.id
WHERE u.email = 'homeowner@example.com';"

echo ""
echo "✅ Done! Copy the property_id (UUID) from above."
