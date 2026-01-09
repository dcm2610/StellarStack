# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
WORKDIR /app

# ============================================
# Deps (single install)
# ============================================
FROM base AS deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile --filter=@workspace/api...

# ============================================
# Build
# ============================================
FROM base AS builder

COPY --from=deps /app /app
COPY packages ./packages
COPY apps/api ./apps/api
COPY turbo.json ./

WORKDIR /app/apps/api
RUN pnpm prisma generate
RUN pnpm build

# ============================================
# Runtime
# ============================================
FROM node:20-alpine AS runner

RUN apk add --no-cache tini
WORKDIR /app

RUN addgroup -g 1001 -S nodejs \
 && adduser -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

USER nodejs

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=::

EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
