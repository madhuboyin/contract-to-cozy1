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

# Stage 2: Builder (Replacement block for lines ~21 to 39 in your Dockerfile)
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# 1. Copy worker app setup files
# Assumes package*.json and tsconfig.json are for the worker app
COPY package*.json ./
COPY tsconfig*.json ./

# Install all dependencies
RUN npm ci

# 2. Copy worker source code and required backend files to match imports:
# The worker source (worker.ts) goes into /app/src.
COPY apps/workers/src/ ./src 

# The worker.ts imports use '../../backend/src/...', which resolves to /app/backend/src/
# We copy the backend source folders into the correct sibling path inside the container.
COPY apps/backend/src/services/ ./backend/src/services/
COPY apps/backend/src/config/ ./backend/src/config/
COPY apps/backend/src/utils/ ./backend/src/utils/

# 3. Copy the schema required for client generation
COPY apps/backend/prisma/schema.prisma ./prisma/schema.prisma

# Build TypeScript
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

# FIX: Removed embedded citation tags to resolve the build error
HEALTHCHECK --interval=60s --timeout=3s --start-period=60s --retries=3 \
 CMD pgrep -f "node dist/worker.js" || exit 1

CMD ["node", "dist/worker.js"]