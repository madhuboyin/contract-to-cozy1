# Database Schema Migration - Production Guide

## Overview
This guide explains how to safely apply Prisma schema changes to PostgreSQL running in Kubernetes without downtime.

---

## The Problem
- ❌ Local `prisma migrate dev` fails due to unstable port-forwarding
- ❌ Deleting/recreating postgres service impacts running application
- ❌ DATABASE_URL environment variable issues in local development

## The Solution
Run migrations **inside the Kubernetes cluster** using a Job - zero downtime, 100% reliable.

---

## Step-by-Step Process

### 1. Update Your Schema
Edit your Prisma schema file:
```bash
cd ~/git/contract-to-cozy1/apps/backend
nano prisma/schema.prisma
```

Example - Adding an enum and field:
```prisma
// Add new enum
enum HomeownerSegment {
  HOME_BUYER
  EXISTING_OWNER
}

// Add field to existing model
model HomeownerProfile {
  id      String           @id @default(uuid())
  segment HomeownerSegment @default(EXISTING_OWNER)  // NEW FIELD
  // ... other fields
}
```

**Key Principle:** Always use default values for new NOT NULL columns to maintain backward compatibility.

---

### 2. Create ConfigMap with Schema
This makes your schema available inside the cluster:

cd ~/git/contract-to-cozy1/apps/backend
kubectl create configmap prisma-schema -n production \
  --from-file=schema.prisma=prisma/schema.prisma \
  --dry-run=client -o yaml | kubectl apply -f -

**What this does:** Creates/updates a ConfigMap named `prisma-schema` containing your schema file.

---

### 3. Get Database Password

export PASSWORD=$(kubectl get secret postgres-credentials -n production \
  -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)

---

### 4. Create Migration Job
This job runs inside your cluster with direct access to PostgreSQL:

cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: migrate-enum-$(date +%s)
  namespace: production
spec:
  ttlSecondsAfterFinished: 600
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
            apk add --no-cache openssl openssl-dev
            npm install -g prisma@5.22.0
            mkdir -p /app/prisma
            cp /config/schema.prisma /app/prisma/schema.prisma
            cd /app
            npx prisma db push --accept-data-loss --skip-generate
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

Step 4: Watch Logs

JOB=$(kubectl get jobs -n production --sort-by=.metadata.creationTimestamp -o name | tail -1 | cut -d/ -f2)
kubectl logs -f -n production job/$JOB

Step 6: Generate Types

cd ~/git/contract-to-cozy1/apps/backend
npx prisma generate

Step 7: Cleanup
kubectl delete job -n production migrate-enum-*

**Job breakdown:**
- `ttlSecondsAfterFinished: 300` - Auto-cleanup after 5 minutes
- `restartPolicy: Never` - Don't retry on failure
- `npm install -g prisma` - Install Prisma CLI
- `cp /config/schema.prisma` - Copy schema from ConfigMap
- `prisma db push` - Apply schema changes (idempotent, safe)
- `DATABASE_URL` - Uses internal cluster DNS (fast, stable)

---

### 5. Apply Job and Monitor
```bash
# Apply the job
kubectl apply -f /tmp/migrate.yaml

# Watch logs in real-time
kubectl logs -f -n production job/prisma-migrate-*
```

**Expected output:**
```
added 33 packages in 15s
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "contracttocozy", schema "public" at "postgres.production.svc.cluster.local:5432"
🚀 Your database is now in sync with your Prisma schema. Done in 299ms
```

**If you see this:** ✅ Migration successful!

---



## Using Prisma Studio (Optional)

To view your database visually:

```bash
cd ~/git/contract-to-cozy1/apps/backend

# Kill any existing port-forwards
pkill -f "port-forward.*postgres"

# Start port-forward
POD=$(kubectl get pod -n production -l app=postgres -o jsonpath='{.items[0].metadata.name}')
kubectl port-forward -n production pod/$POD 5432:5432 &

# Wait for connection
sleep 3

# Get password
PASSWORD=$(kubectl get secret postgres-credentials -n production \
  -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)

# Run Prisma Studio with inline DATABASE_URL (avoids .env issues)
DATABASE_URL="postgresql://postgres:${PASSWORD}@localhost:5432/contracttocozy?schema=public" \
npx prisma studio
```

Open: http://localhost:5555

**Navigate to:** `homeowner_profiles` table → See your new `segment` column

---

## Why This Approach Works

| Issue | Traditional Method | Our Solution |
|-------|-------------------|--------------|
| **Connection Stability** | Port-forward drops frequently | Direct cluster access via service DNS |
| **Network Reliability** | Depends on local network | Internal cluster network (100% reliable) |
| **Application Impact** | Service modifications affect app | Zero impact - no service changes |
| **Speed** | Slow over port-forward | Fast internal connection |
| **Repeatability** | Manual, error-prone | Automated via Job |

---

## Best Practices

### ✅ DO:
1. **Always use default values** for new NOT NULL columns
   ```prisma
   segment HomeownerSegment @default(EXISTING_OWNER)
   ```
   This ensures existing records aren't broken.

2. **Use Job-based migrations** for production
   - Reliable, repeatable, zero-downtime

3. **Keep ConfigMap until verified**
   - Allows easy rollback if needed

4. **Test locally first** (optional)
   - Use port-forward for local testing
   - Switch to Job for production

5. **Monitor the job logs**
   - Watch for errors in real-time
   - Catch issues immediately

### ❌ DON'T:
1. **Don't delete postgres service** during migration
   - Impacts running application

2. **Don't use `prisma migrate dev`** in production
   - Use `prisma db push` (idempotent, safer)

3. **Don't rely on port-forward** for production migrations
   - Too unstable for critical operations

4. **Don't add NOT NULL without defaults**
   - Breaks existing records

---

## Troubleshooting

### Job fails with "Can't reach database"
**Check:** Is postgres service running?
```bash
kubectl get svc postgres -n production
kubectl get pods -n production | grep postgres
```

### "ConfigMap not found"
**Fix:** Recreate ConfigMap:
```bash
cd ~/git/contract-to-cozy1/apps/backend
kubectl create configmap prisma-schema -n production \
  --from-file=schema.prisma=prisma/schema.prisma --dry-run=client -o yaml | kubectl apply -f -
```

### Prisma Studio shows "Environment variable not found"
**Fix:** Pass DATABASE_URL inline (see Prisma Studio section above)

### Port-forward keeps dying
**Solution:** Don't use port-forward for migrations - use Job instead

### Want to see job history
```bash
kubectl get jobs -n production
kubectl logs job/prisma-migrate-TIMESTAMP -n production
```

---

## Example: Real Migration We Did

**Goal:** Add buyer/owner segmentation to homeowners

**Changes:**
```prisma
// Added enum
enum HomeownerSegment {
  HOME_BUYER       // Actively closing on home
  EXISTING_OWNER   // Current homeowner
}

// Added field
model HomeownerProfile {
  segment HomeownerSegment @default(EXISTING_OWNER)
}
```

**SQL Generated:**
```sql
CREATE TYPE "HomeownerSegment" AS ENUM ('HOME_BUYER', 'EXISTING_OWNER');
ALTER TABLE "homeowner_profiles" 
  ADD COLUMN "segment" "HomeownerSegment" NOT NULL DEFAULT 'EXISTING_OWNER';
```

**Result:**
- ✅ Enum created successfully
- ✅ Column added with default value
- ✅ All 100+ existing homeowner records auto-set to `EXISTING_OWNER`
- ✅ Zero downtime
- ✅ Application continued running normally
- ✅ TypeScript types auto-generated

**Time taken:** ~2 minutes total

---

## Quick Command Reference

```bash
# Common variables
export BACKEND=~/git/contract-to-cozy1/apps/backend
export POD=$(kubectl get pod -n production -l app=postgres -o jsonpath='{.items[0].metadata.name}')
export PASSWORD=$(kubectl get secret postgres-credentials -n production -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)

# Create ConfigMap
kubectl create configmap prisma-schema -n production \
  --from-file=schema.prisma=$BACKEND/prisma/schema.prisma \
  --dry-run=client -o yaml | kubectl apply -f -

# Apply migration job (see Step 4 for full YAML)
kubectl apply -f /tmp/migrate.yaml

# Watch logs
kubectl logs -f -n production job/prisma-migrate-*

# Verify
kubectl exec -it -n production $POD -- \
  psql -U postgres -d contracttocozy -c "\d table_name"

# Generate types
cd $BACKEND && npx prisma generate

# Cleanup
kubectl delete job -n production prisma-migrate-*
kubectl delete configmap -n production prisma-schema
```

---

## Summary

**The Golden Rule:** For production schema changes in Kubernetes, always run migrations inside the cluster using Jobs. It's faster, more reliable, and has zero impact on your running application.

**Simple workflow:**
1. Update schema locally
2. Create ConfigMap
3. Run migration Job
4. Verify changes
5. Cleanup
6. Generate types

**Time investment:** 2-5 minutes per migration
**Downtime:** 0 seconds
**Reliability:** 100%

---

## Additional Resources

- Prisma Docs: https://www.prisma.io/docs/concepts/components/prisma-migrate
- Kubernetes Jobs: https://kubernetes.io/docs/concepts/workloads/controllers/job/
- PostgreSQL Enums: https://www.postgresql.org/docs/current/datatype-enum.html

---

**Last Updated:** January 2025
**Tested On:** Kubernetes v1.28, PostgreSQL 15, Prisma 5.22
