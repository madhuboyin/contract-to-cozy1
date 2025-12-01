#!/bin/bash
set -e

# Get password
PASSWORD=$(kubectl get secret postgres-credentials -n production \
  -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)

# Generate timestamp
TIMESTAMP=$(date +%s)

# Create temp file with substitutions
sed -e "s/PASSWORD_HERE/${PASSWORD}/g" \
    -e "s/TIMESTAMP/${TIMESTAMP}/g" \
    migrate-job.yaml > /tmp/migrate-job-final.yaml

# Apply
kubectl apply -f /tmp/migrate-job-final.yaml

echo ""
echo "✅ Job created: prisma-migrate-homeasset-${TIMESTAMP}"
echo ""
echo "📝 Watch logs:"
echo "kubectl logs -f -n production job/prisma-migrate-homeasset-${TIMESTAMP}"

# Auto-follow logs
sleep 2
kubectl logs -f -n production job/prisma-migrate-homeasset-${TIMESTAMP}
