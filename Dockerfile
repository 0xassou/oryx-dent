# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat

# --- Builder ---
FROM base AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG BETTER_AUTH_SECRET
ARG DATABASE_URL
ARG BETTER_AUTH_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_CLINIC_ID
ARG NEXT_PUBLIC_ORYX_CABINET_ID
ARG CLINIC_ID

ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
ENV DATABASE_URL=$DATABASE_URL
ENV BETTER_AUTH_URL=$BETTER_AUTH_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_CLINIC_ID=$NEXT_PUBLIC_CLINIC_ID
ENV NEXT_PUBLIC_ORYX_CABINET_ID=$NEXT_PUBLIC_ORYX_CABINET_ID
ENV CLINIC_ID=$CLINIC_ID

RUN npm run build

# --- Runner (standalone) ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
