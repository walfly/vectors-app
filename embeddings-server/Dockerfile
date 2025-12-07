FROM node:22-alpine AS builder

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable

COPY package.json pnpm-lock.yaml tsconfig.json vitest.config.mts ./
COPY src ./src

RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM node:22-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

EXPOSE 4000

CMD ["node", "dist/server.js"]
