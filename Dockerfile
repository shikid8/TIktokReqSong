# ─── BUILD STAGE ──────────────────────────────────────────────
FROM node:22-alpine AS base

WORKDIR /app

# Install dependencies terlebih dahulu (layer cache-friendly)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Hapus file yang tidak perlu di production
RUN rm -f .env .env.example

# ─── RUNTIME ──────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Copy dari base stage
COPY --from=base /app /app

# User non-root untuk keamanan
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nodejs -u 1001
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Start
ENV NODE_ENV=production
CMD ["node", "index.js"]
