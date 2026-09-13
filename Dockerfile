# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install openssl for Prisma
RUN apk add --no-cache openssl openssl-dev libc6-compat

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies
RUN npm ci

# Copy source
COPY . .

# Generate Prisma client (with linux-musl target)
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Install openssl (required by Prisma at runtime)
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Install only production deps
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production

# Re-generate Prisma client for this Alpine environment
RUN npx prisma generate

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create entrypoint script that runs db push then starts server
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo 'echo "Running Prisma DB push..."' >> /entrypoint.sh && \
    echo 'npx prisma db push --skip-generate' >> /entrypoint.sh && \
    echo 'echo "Starting server..."' >> /entrypoint.sh && \
    echo 'exec node dist/server.js' >> /entrypoint.sh && \
    chmod +x /entrypoint.sh

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

EXPOSE 7860

ENV PORT=7860
ENV NODE_ENV=production

CMD ["/entrypoint.sh"]