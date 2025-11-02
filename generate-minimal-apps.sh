#!/bin/bash

################################################################################
# Contract to Cozy - Generate Minimal Applications
# 
# This creates minimal working applications for frontend, backend, and workers
# so you can build Docker images immediately.
#
# You can replace these with your real application code later.
#
# Usage: ./generate-minimal-apps.sh
################################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}=================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_header "Generating Minimal Applications"
echo ""

# Create directories
mkdir -p apps/frontend/src/app/api/health
mkdir -p apps/frontend/public
mkdir -p apps/backend/src
mkdir -p apps/backend/prisma
mkdir -p apps/workers/src

print_header "Step 1: Creating Frontend (Next.js)"

# Frontend package.json
cat > apps/frontend/package.json << 'EOF'
{
  "name": "contract-to-cozy-frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.0.4",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.5",
    "@types/react": "^18.2.45",
    "@types/react-dom": "^18.2.18",
    "typescript": "^5.3.3"
  }
}
EOF

# Frontend next.config.js
cat > apps/frontend/next.config.js << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  swcMinify: true,
}

module.exports = nextConfig
EOF

# Frontend tsconfig.json
cat > apps/frontend/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

# Frontend app layout
cat > apps/frontend/src/app/layout.tsx << 'EOF'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contract to Cozy',
  description: 'Transform Contracts into Cozy Homes',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
EOF

# Frontend home page
cat > apps/frontend/src/app/page.tsx << 'EOF'
export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>🏠 Contract to Cozy</h1>
      <p>Welcome to Contract to Cozy!</p>
      <p>Status: <strong style={{ color: 'green' }}>Running</strong></p>
      <p>This is a minimal placeholder application.</p>
      <p>Replace this with your actual frontend code.</p>
    </main>
  )
}
EOF

# Health check endpoint
cat > apps/frontend/src/app/api/health/route.ts << 'EOF'
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ 
    status: 'healthy',
    service: 'frontend',
    timestamp: new Date().toISOString()
  })
}
EOF

# .gitignore for frontend
cat > apps/frontend/.gitignore << 'EOF'
# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# local env files
.env*.local

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
EOF

print_success "Frontend created"

print_header "Step 2: Creating Backend (Node.js API)"

# Backend package.json
cat > apps/backend/package.json << 'EOF'
{
  "name": "contract-to-cozy-backend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "nodemon src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "@prisma/client": "^5.7.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/node": "^20.10.5",
    "typescript": "^5.3.3",
    "nodemon": "^3.0.2",
    "ts-node": "^10.9.2",
    "prisma": "^5.7.1"
  }
}
EOF

# Backend tsconfig.json
cat > apps/backend/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# Backend main file
cat > apps/backend/src/index.ts << 'EOF'
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Ready check endpoint
app.get('/api/ready', (req: Request, res: Response) => {
  // Add database connectivity checks here if needed
  res.json({
    status: 'ready',
    service: 'backend',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Contract to Cozy API',
    version: '1.0.0',
    status: 'running'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});
EOF

# Backend .env.example
cat > apps/backend/.env.example << 'EOF'
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://postgres:password@postgres:5432/contracttocozy
REDIS_HOST=redis
REDIS_PORT=6379
JWT_SECRET=your-jwt-secret-here
EOF

# Prisma schema (minimal)
cat > apps/backend/prisma/schema.prisma << 'EOF'
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
EOF

# Backend .gitignore
cat > apps/backend/.gitignore << 'EOF'
# dependencies
/node_modules

# build
/dist

# env
.env
.env.local

# logs
*.log

# misc
.DS_Store
EOF

print_success "Backend created"

print_header "Step 3: Creating Workers"

# Workers package.json
cat > apps/workers/package.json << 'EOF'
{
  "name": "contract-to-cozy-workers",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "nodemon src/worker.ts",
    "build": "tsc",
    "start": "node dist/worker.js"
  },
  "dependencies": {
    "@prisma/client": "^5.7.1",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.10.5",
    "typescript": "^5.3.3",
    "nodemon": "^3.0.2",
    "ts-node": "^10.9.2",
    "prisma": "^5.7.1"
  }
}
EOF

# Workers tsconfig.json
cat > apps/workers/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# Workers main file
cat > apps/workers/src/worker.ts << 'EOF'
import dotenv from 'dotenv';

dotenv.config();

console.log('🔧 Contract to Cozy Worker starting...');
console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);

// Placeholder worker - replace with your actual worker logic
const runWorker = async () => {
  console.log('✓ Worker initialized');
  console.log('⏳ Worker running... (placeholder)');
  
  // Keep the process alive
  setInterval(() => {
    console.log(`💓 Worker heartbeat: ${new Date().toISOString()}`);
  }, 60000); // Every minute
};

runWorker().catch((error) => {
  console.error('Worker error:', error);
  process.exit(1);
});
EOF

# Workers .gitignore
cat > apps/workers/.gitignore << 'EOF'
# dependencies
/node_modules

# build
/dist

# env
.env
.env.local

# logs
*.log

# misc
.DS_Store
EOF

print_success "Workers created"

print_header "Step 4: Installing Dependencies"

echo ""
echo -e "${YELLOW}Installing npm dependencies (this may take a few minutes)...${NC}"
echo ""

# Frontend
echo "Installing frontend dependencies..."
cd apps/frontend
npm install
npm run build || echo "Build will be done by Docker"
cd ../..
print_success "Frontend dependencies installed"

# Backend
echo "Installing backend dependencies..."
cd apps/backend
npm install
npx prisma generate || echo "Prisma will be generated by Docker"
npm run build || echo "Build will be done by Docker"
cd ../..
print_success "Backend dependencies installed"

# Workers
echo "Installing workers dependencies..."
cd apps/workers
npm install
npm run build || echo "Build will be done by Docker"
cd ../..
print_success "Workers dependencies installed"

print_header "Summary"
echo ""
print_success "All minimal applications created and dependencies installed!"
echo ""
echo -e "${BLUE}Applications created:${NC}"
echo "  ✅ apps/frontend/ - Next.js 14 minimal app"
echo "  ✅ apps/backend/ - Express API with TypeScript"
echo "  ✅ apps/workers/ - Background worker with TypeScript"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Build Docker images: ./build-and-push.sh latest"
echo "2. Deploy to Kubernetes: kubectl apply -k infrastructure/kubernetes/overlays/raspberry-pi/"
echo "3. Replace these placeholder apps with your actual code"
echo ""
print_success "Ready to build Docker images!"
