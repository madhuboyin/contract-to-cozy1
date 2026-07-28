# Backend Dockerfile - Node.js API
# Multi-stage build optimized for Raspberry Pi (ARM64)

# Pin the multi-architecture Debian base manifest. A floating Alpine tag
# previously changed the libc/runtime underneath an unchanged application
# build and exposed an incompatible Prisma native engine.
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3

# Stage 1: Production dependencies only
FROM ${NODE_IMAGE} AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
# The API compiles to CommonJS. Fail the image build if the installed SDK's
# require export is malformed or a stale dependency layer contains ESM syntax.
RUN node -e "const sdk = require('@google/genai'); if (typeof sdk.GoogleGenAI !== 'function') throw new Error('@google/genai CommonJS export is invalid')"
# Prisma's CLI loads this WASM before it can run db push. Compile it now and
# retain its digest so a truncated file or damaged cross-stage copy cannot
# reach the migration Job.
RUN node -e "const fs=require('fs'); const wasm=fs.readFileSync('node_modules/prisma/build/prisma_schema_build_bg.wasm'); new WebAssembly.Module(wasm);" \
    && ./node_modules/.bin/prisma --version \
    && sha256sum node_modules/prisma/build/prisma_schema_build_bg.wasm > /tmp/prisma-schema-wasm.sha256

# Stage 2: Prisma generation (isolated — only schema + packages, no source)
# Keep Prisma generation and runtime on the same libc family. Generating the
# client for this schema (270+ models, ~2MB output file) previously hit a
# silent short-write truncation on Alpine, and an Alpine runner later failed to
# load the generated ARM64 musl engine. Debian/glibc avoids both mismatches.
FROM ${NODE_IMAGE} AS prisma-gen
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
FROM ${NODE_IMAGE} AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY tsconfig*.json ./
RUN npm ci

# Bring in the generated Prisma client so tsc can resolve @prisma/client types
COPY --from=prisma-gen /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prisma-gen /app/node_modules/@prisma ./node_modules/@prisma

# Copy only source files — never node_modules from local machine
COPY src ./src
COPY prisma ./prisma

# The backend's strict TypeScript graph includes the generated Prisma surface
# and now exceeds V8's container-default ~2 GB old-space limit. Increase the
# heap only for compilation; the runner keeps its normal production limits.
RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build

# Stage 4: Runner
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    curl \
    openssl \
    libssl3 \
    ca-certificates \
    liblept5 \
    && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Production node_modules from the clean deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /tmp/prisma-schema-wasm.sha256 /tmp/prisma-schema-wasm.sha256

# Prisma client from the isolated generation stage
COPY --from=prisma-gen /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prisma-gen /app/node_modules/@prisma ./node_modules/@prisma

# Compiled application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Recheck the exact dependency tree shipped in the final runtime image.
RUN node -e "const sdk = require('@google/genai'); if (typeof sdk.GoogleGenAI !== 'function') throw new Error('@google/genai CommonJS export is invalid')"
# Load the exact Prisma native module shipped in the runner. This catches
# architecture, libc, OpenSSL, and corrupted-engine failures during image
# construction instead of after the pod begins serving traffic.
RUN node -e "const fs=require('fs'); const path=require('path'); const dir=path.resolve('node_modules/.prisma/client'); const engines=fs.readdirSync(dir).filter((name)=>name.startsWith('libquery_engine')&&name.endsWith('.so.node')); if(engines.length!==1) throw new Error('Expected exactly one Prisma query engine, found '+engines.join(',')); require(path.join(dir,engines[0]));"
# Verify both byte integrity and executability after all dependency-stage
# copies. `prisma --version` exercises the same schema WASM load that failed in
# the production db-push Job.
RUN sha256sum --check /tmp/prisma-schema-wasm.sha256 \
    && node -e "const fs=require('fs'); const wasm=fs.readFileSync('node_modules/prisma/build/prisma_schema_build_bg.wasm'); new WebAssembly.Module(wasm);" \
    && ./node_modules/.bin/prisma --version

# Prisma schema (needed for migrations / runtime)
COPY prisma ./prisma
# Exercise the exact CLI + schema path shipped to migration Jobs. The URL is a
# syntactically valid build-only placeholder; validation does not connect.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    ./node_modules/.bin/prisma validate --schema=./prisma/schema.prisma

RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

CMD ["node", "dist/index.js"]
