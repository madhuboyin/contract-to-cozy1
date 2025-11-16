# Step 1: Update ConfigMap
cd ~/git/contract-to-cozy1/apps/backend
kubectl create configmap prisma-schema -n production \
  --from-file=schema.prisma=prisma/schema.prisma \
  --dry-run=client -o yaml | kubectl apply -f -

# Step 2: Get password
export PASSWORD=$(kubectl get secret postgres-credentials -n production \
  -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)

# Step 3: Create migration job
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: prisma-migrate-dbupdate-$(date +%s)
  namespace: production
spec:
  ttlSecondsAfterFinished: 300
  backoffLimit: 3
  template:
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
            apk add --no-cache openssl openssl-dev postgresql-client
            npm install -g prisma@5.22.0
            mkdir -p /app/prisma
            cp /config/schema.prisma /app/prisma/schema.prisma
            cd /app
            echo "Adding sortOrder column..."
            npx prisma db push --accept-data-loss --skip-generate
            echo "✅ Migration complete"
        env:
        - name: DATABASE_URL
          value: "postgresql://postgres:${PASSWORD}@postgres.production.svc.cluster.local:5432/contracttocozy?schema=public"
        volumeMounts:
        - name: schema
          mountPath: /config
      volumes:
      - name: schema
        configMap:
          name: prisma-schema
EOF

# Step 4: Watch logs
kubectl logs -f -n production job/$(kubectl get jobs -n production --sort-by=.metadata.creationTimestamp -o name | tail -1 | cut -d/ -f2)

# Step 5: Rebuild and restart backend
cd ~/git/contract-to-cozy1/apps/backend
docker build -t YOUR_REGISTRY/backend:latest .
docker push YOUR_REGISTRY/backend:latest
kubectl rollout restart -n production deployment/api-deployment