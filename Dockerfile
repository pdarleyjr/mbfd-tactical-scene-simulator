FROM node:24.18.0-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json vitest.config.ts ./
COPY packages ./packages
COPY apps/server ./apps/server
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mbfd/domain build && pnpm --filter @mbfd/fire-model build && pnpm --filter @mbfd/collaboration build && pnpm --filter @mbfd/server build
RUN pnpm --filter @mbfd/server deploy --prod /release

FROM node:24.18.0-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /release ./
COPY --from=build /workspace/apps/server/drizzle ./apps/server/drizzle
EXPOSE 3000 1234
CMD ["node", "dist/index.js"]
