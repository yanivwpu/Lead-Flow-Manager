# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --ignore-scripts --strict-ssl=true
COPY . .
RUN ./node_modules/.bin/esbuild scripts/smoke-shopify-privacy-email.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/privacy-email-smoke.cjs
RUN npm prune --omit=dev --ignore-scripts

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist/privacy-email-smoke.cjs ./dist/privacy-email-smoke.cjs
USER node
CMD ["node", "dist/privacy-email-smoke.cjs", "--railway-one-shot"]
