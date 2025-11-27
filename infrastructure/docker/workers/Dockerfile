# Workers Dockerfile - Background Jobs
# Multi-stage build optimized for Raspberry Pi (ARM64)

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# FIX: Explicitly copy worker's package files from the monorepo root context
COPY apps/workers/package.json ./
COPY apps/workers/package-lock.json ./

# Install production dependencies
# Added --no-audit to prevent potential network/speed issues in limited environments
RUN npm ci --only=production --no-audit && \
    npm cache clean --force

# Stage 2: Builder (Starting after WORKDIR /app and after RUN apk add)

# 1. Copy worker app setup files
COPY apps/workers/package.json ./
COPY apps/workers/package-lock.json ./
COPY apps/workers/tsconfig.json ./tsconfig.json

# Install all dependencies
RUN npm ci --no-audit

# 2. Copy worker source code
# This copies apps/workers/src/* to /app/src/
COPY apps/workers/src/ ./src 

# 3. CRITICAL FIX: Copy the entire necessary backend directory structure
# This copies apps/backend/src/ (containing services, config, lib, utils, etc.) 
# to /app/backend/src/, which correctly resolves the worker's '../../backend/src/' imports.
COPY apps/backend/src/ ./backend/src/

# 4. Copy the schema required for client generation
COPY apps/backend/prisma/schema.prisma ./prisma/schema.prisma

RUN npx prisma generate --schema=./prisma/schema.prisma
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

# Copy generated Prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Set correct permissions
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 9090

HEALTHCHECK --interval=60s --timeout=3s --start-period=60s --retries=3 \
 CMD pgrep -f "node dist/worker.js" || exit 1

CMD ["node", "dist/worker.js"]