FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lockb ./
RUN npm install -g bun && bun install --frozen-lockfile
COPY . .
# NEXT_PUBLIC_* values are baked in at build time.
ARG NEXT_PUBLIC_BOT_ADDRESS NEXT_PUBLIC_APP_SHORT_NAME NEXT_PUBLIC_TELEGRAM_CHANNEL \
    NEXT_PUBLIC_YOUTUBE_CHANNEL NEXT_PUBLIC_TWITTER_CHANNEL NEXT_PUBLIC_GOOGLE_ANALYTICS_ID
RUN rm -f .env.local && bun run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATABASE_PATH=/data/valorians.db PORT=3000
COPY --from=build /app ./
VOLUME /data
EXPOSE 3000
CMD ["npx", "next", "start"]
