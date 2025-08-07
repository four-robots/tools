# Multi-stage Docker build for MCP Tools

# Stage 1: Dependencies (using npm workspaces)
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy workspace package files (including package-lock.json)
COPY package*.json ./
COPY core/package*.json ./core/
COPY gateway/package*.json ./gateway/
COPY workers/embeddings/package*.json ./workers/embeddings/
COPY workers/markitdown/package*.json ./workers/markitdown/
COPY servers/kanban/package*.json ./servers/kanban/
COPY servers/wiki/package*.json ./servers/wiki/
COPY servers/memory/package*.json ./servers/memory/
COPY web/package*.json ./web/
COPY migrations/package*.json ./migrations/

# Install all workspace dependencies including dev dependencies for build
RUN npm ci --workspaces

# Stage 2: Production Dependencies
FROM node:22-alpine AS prod-deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy workspace package files
COPY package*.json ./
COPY core/package*.json ./core/
COPY gateway/package*.json ./gateway/
COPY workers/embeddings/package*.json ./workers/embeddings/
COPY workers/markitdown/package*.json ./workers/markitdown/
COPY servers/kanban/package*.json ./servers/kanban/
COPY servers/wiki/package*.json ./servers/wiki/
COPY servers/memory/package*.json ./servers/memory/
COPY web/package*.json ./web/
COPY migrations/package*.json ./migrations/

# Install only production dependencies
RUN npm ci --workspaces --omit=dev

# Stage 3: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace dependencies (npm workspaces handles linking)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/*/node_modules ./*/node_modules

# Copy workspace package files and source code
COPY package*.json ./
COPY . .

# Build all workspaces (core will be built first due to dependency order)
RUN npm run build --workspaces --if-present

# Stage 3: Gateway Service
FROM node:22-alpine AS gateway
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 gateway

# Copy built gateway
COPY --from=builder --chown=gateway:nodejs /app/gateway/dist ./gateway/dist
COPY --from=builder --chown=gateway:nodejs /app/gateway/package*.json ./gateway/
COPY --from=builder --chown=gateway:nodejs /app/core/dist ./core/dist
COPY --from=builder --chown=gateway:nodejs /app/core/package*.json ./core/

# Copy workspace node_modules (shared across all workspaces)
COPY --from=prod-deps --chown=gateway:nodejs /app/node_modules ./node_modules

USER gateway

EXPOSE 3000

WORKDIR /app/gateway
CMD ["npm", "start"]

# Stage 4: Embeddings Worker
FROM node:22-alpine AS embeddings-worker
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

# Copy built worker
COPY --from=builder --chown=worker:nodejs /app/workers/embeddings/dist ./workers/embeddings/dist
COPY --from=builder --chown=worker:nodejs /app/workers/embeddings/package*.json ./workers/embeddings/
COPY --from=builder --chown=worker:nodejs /app/core/dist ./core/dist
COPY --from=builder --chown=worker:nodejs /app/core/package*.json ./core/

# Copy workspace node_modules (shared across all workspaces)
COPY --from=prod-deps --chown=worker:nodejs /app/node_modules ./node_modules

USER worker

WORKDIR /app/workers/embeddings
CMD ["npm", "start"]

# Stage 5: Web Client
FROM node:22-alpine AS web
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built Next.js app
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/static ./web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/web/public ./web/public

USER nextjs

EXPOSE 3001

ENV PORT 3001
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]

# Stage 6: Markitdown Worker
FROM node:22-alpine AS markitdown-worker
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

# Copy built worker
COPY --from=builder --chown=worker:nodejs /app/workers/markitdown/dist ./workers/markitdown/dist
COPY --from=builder --chown=worker:nodejs /app/workers/markitdown/package*.json ./workers/markitdown/
COPY --from=builder --chown=worker:nodejs /app/core/dist ./core/dist
COPY --from=builder --chown=worker:nodejs /app/core/package*.json ./core/

# Copy workspace node_modules (shared across all workspaces)
COPY --from=prod-deps --chown=worker:nodejs /app/node_modules ./node_modules

USER worker

WORKDIR /app/workers/markitdown
CMD ["npm", "start"]

# Stage 7: Kanban MCP Server
FROM node:22-alpine AS kanban-server
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 mcp

# Copy built server
COPY --from=builder --chown=mcp:nodejs /app/servers/kanban/dist ./servers/kanban/dist
COPY --from=builder --chown=mcp:nodejs /app/servers/kanban/package*.json ./servers/kanban/
COPY --from=builder --chown=mcp:nodejs /app/core/dist ./core/dist
COPY --from=builder --chown=mcp:nodejs /app/core/package*.json ./core/

# Copy workspace node_modules (shared across all workspaces)
COPY --from=prod-deps --chown=mcp:nodejs /app/node_modules ./node_modules

USER mcp

EXPOSE 3002

WORKDIR /app/servers/kanban
CMD ["npm", "start"]

# Stage 8: Wiki MCP Server
FROM node:22-alpine AS wiki-server
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 mcp

# Copy built server
COPY --from=builder --chown=mcp:nodejs /app/servers/wiki/dist ./servers/wiki/dist
COPY --from=builder --chown=mcp:nodejs /app/servers/wiki/package*.json ./servers/wiki/
COPY --from=builder --chown=mcp:nodejs /app/core/dist ./core/dist
COPY --from=builder --chown=mcp:nodejs /app/core/package*.json ./core/

# Copy workspace node_modules (shared across all workspaces)
COPY --from=prod-deps --chown=mcp:nodejs /app/node_modules ./node_modules

USER mcp

EXPOSE 3003

WORKDIR /app/servers/wiki
CMD ["npm", "start"]

# Stage 9: Memory MCP Server
FROM node:22-alpine AS memory-server
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 mcp

# Copy built server
COPY --from=builder --chown=mcp:nodejs /app/servers/memory/dist ./servers/memory/dist
COPY --from=builder --chown=mcp:nodejs /app/servers/memory/package*.json ./servers/memory/
COPY --from=builder --chown=mcp:nodejs /app/core/dist ./core/dist
COPY --from=builder --chown=mcp:nodejs /app/core/package*.json ./core/

# Copy workspace node_modules (shared across all workspaces)
COPY --from=prod-deps --chown=mcp:nodejs /app/node_modules ./node_modules

USER mcp

EXPOSE 3004

WORKDIR /app/servers/memory
CMD ["npm", "start"]

# Stage 10: Database Migrations
FROM node:22-alpine AS migrations
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 migration

# Copy built migrations
COPY --from=builder --chown=migration:nodejs /app/migrations/dist ./migrations/dist
COPY --from=builder --chown=migration:nodejs /app/migrations/package*.json ./migrations/

# Copy workspace node_modules (shared across all workspaces)
COPY --from=prod-deps --chown=migration:nodejs /app/node_modules ./node_modules

USER migration

WORKDIR /app/migrations
CMD ["npm", "start"]