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

# Set working directory to /app/apps/workers
WORKDIR /app/apps/workers

# Install OpenSSL for Prisma runtime
RUN apk add --no-cache openssl

# Copy package files and install production dependencies
COPY apps/workers/package*.json ./
RUN npm ci --only=production

# Copy generated Prisma client from builder
COPY --from=builder /app/apps/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/backend/node_modules/@prisma ./node_modules/@prisma

# Copy backend source to correct relative path
COPY apps/backend/src ../../backend/src

# Copy workers source and configs
COPY apps/workers/src ./src
COPY apps/workers/tsconfig.docker.json ./tsconfig.json

# Install TypeScript and types for compilation
RUN npm install --save-dev typescript @types/node @types/node-cron

# Compile TypeScript to JavaScript using tsconfig.docker.json
RUN npx tsc

# Remove dev dependencies after compilation
RUN npm prune --production

# Set environment
ENV NODE_ENV=production

# Run the compiled JavaScript
CMD ["node", "dist/src/worker.js"]
