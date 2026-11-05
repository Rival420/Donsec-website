# Build image for donsec.be — no build tooling on the host.
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .

FROM base AS build
ARG PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
ENV PUBLIC_TURNSTILE_SITE_KEY=$PUBLIC_TURNSTILE_SITE_KEY
RUN npm run build
