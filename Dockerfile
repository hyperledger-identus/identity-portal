# syntax=docker/dockerfile:1
#
# Standalone image for the Identity Portal. It bundles the Express server
# (dist/main.cjs) and builds the React UI (dist/ui), then serves both from a
# single Node process in production mode. Supporting services (MongoDB, Redis,
# Keycloak, neoprism, mediator) run separately — point the container at them via
# environment variables (see .env.example).

# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Some dependencies ship native addons that compile on install.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install all dependencies (dev deps are needed to build the UI and bundle the
# server). Kept in a separate layer so it is only re-run when the manifest
# changes.
COPY package.json package-lock.json ./
RUN npm ci

# Build the UI (vite -> dist/ui) and the server bundle (esbuild -> dist/main.cjs).
COPY tsconfig.json vite.config.ts tailwind.config.cjs postcss.config.cjs esbuild.config.mjs ./
COPY src ./src
RUN NODE_ENV=production npm run build

# Strip dev dependencies so only runtime deps are carried into the final image.
RUN npm prune --omit=dev

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]
