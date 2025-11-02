#!/bin/bash

################################################################################
# Contract to Cozy - Generate Docker Configurations
# 
# This script generates all Docker files directly in your repository.
# No downloads needed!
#
# Usage: ./generate-docker-files.sh
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}=================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_header "Contract to Cozy - Docker Files Generator"
echo ""

# Check if in repository root
if [ ! -d "infrastructure" ]; then
    echo -e "${YELLOW}Creating infrastructure directory...${NC}"
    mkdir -p infrastructure
fi

DOCKER_DIR="infrastructure/docker"

print_header "Step 1: Creating Directory Structure"

mkdir -p "$DOCKER_DIR/frontend"
mkdir -p "$DOCKER_DIR/backend"
mkdir -p "$DOCKER_DIR/workers"

print_success "Directory structure created"

print_header "Step 2: Generating Frontend Dockerfile"

cat > "$DOCKER_DIR/frontend/Dockerfile" << 'EOF'
# Frontend Dockerfile - Next.js 14
# Multi-stage build optimized for Raspberry Pi (ARM64)

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Build Next.js app
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production

RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]
EOF
print_success "Created frontend/Dockerfile"

cat > "$DOCKER_DIR/frontend/.dockerignore" << 'EOF'
# Dependencies
node_modules
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Next.js
.next/
out/
build/
dist/

# Testing
coverage/
.nyc_output/
*.test.js
*.test.ts
*.spec.js
*.spec.ts
__tests__/
__mocks__/

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~
.DS_Store

# Git
.git/
.gitignore
.gitattributes

# Documentation
README.md
CHANGELOG.md
docs/

# CI/CD
.github/
.gitlab-ci.yml
.travis.yml

# Docker
Dockerfile
.dockerignore
docker-compose.yml

# Misc
*.log
*.md
.eslintcache
EOF
print_success "Created frontend/.dockerignore"

print_header "Step 3: Generating Backend Dockerfile"

cat > "$DOCKER_DIR/backend/Dockerfile" << 'EOF'
# Backend Dockerfile - Node.js API
# Multi-stage build optimized for Raspberry Pi (ARM64)

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

# Install runtime dependencies only
RUN apk add --no-cache \
    postgresql-client \
    curl

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Copy Prisma files if using Prisma
COPY --from=builder /app/prisma ./prisma 2>/dev/null || true

# Set correct permissions
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

CMD ["node", "dist/index.js"]
EOF
print_success "Created backend/Dockerfile"

cat > "$DOCKER_DIR/backend/.dockerignore" << 'EOF'
# Dependencies
node_modules
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build
dist/
build/
*.tsbuildinfo

# Testing
coverage/
.nyc_output/
*.test.js
*.test.ts
*.spec.js
*.spec.ts
__tests__/
__mocks__/
tests/

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~
.DS_Store

# Git
.git/
.gitignore
.gitattributes

# Documentation
README.md
CHANGELOG.md
docs/

# CI/CD
.github/
.gitlab-ci.yml
.travis.yml

# Docker
Dockerfile
.dockerignore
docker-compose.yml

# Misc
*.log
*.md
.eslintcache

# Source maps
*.map
EOF
print_success "Created backend/.dockerignore"

print_header "Step 4: Generating Workers Dockerfile"

cat > "$DOCKER_DIR/workers/Dockerfile" << 'EOF'
# Workers Dockerfile - Background Jobs
# Multi-stage build optimized for Raspberry Pi (ARM64)

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

# Install runtime dependencies
RUN apk add --no-cache \
    postgresql-client \
    curl

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Copy Prisma files if using Prisma
COPY --from=builder /app/prisma ./prisma 2>/dev/null || true

# Set correct permissions
RUN chown -R nodejs:nodejs /app

USER nodejs

# Workers don't expose ports but we can add a health endpoint
EXPOSE 9090

# Health check for worker process
HEALTHCHECK --interval=60s --timeout=3s --start-period=60s --retries=3 \
  CMD pgrep -f "node dist/worker.js" || exit 1

CMD ["node", "dist/worker.js"]
EOF
print_success "Created workers/Dockerfile"

print_header "Step 5: Generating Build Script"

cat > "build-and-push.sh" << 'EOFSCRIPT'
#!/bin/bash

################################################################################
# Contract to Cozy - Docker Image Build & Push Script
#
# This script builds and pushes all Docker images to GitHub Container Registry
#
# Usage: ./build-and-push.sh [version]
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
REGISTRY="ghcr.io"
USERNAME="madhuboyin"
REPO="contract-to-cozy"
VERSION="${1:-latest}"
PLATFORM="linux/arm64"

print_header() {
    echo -e "${BLUE}=================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running!"
    exit 1
fi

print_header "Contract to Cozy - Docker Build Script"
echo ""
print_info "Registry: $REGISTRY"
print_info "Username: $USERNAME"
print_info "Version: $VERSION"
print_info "Platform: $PLATFORM"
echo ""

# Build Frontend
print_header "Building Frontend (Next.js)"

docker build \
    --platform $PLATFORM \
    -t $REGISTRY/$USERNAME/$REPO/frontend:$VERSION \
    -t $REGISTRY/$USERNAME/$REPO/frontend:latest \
    -f infrastructure/docker/frontend/Dockerfile \
    apps/frontend/ || {
    print_error "Frontend build failed!"
    exit 1
}

print_success "Frontend built successfully"

# Build Backend
print_header "Building Backend (Node.js API)"

docker build \
    --platform $PLATFORM \
    -t $REGISTRY/$USERNAME/$REPO/backend:$VERSION \
    -t $REGISTRY/$USERNAME/$REPO/backend:latest \
    -f infrastructure/docker/backend/Dockerfile \
    apps/backend/ || {
    print_error "Backend build failed!"
    exit 1
}

print_success "Backend built successfully"

# Build Workers
print_header "Building Workers"

docker build \
    --platform $PLATFORM \
    -t $REGISTRY/$USERNAME/$REPO/workers:$VERSION \
    -t $REGISTRY/$USERNAME/$REPO/workers:latest \
    -f infrastructure/docker/workers/Dockerfile \
    apps/workers/ || {
    print_error "Workers build failed!"
    exit 1
}

print_success "Workers built successfully"

# Push Images
print_header "Pushing Images to Registry"

echo "Pushing frontend..."
docker push $REGISTRY/$USERNAME/$REPO/frontend:$VERSION
docker push $REGISTRY/$USERNAME/$REPO/frontend:latest
print_success "Frontend pushed"

echo "Pushing backend..."
docker push $REGISTRY/$USERNAME/$REPO/backend:$VERSION
docker push $REGISTRY/$USERNAME/$REPO/backend:latest
print_success "Backend pushed"

echo "Pushing workers..."
docker push $REGISTRY/$USERNAME/$REPO/workers:$VERSION
docker push $REGISTRY/$USERNAME/$REPO/workers:latest
print_success "Workers pushed"

# Summary
print_header "Build Complete!"
echo ""
print_success "All images built and pushed successfully!"
echo ""
echo "Images:"
echo "  - $REGISTRY/$USERNAME/$REPO/frontend:$VERSION"
echo "  - $REGISTRY/$USERNAME/$REPO/backend:$VERSION"
echo "  - $REGISTRY/$USERNAME/$REPO/workers:$VERSION"
echo ""
echo "Next steps:"
echo "  kubectl apply -k infrastructure/kubernetes/overlays/raspberry-pi/"
echo ""
print_success "Done!"
EOFSCRIPT

chmod +x build-and-push.sh
print_success "Created build-and-push.sh"

print_header "Step 6: Generating Docker Compose"

cat > "docker-compose.yml" << 'EOFCOMPOSE'
version: '3.9'

services:
  postgres:
    image: postgres:15-alpine
    container_name: contracttocozy-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: devpassword
      POSTGRES_DB: contracttocozy
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: contracttocozy-redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  backend:
    build:
      context: ./apps/backend
      dockerfile: ../../infrastructure/docker/backend/Dockerfile
    container_name: contracttocozy-backend
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      NODE_ENV: development
      PORT: 8080
      DATABASE_URL: postgresql://postgres:devpassword@postgres:5432/contracttocozy
      REDIS_HOST: redis
      REDIS_PORT: 6379
      JWT_SECRET: dev-jwt-secret
      JWT_REFRESH_SECRET: dev-refresh-secret
      SESSION_SECRET: dev-session-secret
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./apps/backend:/app
      - /app/node_modules
    command: npm run dev

  frontend:
    build:
      context: ./apps/frontend
      dockerfile: ../../infrastructure/docker/frontend/Dockerfile
      target: builder
    container_name: contracttocozy-frontend
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      NEXT_PUBLIC_API_URL: http://localhost:8080
    depends_on:
      - backend
    volumes:
      - ./apps/frontend:/app
      - /app/node_modules
      - /app/.next
    command: npm run dev

  workers:
    build:
      context: ./apps/workers
      dockerfile: ../../infrastructure/docker/workers/Dockerfile
    container_name: contracttocozy-workers
    restart: unless-stopped
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://postgres:devpassword@postgres:5432/contracttocozy
      REDIS_HOST: redis
      REDIS_PORT: 6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./apps/workers:/app
      - /app/node_modules
    command: npm run dev

volumes:
  postgres-data:
  redis-data:

networks:
  default:
    name: contracttocozy-network
EOFCOMPOSE
print_success "Created docker-compose.yml"

print_header "Summary"
echo ""
print_success "All Docker files generated!"
echo ""
echo "Files created:"
find "$DOCKER_DIR" -type f | sort
echo "  ./build-and-push.sh"
echo "  ./docker-compose.yml"
echo ""
echo -e "${BLUE}Total files: $(find "$DOCKER_DIR" -type f | wc -l | tr -d ' ') + 2${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Setup GitHub Container Registry:"
echo "   echo YOUR_TOKEN | docker login ghcr.io -u madhuboyin --password-stdin"
echo ""
echo "2. Build and push images:"
echo "   ./build-and-push.sh latest"
echo ""
echo "3. Deploy to Kubernetes:"
echo "   kubectl apply -k infrastructure/kubernetes/overlays/raspberry-pi/"
echo ""
print_success "Done!"
