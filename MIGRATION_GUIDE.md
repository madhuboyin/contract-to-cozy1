# Database Migration Guide
## Inspection + Handyman Schema Implementation

## 🎯 Overview

This guide walks you through implementing the database schema on your existing Raspberry Pi infrastructure.

---

## 📋 Prerequisites

- ✅ PostgreSQL 15 running on Raspberry Pi cluster
- ✅ Node.js 20 installed
- ✅ Backend application scaffolding in place
- ✅ Access to database credentials

---

## 🚀 Quick Start (5 Steps)

### **Step 1: Update Backend Dependencies**

```bash
cd ~/contract-to-cozy/apps/backend

# Add Prisma to package.json
npm install @prisma/client
npm install -D prisma @types/bcrypt bcrypt
```

### **Step 2: Initialize Prisma**

```bash
# Create prisma directory if it doesn't exist
mkdir -p prisma

# Copy the schema file
cp /path/to/schema.prisma prisma/schema.prisma
```

**Update your `.env` file:**
```bash
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@postgres.production.svc.cluster.local:5432/contracttocozy?schema=public"
```

### **Step 3: Generate Prisma Client**

```bash
npx prisma generate
```

This creates the TypeScript types in `node_modules/@prisma/client`.

### **Step 4: Create Initial Migration**

```bash
npx prisma migrate dev --name init_inspection_handyman
```

This will:
- Create migration SQL file in `prisma/migrations/`
- Apply the migration to your database
- Generate Prisma Client

### **Step 5: Seed the Database**

```bash
# Copy seed file
cp /path/to/seed.ts prisma/seed.ts

# Update package.json to add seed script
```

Add to `package.json`:
```json
{
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  },
  "scripts": {
    "seed": "npx prisma db seed"
  }
}
```

Run the seed:
```bash
npm run seed
```

---

## 📝 Detailed Steps

### **A. Environment Configuration**

Create `.env` in `apps/backend/`:

```env
# Database
DATABASE_URL="postgresql://postgres:strongpassword@postgres.production.svc.cluster.local:5432/contracttocozy?schema=public"

# Redis
REDIS_HOST=redis.production.svc.cluster.local
REDIS_PORT=6379

# JWT Secrets
JWT_SECRET=your-jwt-secret-64-chars-min
JWT_REFRESH_SECRET=your-refresh-secret-64-chars-min
SESSION_SECRET=your-session-secret-32-chars-min

# Stripe (for later)
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_secret

# Application
NODE_ENV=development
PORT=8080
```

### **B. Schema Validation**

Validate your schema before migration:

```bash
npx prisma validate
```

Expected output:
```
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma

✔ The schema is valid!
```

### **C. Database Migration Options**

#### **Option 1: Fresh Database (Recommended for Development)**

```bash
# Reset database (WARNING: Deletes all data!)
npx prisma migrate reset --force

# This will:
# 1. Drop the database
# 2. Create new database
# 3. Run all migrations
# 4. Run seed script
```

#### **Option 2: Incremental Migration (Production)**

```bash
# Create migration without applying
npx prisma migrate dev --create-only --name init_inspection_handyman

# Review the generated SQL in prisma/migrations/

# Apply migration
npx prisma migrate deploy
```

### **D. Prisma Studio (Database GUI)**

Launch Prisma's built-in database GUI:

```bash
npx prisma studio
```

Access at: `http://localhost:5555`

---

## 🧪 Testing the Schema

### **1. Test Database Connection**

Create `test-connection.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully!');
    
    const userCount = await prisma.user.count();
    console.log(`📊 Total users: ${userCount}`);
    
  } catch (error) {
    console.error('❌ Connection failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
```

Run:
```bash
npx ts-node test-connection.ts
```

### **2. Test Queries**

Create `test-queries.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testQueries() {
  // Find all inspection providers
  const inspectionProviders = await prisma.providerProfile.findMany({
    where: {
      serviceCategories: {
        has: 'INSPECTION'
      },
      status: 'ACTIVE'
    },
    include: {
      user: true,
      services: true
    }
  });
  
  console.log(`Found ${inspectionProviders.length} inspection providers`);
  
  // Find all bookings
  const bookings = await prisma.booking.findMany({
    include: {
      homeowner: true,
      provider: true,
      service: true,
      timeline: true
    }
  });
  
  console.log(`Found ${bookings.length} bookings`);
  
  // Test complex query: Find providers near a location
  const providers = await prisma.$queryRaw`
    SELECT 
      u.id,
      u."firstName",
      u."lastName",
      pp."businessName",
      pp."averageRating",
      a.latitude,
      a.longitude,
      (
        3959 * acos(
          cos(radians(30.2672)) * cos(radians(a.latitude)) * 
          cos(radians(a.longitude) - radians(-97.7431)) + 
          sin(radians(30.2672)) * sin(radians(a.latitude))
        )
      ) AS distance
    FROM users u
    JOIN provider_profiles pp ON pp."userId" = u.id
    JOIN addresses a ON a."userId" = u.id
    WHERE pp.status = 'ACTIVE'
    HAVING distance <= pp."serviceRadius"
    ORDER BY distance
    LIMIT 10
  `;
  
  console.log('Nearby providers:', providers);
}

testQueries()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

---

## 🔄 Common Migration Tasks

### **Add a New Field**

```bash
# 1. Update schema.prisma
# 2. Create migration
npx prisma migrate dev --name add_field_name

# 3. Generate client
npx prisma generate
```

### **Rename a Field**

```bash
# Prisma doesn't auto-detect renames
# Create custom migration:

npx prisma migrate dev --create-only --name rename_field

# Edit the SQL file to use ALTER TABLE RENAME COLUMN
# Then apply:
npx prisma migrate deploy
```

### **Add Indexes**

Update schema with `@@index`:

```prisma
model User {
  email String @unique
  
  @@index([email])
  @@index([role, status])
}
```

Then migrate:
```bash
npx prisma migrate dev --name add_user_indexes
```

---

## 🐛 Troubleshooting

### **Issue: "Can't reach database server"**

**Solution:**
```bash
# Test connection from backend pod
kubectl exec -it deployment/backend-deployment -n production -- \
  psql -h postgres.production.svc.cluster.local -U postgres -d contracttocozy

# If connection fails, check PostgreSQL service:
kubectl get svc -n production
kubectl logs statefulset/postgres -n production
```

### **Issue: "Schema validation failed"**

**Solution:**
```bash
# Check syntax
npx prisma validate

# Format schema
npx prisma format
```

### **Issue: "Migration failed"**

**Solution:**
```bash
# Check migration status
npx prisma migrate status

# Mark failed migration as rolled back
npx prisma migrate resolve --rolled-back MIGRATION_NAME

# Try again
npx prisma migrate dev
```

### **Issue: "Out of sync with database"**

**Solution:**
```bash
# Pull current database state
npx prisma db pull

# This updates schema.prisma to match database
# Then create migration:
npx prisma migrate dev --name sync_schema
```

---

## 📊 Monitoring Queries

### **Query Logging**

Enable in Prisma Client:

```typescript
const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'stdout',
      level: 'error',
    },
    {
      emit: 'stdout',
      level: 'info',
    },
    {
      emit: 'stdout',
      level: 'warn',
    },
  ],
});

prisma.$on('query', (e) => {
  console.log('Query: ' + e.query);
  console.log('Duration: ' + e.duration + 'ms');
});
```

### **Slow Query Analysis**

```sql
-- Enable in PostgreSQL
ALTER SYSTEM SET log_min_duration_statement = 1000; -- Log queries > 1s
SELECT pg_reload_conf();

-- View slow queries
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 20;
```

---

## 🔒 Security Checklist

- [ ] Strong passwords for database users
- [ ] SSL/TLS enabled for database connections
- [ ] Secrets stored in Kubernetes secrets (not .env)
- [ ] Database access restricted to backend pods
- [ ] Regular backups configured
- [ ] Audit logging enabled
- [ ] Query timeouts configured
- [ ] Connection pooling optimized

---

## 📈 Performance Optimization

### **Connection Pooling**

```typescript
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '?connection_limit=10&pool_timeout=20',
    },
  },
});
```

### **Query Optimization**

```typescript
// ❌ Bad: N+1 problem
const bookings = await prisma.booking.findMany();
for (const booking of bookings) {
  const user = await prisma.user.findUnique({ 
    where: { id: booking.homeownerId } 
  });
}

// ✅ Good: Use include
const bookings = await prisma.booking.findMany({
  include: {
    homeowner: true,
    provider: true,
    service: true
  }
});
```

---

## 🎯 Next Steps

1. **✅ Schema Applied** - Database is ready
2. **📝 API Development** - Build REST/GraphQL endpoints
3. **🔐 Authentication** - Implement JWT auth
4. **💳 Payments** - Integrate Stripe
5. **🔔 Real-time** - Add WebSocket support
6. **📊 Analytics** - Track usage metrics

---

## 📞 Support

**Migration Issues:**
- Check: `apps/backend/prisma/migrations/`
- Logs: `npx prisma migrate status`

**Schema Questions:**
- Refer to: `DATABASE_SCHEMA_README.md`
- Prisma Docs: https://www.prisma.io/docs

**Database Performance:**
- Monitor: Prisma Studio at `http://localhost:5555`
- Optimize: Add indexes, use pagination
