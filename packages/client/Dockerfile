# Single-stage client Dockerfile (task 11.2).
# Production nginx reverse-proxy is deferred to the production-hardening milestone
# per design.md D6. For v1, vite preview serves the static SPA build.
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY packages/domain/package.json packages/domain/
COPY packages/client/package.json packages/client/
RUN pnpm install
COPY packages/domain packages/domain
COPY packages/client packages/client
RUN pnpm --filter @gridboard/client build

# Serve the built SPA on port 8080. We use vite preview, which is suitable
# for a first milestone; production nginx would be a drop-in replacement.
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8080 || exit 1
CMD ["pnpm", "--filter", "@gridboard/client", "preview", "--host", "0.0.0.0", "--port", "8080"]
