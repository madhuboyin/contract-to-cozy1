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

# Create backend directory structure
RUN mkdir -p ../../backend/src/utils ../../backend/src/config

# Copy specific backend files workers needs
COPY apps/backend/src/utils/riskCalculator.util.ts ../../backend/src/utils/
COPY apps/backend/src/config/risk-constants.ts ../../backend/src/config/

# Copy workers source and config
COPY apps/workers/src ./src
COPY apps/workers/tsconfig.docker.json ./tsconfig.json

# Install TypeScript and types for compilation
RUN npm install --save-dev typescript @types/node @types/node-cron

# Debug: Verify files exist
RUN echo "=== Checking file structure ===" && \
    ls -la ../../backend/src/utils/ && \
    ls -la ../../backend/src/config/ && \
    echo "=== Current directory ===" && \
    pwd && \
    echo "=== tsconfig.json ===" && \
    cat tsconfig.json

# Compile TypeScript to JavaScript
RUN npx tsc

# Remove dev dependencies after compilation
RUN npm prune --production

# Set environment
ENV NODE_ENV=production

# Run the compiled JavaScript
CMD ["node", "dist/apps/workers/src/worker.js"]
