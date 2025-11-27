# infrastructure/docker/workers/Dockerfile
# Multi-stage build for Contract-to-Cozy Workers

# ============================================================================
# Stage 1: Builder - Install dependencies and generate Prisma client
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Copy package files
COPY apps/workers/package*.json ./apps/workers/
COPY apps/backend/package*.json ./apps/backend/
COPY apps/backend/prisma ./apps/backend/prisma

# Install dependencies
WORKDIR /app/apps/workers
RUN npm ci

# Generate Prisma client (from backend schema)
WORKDIR /app/apps/backend
RUN npm ci
RUN npx prisma generate

# ============================================================================
# Stage 2: Production - Copy only necessary files
# ============================================================================
FROM node:20-alpine

WORKDIR /app

# Install OpenSSL for Prisma runtime
RUN apk add --no-cache openssl

# Copy package files and install production dependencies only
COPY apps/workers/package*.json ./
RUN npm ci --only=production

# Copy workers source and config
COPY apps/workers/src ./src
COPY apps/workers/tsconfig.json ./

# Install TypeScript and types for compilation only
RUN npm install --save-dev typescript @types/node @types/node-cron

# Compile TypeScript to JavaScript
RUN npx tsc

# Copy generated Prisma client from builder
COPY --from=builder /app/apps/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/backend/node_modules/@prisma ./node_modules/@prisma

# Remove dev dependencies after compilation
RUN npm prune --production

# Set environment
ENV NODE_ENV=production

# Run the compiled JavaScript
CMD ["node", "dist/worker.js"]