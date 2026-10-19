FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY prisma prisma
RUN pnpm install --frozen-lockfile --filter @wm/api... --filter wristmasters-tcg
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY tools/dial-painter/plates.json tools/dial-painter/plates.json
COPY packages/ingest/data packages/ingest/data
WORKDIR /app/apps/api
RUN pnpm exec prisma generate
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm start"]
