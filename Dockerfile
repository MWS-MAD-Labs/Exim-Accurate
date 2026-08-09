FROM node:22-alpine AS builder
WORKDIR /app

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Generate Prisma client and build
RUN npx prisma generate
RUN npm run build

# Prune dev dependencies for smaller runtime image
RUN npm prune --production

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=5758

# Non-root user for runtime
RUN addgroup -g 1002 -S nodejs && adduser -S -u 1002 -G nodejs appuser

# Copy built assets and dependencies
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.* ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/entrypoint.sh ./entrypoint.sh

USER appuser

EXPOSE 5758

ENTRYPOINT ["./entrypoint.sh"]
CMD ["npm", "run", "start"]
