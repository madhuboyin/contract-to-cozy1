#!/bin/bash

################################################################################
# Fix Backend Dockerfile - Remove problematic Prisma copy line
################################################################################

set -e

echo "Fixing backend Dockerfile..."

# Fix the backend Dockerfile - remove the problematic line and replace with working version
cat > infrastructure/docker/backend/Dockerfile << 'EOF'
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

ENV NODE_ENV=production

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

# Copy Prisma files (now they exist!)
COPY --from=builder /app/prisma ./prisma

# Set correct permissions
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

CMD ["node", "dist/index.js"]
EOF

echo "✓ Backend Dockerfile fixed"

# Also fix workers Dockerfile while we're at it
cat > infrastructure/docker/workers/Dockerfile << 'EOF'
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

ENV NODE_ENV=production

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

echo "✓ Workers Dockerfile fixed"
echo ""
echo "Now retry: ./build-and-push.sh latest"
