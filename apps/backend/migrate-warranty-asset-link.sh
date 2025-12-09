#!/bin/bash
# Migration Script: Link Warranties to Home Assets
# This script adds homeAssetId to Warranty model and creates the relationship

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   Warranty → Home Asset Link Migration                        ║"
echo "║   Adds: homeAssetId field and relationship to Warranty         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
NAMESPACE="production"
BACKEND_PATH="${BACKEND_PATH:-$HOME/git/contract-to-cozy1/apps/backend}"

# Check if backend path exists
if [ ! -d "$BACKEND_PATH" ]; then
    echo "❌ Backend path not found: $BACKEND_PATH"
    echo "Set BACKEND_PATH environment variable or run from correct directory"
    exit 1
fi

# Step 1: Verify schema changes
echo "📋 Step 1: Verifying schema changes..."
if ! grep -q "homeAssetId" "$BACKEND_PATH/prisma/schema.prisma"; then
    echo "❌ ERROR: Schema doesn't contain homeAssetId field in Warranty model"
    echo "Please update your schema.prisma first with the changes:"
    echo ""
    echo "In Warranty model:"
    echo "  homeAssetId        String? // Links to a specific system/appliance"
    echo "  homeAsset          HomeAsset? @relation(fields: [homeAssetId], references: [id])"
    echo "  @@index([homeAssetId])"
    echo ""
    echo "In HomeAsset model:"
    echo "  warranties  Warranty[] // Inverse relation"
    exit 1
fi

if ! grep -q "warranties.*Warranty\[\]" "$BACKEND_PATH/prisma/schema.prisma"; then
    echo "⚠️  WARNING: HomeAsset model may not have warranties relation"
    echo "Continuing anyway..."
fi

echo "✅ Schema changes detected"
echo ""

# Step 2: Create ConfigMap
echo "📦 Step 2: Creating ConfigMap with updated schema..."
kubectl create configmap prisma-schema -n $NAMESPACE \
  --from-file=schema.prisma=$BACKEND_PATH/prisma/schema.prisma \
  --dry-run=client -o yaml | kubectl apply -f -

if [ $? -eq 0 ]; then
    echo "✅ ConfigMap updated"
else
    echo "❌ Failed to create ConfigMap"
    exit 1
fi
echo ""

# Step 3: Get database password
echo "🔑 Step 3: Retrieving database credentials..."
PASSWORD=$(kubectl get secret postgres-credentials -n $NAMESPACE \
  -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)

if [ -z "$PASSWORD" ]; then
    echo "❌ Failed to retrieve database password"
    exit 1
fi

echo "✅ Credentials retrieved (${PASSWORD:0:3}***)"
echo ""

# Step 4: Create migration job
echo "🚀 Step 4: Creating migration job..."

TIMESTAMP=$(date +%s)
JOB_NAME="prisma-migrate-warranty-asset-$TIMESTAMP"

cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: $JOB_NAME
  namespace: $NAMESPACE
  labels:
    migration: warranty-home-asset-link
    timestamp: "$TIMESTAMP"
spec:
  ttlSecondsAfterFinished: 600  # Keep for 10 minutes for inspection
  backoffLimit: 2
  template:
    metadata:
      labels:
        migration: warranty-home-asset-link
    spec:
      restartPolicy: Never
      containers:
      - name: migrate
        image: node:20-alpine
        command:
          - sh
          - -c
          - |
            set -e
            
            echo "════════════════════════════════════════════════════════"
            echo "  Warranty → Home Asset Migration"
            echo "════════════════════════════════════════════════════════"
            echo ""
            
            echo "📦 Installing Prisma..."
            apk add --no-cache openssl openssl-dev postgresql-client
            npm install -g prisma@5.22.0
            
            echo "✅ Prisma installed"
            echo ""
            
            echo "📋 Setting up schema..."
            mkdir -p /app/prisma
            cp /config/schema.prisma /app/prisma/schema.prisma
            cd /app
            
            echo "✅ Schema copied"
            echo ""
            
            echo "🔍 Checking database connection..."
            if psql "\$DATABASE_URL" -c "SELECT version();" > /dev/null 2>&1; then
                echo "✅ Database connection successful"
            else
                echo "⚠️  Connection check failed, but continuing..."
            fi
            echo ""
            
            echo "📊 Current Warranty table structure:"
            psql "\$DATABASE_URL" -c "\d warranties" || echo "Table may not exist yet"
            echo ""
            
            echo "📊 Current HomeAsset table structure:"
            psql "\$DATABASE_URL" -c "\d home_assets" || echo "Table may not exist yet"
            echo ""
            
            echo "🚀 Applying schema changes..."
            echo "   - Adding homeAssetId column to Warranty"
            echo "   - Creating foreign key relationship"
            echo "   - Adding index on homeAssetId"
            echo ""
            
            npx prisma db push --accept-data-loss --skip-generate
            
            MIGRATION_STATUS=\$?
            echo ""
            
            if [ \$MIGRATION_STATUS -eq 0 ]; then
                echo "✅ Migration completed successfully!"
                echo ""
                
                echo "📊 Verifying changes..."
                echo ""
                echo "Warranty table structure:"
                psql "\$DATABASE_URL" -c "\d warranties"
                echo ""
                
                echo "Checking new column:"
                psql "\$DATABASE_URL" -c "
                SELECT column_name, data_type, is_nullable, column_default 
                FROM information_schema.columns 
                WHERE table_name = 'warranties' AND column_name = 'homeAssetId';
                "
                echo ""
                
                echo "Checking foreign key constraint:"
                psql "\$DATABASE_URL" -c "
                SELECT 
                    tc.constraint_name, 
                    tc.table_name, 
                    kcu.column_name,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name
                FROM information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                WHERE tc.table_name = 'warranties' 
                  AND tc.constraint_type = 'FOREIGN KEY'
                  AND kcu.column_name = 'homeAssetId';
                "
                echo ""
                
                echo "Checking index:"
                psql "\$DATABASE_URL" -c "
                SELECT indexname, indexdef 
                FROM pg_indexes 
                WHERE tablename = 'warranties' 
                  AND indexdef LIKE '%homeAssetId%';
                "
                echo ""
                
                echo "📈 Current data counts:"
                psql "\$DATABASE_URL" -c "
                SELECT 
                    COUNT(*) as total_warranties,
                    COUNT(homeAssetId) as warranties_with_asset,
                    COUNT(*) - COUNT(homeAssetId) as warranties_without_asset
                FROM warranties;
                "
                echo ""
                
                echo "════════════════════════════════════════════════════════"
                echo "  ✅ Migration Complete!"
                echo "════════════════════════════════════════════════════════"
                echo ""
                echo "Next steps:"
                echo "  1. Run 'npx prisma generate' locally to update types"
                echo "  2. Update frontend/backend code to use homeAssetId"
                echo "  3. Test warranty-asset linking functionality"
                echo ""
            else
                echo "❌ Migration failed with status: \$MIGRATION_STATUS"
                echo ""
                echo "Checking for errors in schema..."
                npx prisma validate || true
                exit 1
            fi
        env:
        - name: DATABASE_URL
          value: "postgresql://postgres:${PASSWORD}@postgres.${NAMESPACE}.svc.cluster.local:5432/contracttocozy?schema=public"
        volumeMounts:
        - name: schema
          mountPath: /config
      volumes:
      - name: schema
        configMap:
          name: prisma-schema
EOF

if [ $? -eq 0 ]; then
    echo "✅ Migration job created: $JOB_NAME"
else
    echo "❌ Failed to create migration job"
    exit 1
fi
echo ""

# Step 5: Watch logs
echo "📺 Step 5: Watching migration logs..."
echo "Press Ctrl+C to stop watching (job will continue in background)"
echo ""
sleep 2

kubectl logs -f -n $NAMESPACE job/$JOB_NAME 2>/dev/null || {
    echo "Waiting for pod to start..."
    sleep 3
    kubectl logs -f -n $NAMESPACE job/$JOB_NAME
}

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Migration Job Monitoring Complete"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Step 6: Check job status
echo "🔍 Checking job status..."
JOB_STATUS=$(kubectl get job $JOB_NAME -n $NAMESPACE -o jsonpath='{.status.conditions[0].type}' 2>/dev/null)

if [ "$JOB_STATUS" = "Complete" ]; then
    echo "✅ Job completed successfully!"
    echo ""
    echo "📋 Next Steps:"
    echo "   1. Generate updated Prisma types:"
    echo "      cd $BACKEND_PATH && npx prisma generate"
    echo ""
    echo "   2. Update TypeScript types in frontend"
    echo ""
    echo "   3. Rebuild and deploy backend (if types changed):"
    echo "      cd $BACKEND_PATH"
    echo "      docker build -t YOUR_REGISTRY/backend:latest ."
    echo "      docker push YOUR_REGISTRY/backend:latest"
    echo "      kubectl rollout restart deployment/api-deployment -n $NAMESPACE"
    echo ""
    echo "   4. Test warranty-asset linking:"
    echo "      - Create a warranty and link to a home asset"
    echo "      - Verify relationship in database"
    echo "      - Check frontend displays correctly"
    echo ""
elif [ "$JOB_STATUS" = "Failed" ]; then
    echo "❌ Job failed!"
    echo ""
    echo "View logs for details:"
    echo "  kubectl logs -n $NAMESPACE job/$JOB_NAME"
    echo ""
    echo "Delete failed job:"
    echo "  kubectl delete job $JOB_NAME -n $NAMESPACE"
    exit 1
else
    echo "⏳ Job still running..."
    echo ""
    echo "Check status:"
    echo "  kubectl get job $JOB_NAME -n $NAMESPACE"
    echo ""
    echo "View logs:"
    echo "  kubectl logs -f -n $NAMESPACE job/$JOB_NAME"
fi

echo ""
echo "🧹 Cleanup Commands (run after verification):"
echo "  kubectl delete job $JOB_NAME -n $NAMESPACE"
echo "  kubectl delete configmap prisma-schema -n $NAMESPACE"
echo ""
