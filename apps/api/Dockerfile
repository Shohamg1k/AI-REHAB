# Multi-stage build for apps/api. Built from the monorepo root so pnpm's
# workspace linking (packages/contracts as a workspace: dependency) resolves
# the same way it does in development — see docker-compose.yml's build
# context, which is `.` (repo root), not this directory.

FROM node:20-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
# A minimal, valid package.json per workspace member pnpm needs to resolve
# — without these, `pnpm install --frozen-lockfile` fails trying to read
# packages this image never builds or runs.
COPY packages/core/package.json packages/core/package.json
COPY packages/exercises/package.json packages/exercises/package.json
COPY packages/eval/package.json packages/eval/package.json
COPY apps/patient/package.json apps/patient/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @ai-rehab/contracts run build
RUN pnpm --filter @ai-rehab/api run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /repo/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/migrations ./apps/api/migrations
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json

WORKDIR /repo/apps/api
EXPOSE 3001
# Migrate then serve — compiled JS, not the tsx dev script, so the
# production image doesn't need tsx or any devDependency at all.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
