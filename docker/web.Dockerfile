FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/card-render/package.json packages/card-render/
RUN pnpm install --frozen-lockfile --filter @wm/web... --filter wristmasters-tcg --ignore-scripts
COPY . .
ARG VITE_UMAMI_WEBSITE_ID=
ARG VITE_UMAMI_SRC=
RUN pnpm --filter @wm/web build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
