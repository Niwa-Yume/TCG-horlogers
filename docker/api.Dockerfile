FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/card-render/package.json packages/card-render/
COPY packages/engine/package.json packages/engine/
COPY prisma prisma
RUN pnpm install --frozen-lockfile --filter @wm/api... --filter wristmasters-tcg
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/card-render packages/card-render
COPY packages/engine packages/engine
COPY apps/api apps/api
COPY tools/dial-painter/plates.json tools/dial-painter/plates.json
COPY packages/ingest/data packages/ingest/data
# images de partage : polices et copies JPEG des cadrans
COPY assets/fonts assets/fonts
COPY assets/dials assets/dials
WORKDIR /app/apps/api
RUN pnpm exec prisma generate
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm start"]
