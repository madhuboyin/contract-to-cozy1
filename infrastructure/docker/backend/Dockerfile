# Backend Dockerfile - Node.js API
# Multi-stage build optimized for Raspberry Pi (ARM64)

# Stage 1: Production dependencies only
FROM node:22-alpine AS deps
WORKDIR /app

RUN apk add --no-cache python3 make g++ openssl openssl-dev

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Prisma generation (isolated — only schema + packages, no source)
# Uses a glibc (Debian slim) base instead of Alpine/musl for this stage only —
# generating the client for this schema (270+ models, ~2MB output file) hit a
# silent short-write truncation on Alpine when built natively on the
# Raspberry Pi cluster; glibc doesn't exhibit the same issue.
FROM node:22-slim AS prisma-gen
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

# Copy ONLY the prisma directory — no src, no local node_modules
COPY prisma ./prisma

# Generate Prisma client on the clean npm ci install
RUN npx prisma generate --schema=./prisma/schema.prisma

# Stage 3: TypeScript compilation (source only — no COPY .)
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++ openssl openssl-dev

COPY package*.json ./
COPY tsconfig*.json ./
RUN npm ci

# Bring in the generated Prisma client so tsc can resolve @prisma/client types
COPY --from=prisma-gen /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prisma-gen /app/node_modules/@prisma ./node_modules/@prisma

# Copy only source files — never node_modules from local machine
COPY src ./src
COPY prisma ./prisma

RUN npm run build

# Stage 4: Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache \
    postgresql-client \
    curl \
    openssl \
    openssl-dev \
    libc6-compat \
    leptonica-dev

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Production node_modules from the clean deps stage
COPY --from=deps /app/node_modules ./node_modules

# Prisma client from the isolated generation stage
COPY --from=prisma-gen /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prisma-gen /app/node_modules/@prisma ./node_modules/@prisma

# Compiled application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Prisma schema (needed for migrations / runtime)
COPY prisma ./prisma

RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

CMD ["node", "dist/index.js"]
