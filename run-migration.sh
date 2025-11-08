#!/bin/bash
set -e

# Make sure we're in the backend directory
if [ ! -f "prisma/schema.prisma" ]; then
    echo "❌ Error: prisma/schema.prisma not found"
    echo "   Please run this script from: ~/git/contract-to-cozy1/apps/backend"
    exit 1
fi

echo "🔑 Getting PostgreSQL password..."
DB_PASSWORD=$(kubectl get secret postgres-credentials -n production -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)

if [ -z "$DB_PASSWORD" ]; then
    echo "❌ Failed to get password"
    exit 1
fi

echo "✅ Password retrieved"
echo "🚀 Running migration..."

# Read schema into variable
SCHEMA_CONTENT=$(cat prisma/schema.prisma)

kubectl run prisma-migrate-$(date +%s) \
  --image=node:20-alpine \
  --rm -it \
  --restart=Never \
  -n production \
  --env="DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@postgres.production.svc.cluster.local:5432/contracttocozy?schema=public" \
  --env="PGPASSWORD=${DB_PASSWORD}" \
  -- sh -c "
    set -e
    echo '📦 Installing dependencies...'
    apk add --no-cache openssl openssl-dev postgresql-client > /dev/null 2>&1
    npm install -g prisma@5.22.0 > /dev/null 2>&1
    
    echo '📋 Creating schema...'
    mkdir -p /app/prisma
    cat > /app/prisma/schema.prisma << 'ENDSCHEMA'
${SCHEMA_CONTENT}
ENDSCHEMA
    
    cd /app
    
    echo '🔍 Testing connection...'
    psql -h postgres.production.svc.cluster.local -U postgres -d contracttocozy -c 'SELECT version();' | head -3
    
    echo '🚀 Pushing schema...'
    prisma db push --accept-data-loss --skip-generate
    
    echo ''
    echo '✅ Migration complete!'
    echo ''
    echo '📊 Created tables:'
    psql -h postgres.production.svc.cluster.local -U postgres -d contracttocozy -c '\dt' | grep -E 'table.*postgres' | wc -l | xargs -I {} echo '   {} tables created'
    psql -h postgres.production.svc.cluster.local -U postgres -d contracttocozy -c '\dt' | grep -E 'public'
  "

echo ""
echo "🎉 Migration successful!"
echo ""
echo "📝 Next step: Seed the database"
echo "   npx ts-node --transpile-only prisma/seed.ts"
