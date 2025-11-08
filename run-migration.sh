#!/bin/bash
set -e

echo "🔑 Getting PostgreSQL password..."
DB_PASSWORD=$(kubectl get secret postgres-credentials -n production -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)

if [ -z "$DB_PASSWORD" ]; then
    echo "❌ Failed to get password"
    exit 1
fi

echo "✅ Password retrieved"
echo "🚀 Running migration..."

kubectl run prisma-migrate-$(date +%s) \
  --image=node:20-alpine \
  --rm -it \
  --restart=Never \
  -n production \
  --env="DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@postgres.production.svc.cluster.local:5432/contracttocozy?schema=public" \
  -- sh -c "
    set -e
    echo '📦 Installing dependencies...'
    apk add --no-cache openssl openssl-dev postgresql-client
    npm install -g prisma@5.22.0
    
    echo '📋 Creating schema...'
    mkdir -p /app/prisma
    cat > /app/prisma/schema.prisma << 'ENDSCHEMA'
$(cat prisma/schema.prisma)
ENDSCHEMA
    
    cd /app
    
    echo '🔍 Testing connection...'
    psql \$DATABASE_URL -c 'SELECT version();'
    
    echo '🚀 Pushing schema...'
    prisma db push --accept-data-loss --skip-generate
    
    echo ''
    echo '✅ Complete!'
    echo '📊 Tables:'
    psql \$DATABASE_URL -c '\dt' | grep public
  "

echo ""
echo "🎉 Migration successful!"
