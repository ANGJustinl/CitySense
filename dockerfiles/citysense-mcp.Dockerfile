# CitySense MCP server (HTTP transport) — for remote agent access.
# Run via docker-compose.citysense-mcp.yml.
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Install prod dependencies only.
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Runtime image.
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=18070

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY prisma ./prisma
COPY server ./server
COPY components/city/route-display.ts ./components/city/route-display.ts

# Generate the Prisma client (needed at runtime by the recommendation tools).
RUN pnpm prisma:generate || npx prisma generate

EXPOSE 18070

# Stateless Streamable HTTP server with bearer-token auth.
CMD ["node", "--import", "tsx", "server/mcp/http-server.ts"]
