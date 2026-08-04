FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

FROM base AS deps

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS builder

WORKDIR /app
ARG NEXT_PUBLIC_AMAP_JS_API_KEY=""
ARG NEXT_PUBLIC_AMAP_SECURITY_JS_CODE=""
ENV NEXT_PUBLIC_AMAP_JS_API_KEY=$NEXT_PUBLIC_AMAP_JS_API_KEY
ENV NEXT_PUBLIC_AMAP_SECURITY_JS_CODE=$NEXT_PUBLIC_AMAP_SECURITY_JS_CODE

COPY . .
RUN pnpm prisma:generate
RUN pnpm build

FROM deps AS migrate

WORKDIR /app
ENV NODE_ENV=production
COPY prisma ./prisma
COPY package.json pnpm-lock.yaml ./
RUN pnpm prisma:generate
CMD ["pnpm", "prisma:migrate:deploy"]

FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
