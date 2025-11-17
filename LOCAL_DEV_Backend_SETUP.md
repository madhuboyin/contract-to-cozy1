# Local Development Environment Setup - Backend

**Purpose:** Set up isolated local development environment separate from production

---

## 📊 Architecture Overview

```
Local Development (Your Laptop)
├── Database: contract_to_cozy_dev (PostgreSQL)
├── Backend: http://localhost:8080
└── .env: Local config (NOT in git)

Production (Raspberry Pi + Kubernetes)
├── Database: contracttocozy (PostgreSQL)
├── Backend: api.contracttocozy.com (in K8s pod)
├── .env: Production config (NOT in git)
└── ConfigMap: Sets NODE_ENV=production (overrides everything)

Key Points:
✅ .env is gitignored - each environment has its own
✅ Local and production .env are completely different
✅ No conflicts - they never interact
```

---

## ⚡ Prerequisites

### Install PostgreSQL (if not already installed)

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt install postgresql
sudo systemctl start postgresql
```

**Windows:**
Download and install from: https://www.postgresql.org/download/windows/

**Verify:**
```bash
psql --version
# Should show: psql (PostgreSQL) 15.x or higher
```

---

## 🚀 Setup Steps

### Step 1: Create Local Development Database

```bash
# Create new database for local development
createdb contract_to_cozy_dev
```

**✅ Validation:**
```bash
# List databases - should show contract_to_cozy_dev
psql -l | grep contract_to_cozy_dev
```

---

### Step 2: Configure Backend for Local Development

```bash
cd apps/backend

# Create .env file for local development
cat > .env << 'EOF'
PORT=8080
DATABASE_URL=postgresql://YOUR_USERNAME@localhost:5432/contract_to_cozy_dev?schema=public
JWT_SECRET=local-dev-secret-key-2024
JWT_REFRESH_SECRET=local-dev-refresh-key-2024
CORS_ORIGIN=http://localhost:3000
EOF
```

**⚠️ Important:** Replace `YOUR_USERNAME` with your PostgreSQL username (usually your system username).

**✅ Validation:**
```bash
# Verify .env contains local dev database
cat .env | grep DATABASE_URL
# Should show: ...contract_to_cozy_dev
```

---

### Step 3: Initialize Database Schema

```bash
cd apps/backend

# Install dependencies (first time only)
npm install

# Generate Prisma client
npx prisma generate

# Push schema to database (creates tables)
npx prisma db push
```

**✅ Validation:**
```bash
# Check tables were created
psql contract_to_cozy_dev -c "\dt"
# Should show ~23 tables (users, properties, bookings, etc.)
```

---

### Step 4: Seed Test Data

```bash
cd apps/backend

# Seed database with test users and data
npx prisma db seed
```

**✅ Validation:**
```bash
# Verify test users were created
psql contract_to_cozy_dev -c "SELECT email, role FROM users;"

# Should show:
#       email           |   role    
# ----------------------+-----------
#  sarah@example.com    | HOMEOWNER
#  mike@inspect.com     | PROVIDER
#  tom@fixitpro.com     | PROVIDER
```

---

### Step 5: Start Backend Server

```bash
cd apps/backend

# Start backend in development mode
npm run dev
```

**✅ Validation:**
```bash
# Should see in terminal:
🚀 Server running on port 8080
📊 Environment: development
📊 Database: contract_to_cozy_dev  ← Must show this!

# Test health endpoint
curl http://localhost:8080/api/health
# Should return: {"status":"ok"}
```

---

### Step 6: Test Login

**Start frontend (in new terminal):**
```bash
cd apps/frontend
npm run dev
```

**Test in browser:**
1. Go to: `http://localhost:3000/login`
2. Email: `sarah@example.com`
3. Password: `password123`
4. Click "Log In"
5. Should redirect to dashboard ✅

---

## 🎯 Test User Accounts

| Email | Password | Role | Use For |
|-------|----------|------|---------|
| sarah@example.com | password123 | HOMEOWNER | Testing homeowner features |
| mike@inspect.com | password123 | PROVIDER | Testing inspector/provider features |
| tom@fixitpro.com | password123 | PROVIDER | Testing handyman features |

---

## 🔧 Troubleshooting

### Issue: Backend connects to wrong database

**Symptom:** Login fails with "User denied access to contracttocozy"

**Fix:**
```bash
cd apps/backend

# Check .env points to correct database
cat .env | grep DATABASE_URL
# Must show: contract_to_cozy_dev (NOT contracttocozy)

# If wrong, fix .env (Step 2)
# Then regenerate Prisma and restart:
npx prisma generate
npm run dev
```

---

### Issue: Login fails with "Invalid email or password"

**Symptom:** Backend runs but login doesn't work

**Fix:**
```bash
# Verify database has users
psql contract_to_cozy_dev -c "SELECT email FROM users;"

# If empty, re-run seed:
npx prisma db seed

# Restart backend
npm run dev
```

---

### Issue: "command not found: psql" or "createdb"

**Fix:**
```bash
# Use full path to PostgreSQL commands:

# macOS (Homebrew)
/usr/local/opt/postgresql@15/bin/createdb contract_to_cozy_dev
/usr/local/opt/postgresql@15/bin/psql -l

# Linux
/usr/bin/createdb contract_to_cozy_dev
/usr/bin/psql -l
```

---

### Issue: Database connection refused

**Fix:**
```bash
# Check PostgreSQL is running

# macOS
brew services start postgresql@15

# Linux
sudo systemctl start postgresql
```

---

## 📋 Daily Development Workflow

**Start working:**
```bash
# Terminal 1 - Backend
cd apps/backend
npm run dev

# Terminal 2 - Frontend
cd apps/frontend
npm run dev

# Browser: http://localhost:3000
# Login: sarah@example.com / password123
```

**Make changes:**
- Edit code in your IDE
- Changes auto-reload
- Test with local database (contract_to_cozy_dev)
- Production database is never affected ✅

**Commit changes:**
```bash
git add .
git commit -m "Your changes"
git push origin main

# Note: .env is NOT committed (gitignored)
```

---

## 🔄 Database Management

### Reset Local Database

```bash
cd apps/backend

# Option 1: Reset with existing database
npx prisma db push --force-reset
npx prisma db seed

# Option 2: Full recreate
dropdb contract_to_cozy_dev
createdb contract_to_cozy_dev
npx prisma db push
npx prisma db seed
```

### View Database

```bash
# Open Prisma Studio (GUI)
npx prisma studio

# Opens browser at: http://localhost:5555
# Browse tables, view/edit data visually
```

---

## 📚 Useful Commands

### Database Commands

```bash
# List all databases
psql -l

# Connect to database
psql contract_to_cozy_dev

# Run SQL query
psql contract_to_cozy_dev -c "SELECT * FROM users;"
```

### Prisma Commands

```bash
# Generate Prisma client
npx prisma generate

# Push schema changes
npx prisma db push

# Seed database
npx prisma db seed

# Open Prisma Studio
npx prisma studio
```

---

## ✅ Setup Verification Checklist

- [ ] PostgreSQL installed and running
- [ ] Database `contract_to_cozy_dev` created
- [ ] `.env` file created with correct DATABASE_URL
- [ ] `.env` is gitignored (not shown in `git status`)
- [ ] Dependencies installed (`node_modules` exists)
- [ ] Schema pushed (~23 tables created)
- [ ] Test data seeded (3 users created)
- [ ] Backend starts on port 8080
- [ ] Backend connects to `contract_to_cozy_dev` (check logs)
- [ ] Health check responds: `curl localhost:8080/api/health`
- [ ] Login works with `sarah@example.com`

**All checked? You're ready to develop! 🚀**

---

## 🆘 Getting Help

If you encounter issues not covered here:

1. Check the troubleshooting section above
2. Search existing issues in the repository
3. Ask in the team Slack channel
4. Contact the tech lead

**When asking for help, include:**
- Error message (full stack trace)
- Output of: `cat apps/backend/.env | grep DATABASE_URL`
- Output of: `npm run dev` (first 20 lines)

---

**Version:** 1.0
**Last Updated:** November 2024
**Maintainer:** Engineering Team
