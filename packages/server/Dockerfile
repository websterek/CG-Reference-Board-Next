# Multi-stage server Dockerfile (task 11.1).
# Build target: Node 20, non-root runtime.

# ----- 1. deps (install all workspace deps) -----
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY packages/domain/package.json packages/domain/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile || pnpm install

# ----- 2. build domain (used by server) -----
FROM deps AS build-domain
COPY packages/domain packages/domain
RUN pnpm --filter @gridboard/domain build

# ----- 3. build server -----
FROM build-domain AS build-server
COPY packages/server packages/server
RUN pnpm --filter @gridboard/server build

# ----- 4. runtime (non-root, slim) -----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
RUN corepack enable
WORKDIR /app
# Install only production deps for the server + domain.
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY packages/domain/package.json packages/domain/
COPY packages/server/package.json packages/server/
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod
COPY --from=build-server /app/packages/domain/dist packages/domain/dist
COPY --from=build-server /app/packages/server/dist packages/server/dist
COPY packages/server/drizzle.config.ts packages/server/
RUN addgroup -g 1001 gridboard && adduser -S -u 1001 -G gridboard gridboard
RUN mkdir -p /app/uploads && chown gridboard:gridboard /app/uploads
USER gridboard
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1
CMD ["node", "packages/server/dist/index.js"]
